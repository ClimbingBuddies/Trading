create or replace function strategy_lab.evaluate_standard_strategy_review_v1(p_test_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.trading_test_runs%rowtype;
  v_tree public.trading_decision_trees%rowtype;
  v_node public.trading_decision_nodes%rowtype;
  v_edge public.trading_decision_edges%rowtype;
  v_existing public.trading_decision_evaluations%rowtype;
  v_current_node_id uuid;
  v_metric_value numeric;
  v_result boolean;
  v_path jsonb := '[]'::jsonb;
  v_step integer := 0;
  v_evaluation_id uuid;
begin
  select * into v_run
  from public.trading_test_runs
  where id = p_test_run_id;

  if not found then
    raise exception 'Unknown test_run_id %', p_test_run_id;
  end if;

  if v_run.run_status <> 'succeeded' then
    raise exception 'Standard Strategy Review requires a succeeded test run';
  end if;

  if v_run.ingestion_version <> 'strategy-test-ingestion-v1'
     or v_run.metric_definition_version <> 'strategy-test-metrics-v1' then
    raise exception 'Unsupported test-run evidence contract: ingestion %, metrics %',
      v_run.ingestion_version, v_run.metric_definition_version;
  end if;

  select * into v_tree
  from public.trading_decision_trees
  where tree_code = 'STANDARD_STRATEGY_REVIEW'
    and version = 1
    and is_system_template = true
    and is_active = true;

  if not found then
    raise exception 'Active STANDARD_STRATEGY_REVIEW v1 tree not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('STANDARD_STRATEGY_REVIEW:' || p_test_run_id::text, 0)
  );

  select * into v_existing
  from public.trading_decision_evaluations
  where test_run_id = p_test_run_id
    and tree_id = v_tree.id;

  if found then
    return jsonb_build_object(
      'status', 'already_complete',
      'evaluation_id', v_existing.id,
      'test_run_id', v_existing.test_run_id,
      'tree_id', v_existing.tree_id,
      'outcome_code', v_existing.outcome_code,
      'outcome_status', v_existing.outcome_status,
      'decision_path', v_existing.decision_path,
      'evaluated_at', v_existing.evaluated_at
    );
  end if;

  select id into v_current_node_id
  from public.trading_decision_nodes
  where tree_id = v_tree.id
    and node_code = 'START'
    and node_type = 'start';

  if v_current_node_id is null then
    raise exception 'STANDARD_STRATEGY_REVIEW v1 START node not found';
  end if;

  loop
    v_step := v_step + 1;
    if v_step > 20 then
      raise exception 'Decision tree traversal exceeded 20 steps';
    end if;

    select * into v_node
    from public.trading_decision_nodes
    where id = v_current_node_id
      and tree_id = v_tree.id;

    if not found then
      raise exception 'Decision node % not found in review tree', v_current_node_id;
    end if;

    if v_node.node_type = 'outcome' then
      if v_node.outcome_code is null or v_node.outcome_status is null then
        raise exception 'Outcome node % is incomplete', v_node.node_code;
      end if;

      v_path := v_path || jsonb_build_array(jsonb_build_object(
        'step', v_step,
        'node_code', v_node.node_code,
        'node_type', v_node.node_type,
        'title', v_node.title,
        'outcome_code', v_node.outcome_code,
        'outcome_status', v_node.outcome_status,
        'tree_code', v_tree.tree_code,
        'tree_version', v_tree.version,
        'test_run_key', v_run.run_key,
        'strategy_snapshot_hash', v_run.strategy_snapshot_hash
      ));

      insert into public.trading_decision_evaluations (
        owner_user_id, test_run_id, tree_id, final_node_id,
        outcome_code, outcome_status, decision_path, evaluated_at
      ) values (
        v_run.owner_user_id, v_run.id, v_tree.id, v_node.id,
        v_node.outcome_code, v_node.outcome_status, v_path, clock_timestamp()
      )
      returning id into v_evaluation_id;

      return jsonb_build_object(
        'status', 'succeeded',
        'evaluation_id', v_evaluation_id,
        'test_run_id', v_run.id,
        'tree_id', v_tree.id,
        'tree_code', v_tree.tree_code,
        'tree_version', v_tree.version,
        'outcome_code', v_node.outcome_code,
        'outcome_status', v_node.outcome_status,
        'decision_path', v_path
      );
    end if;

    if v_node.node_type = 'start' then
      select * into v_edge
      from public.trading_decision_edges
      where tree_id = v_tree.id
        and from_node_id = v_node.id
        and result_value is null
      order by sort_order, id
      limit 1;

      if not found then
        raise exception 'Start node % has no unconditional edge', v_node.node_code;
      end if;

      v_path := v_path || jsonb_build_array(jsonb_build_object(
        'step', v_step,
        'node_code', v_node.node_code,
        'node_type', v_node.node_type,
        'title', v_node.title,
        'edge_label', v_edge.edge_label,
        'next_node_id', v_edge.to_node_id,
        'tree_code', v_tree.tree_code,
        'tree_version', v_tree.version,
        'test_run_key', v_run.run_key,
        'strategy_snapshot_hash', v_run.strategy_snapshot_hash
      ));

      v_current_node_id := v_edge.to_node_id;
      continue;
    end if;

    if v_node.node_type <> 'decision' then
      raise exception 'Unsupported node type % for %', v_node.node_type, v_node.node_code;
    end if;

    v_metric_value := case v_node.metric_code
      when 'trade_count' then v_run.trade_count::numeric
      when 'expectancy' then v_run.expectancy
      when 'profit_factor' then v_run.profit_factor
      when 'max_drawdown_pct' then v_run.max_drawdown_pct
      when 'out_of_sample_return_pct' then v_run.out_of_sample_return_pct
      else null
    end;

    if v_metric_value is null then
      raise exception 'Required metric % is missing or unsupported for node %', v_node.metric_code, v_node.node_code;
    end if;

    v_result := case v_node.comparison_operator
      when '>=' then v_metric_value >= v_node.threshold_value
      when '>'  then v_metric_value >  v_node.threshold_value
      when '<=' then v_metric_value <= v_node.threshold_value
      when '<'  then v_metric_value <  v_node.threshold_value
      when '='  then v_metric_value =  v_node.threshold_value
      when '!=' then v_metric_value <> v_node.threshold_value
      else null
    end;

    if v_result is null then
      raise exception 'Unsupported comparison operator % at node %', v_node.comparison_operator, v_node.node_code;
    end if;

    select * into v_edge
    from public.trading_decision_edges
    where tree_id = v_tree.id
      and from_node_id = v_node.id
      and result_value = v_result
    order by sort_order, id
    limit 1;

    if not found then
      raise exception 'No edge for node % result %', v_node.node_code, v_result;
    end if;

    v_path := v_path || jsonb_build_array(jsonb_build_object(
      'step', v_step,
      'node_code', v_node.node_code,
      'node_type', v_node.node_type,
      'title', v_node.title,
      'metric_code', v_node.metric_code,
      'metric_value', v_metric_value,
      'comparison_operator', v_node.comparison_operator,
      'threshold_value', v_node.threshold_value,
      'result', v_result,
      'edge_label', v_edge.edge_label,
      'next_node_id', v_edge.to_node_id,
      'tree_code', v_tree.tree_code,
      'tree_version', v_tree.version,
      'test_run_key', v_run.run_key,
      'strategy_snapshot_hash', v_run.strategy_snapshot_hash
    ));

    v_current_node_id := v_edge.to_node_id;
  end loop;
end;
$$;

revoke all on function strategy_lab.evaluate_standard_strategy_review_v1(uuid) from public, anon, authenticated;
grant execute on function strategy_lab.evaluate_standard_strategy_review_v1(uuid) to service_role;

comment on function strategy_lab.evaluate_standard_strategy_review_v1(uuid) is
'STRAT-004 trusted idempotent evaluator for STANDARD_STRATEGY_REVIEW v1. Traverses persisted tree nodes/edges against immutable succeeded strategy-test evidence and persists the exact decision path/outcome without changing the strategy or test run.';