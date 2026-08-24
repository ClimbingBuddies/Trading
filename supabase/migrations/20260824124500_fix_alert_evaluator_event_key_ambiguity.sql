create or replace function alerting.evaluate_one_v1(p_alert_id uuid, p_now timestamptz default clock_timestamp())
returns integer language plpgsql security definer set search_path = '' as $$
declare a public.alerts%rowtype; sc record; st public.alert_evaluation_state%rowtype; source_key text; source_table text; source_at timestamptz; current_value jsonb; current_conf numeric; methodology text; metric text; op text; threshold numeric; min_conf numeric := 0; current_text text; prior_text text; current_num numeric; prior_num numeric; current_truth boolean; should_trigger boolean; new_rearm integer; v_event_key text; event_inserted bigint; created_events integer := 0; status_value text; inst record; latest_obs record;
begin
  select * into a from public.alerts where id=p_alert_id and is_enabled=true;
  if not found then return 0; end if;
  metric := a.condition ->> 'metric'; op := a.condition ->> 'operator';
  if a.condition ? 'threshold' then threshold := (a.condition ->> 'threshold')::numeric; end if;
  if a.condition ? 'minimum_confidence' then min_conf := (a.condition ->> 'minimum_confidence')::numeric; end if;

  if a.theme_id is not null then
    for sc in select null::uuid as instrument_id, a.theme_id as theme_id loop
      source_key := null; source_table := null; source_at := null; current_value := null; current_conf := null; methodology := null;
      select oa.id::text, 'opportunity_assessments', oa.updated_at,
        case metric when 'opportunity_level' then jsonb_build_object('value',oa.opportunity_level) when 'opportunity_score' then jsonb_build_object('value',oa.opportunity_score) when 'commercial_readiness' then jsonb_build_object('value',oa.commercial_readiness) end,
        oa.opportunity_confidence, oa.methodology_version
      into source_key,source_table,source_at,current_value,current_conf,methodology
      from public.opportunity_assessments oa where oa.theme_id=sc.theme_id
      order by oa.assessment_date desc, oa.updated_at desc, oa.id desc limit 1;
      if source_key is null or (current_conf is not null and current_conf < min_conf) then continue; end if;
      select * into st from public.alert_evaluation_state s where s.alert_id=a.id and s.theme_id=sc.theme_id limit 1;
      if not found then
        insert into public.alert_evaluation_state(alert_id,theme_id,last_source_key,last_source_table,last_source_at,last_value,condition_true,last_evaluated_at,updated_at)
        values(a.id,sc.theme_id,source_key,source_table,source_at,current_value,false,p_now,p_now);
        continue;
      end if;
      if st.last_source_key is not distinct from source_key then update public.alert_evaluation_state set last_evaluated_at=p_now,updated_at=p_now where id=st.id; continue; end if;
      current_text := current_value ->> 'value'; prior_text := st.last_value ->> 'value'; should_trigger := false; current_truth := false;
      if op='enters_value' then current_truth := exists(select 1 from jsonb_array_elements_text(a.condition -> 'values') v where v=current_text); should_trigger := current_truth and not coalesce(st.condition_true,false);
      elsif op='crosses_above' then current_num:=current_text::numeric; prior_num:=nullif(prior_text,'')::numeric; current_truth:=current_num>threshold; should_trigger:=prior_num<=threshold and current_num>threshold;
      elsif op='crosses_below' then current_num:=current_text::numeric; prior_num:=nullif(prior_text,'')::numeric; current_truth:=current_num<threshold; should_trigger:=prior_num>=threshold and current_num<threshold;
      end if;
      new_rearm:=st.rearm_cycle; if coalesce(st.condition_true,false) and not current_truth then new_rearm:=new_rearm+1; end if;
      if should_trigger then
        v_event_key:=source_key||':'||coalesce(metric,'value')||':'||op;
        event_inserted:=null;
        insert into public.alert_events(alert_id,theme_id,triggered_at,trigger_value,message,notification_status,event_key,metadata)
        values(a.id,sc.theme_id,p_now,case when current_text ~ '^-?[0-9]+(\.[0-9]+)?$' then current_text::numeric else null end,
          a.name||' triggered','not_requested',v_event_key,
          jsonb_build_object('condition_version','alert-trigger-v1','alert_type',a.alert_type,'operator',op,'metric',metric,'source_table',source_table,'source_row_id',source_key,'source_at',source_at,'prior_value',prior_text,'current_value',current_text,'threshold',threshold,'selected_values',a.condition -> 'values','confidence',current_conf,'methodology_version',methodology,'evaluator_version','alert-evaluator-v1','theme_id',sc.theme_id))
        on conflict(alert_id,event_key) do nothing returning id into event_inserted;
        if event_inserted is not null then created_events:=created_events+1; update public.alerts set last_triggered_at=p_now where id=a.id; end if;
      end if;
      update public.alert_evaluation_state set last_source_key=source_key,last_source_table=source_table,last_source_at=source_at,last_value=current_value,condition_true=current_truth,rearm_cycle=new_rearm,last_evaluated_at=p_now,last_triggered_at=case when should_trigger and event_inserted is not null then p_now else last_triggered_at end,updated_at=p_now where id=st.id;
    end loop;
  else
    for sc in
      select a.instrument_id as instrument_id, null::uuid as theme_id where a.instrument_id is not null
      union all
      select wi.instrument_id, null::uuid from public.watchlist_items wi where a.watchlist_id is not null and wi.watchlist_id=a.watchlist_id
    loop
      source_key := null; source_table := null; source_at := null; current_value := null; current_conf := null; methodology := null;
      if a.alert_type='price_threshold' then
        select mo.id::text,'market_observations',mo.observed_at,jsonb_build_object('value',mo.close,'currency_code',btrim(coalesce(mo.currency_code,i.currency_code))),null::numeric,null::text
        into source_key,source_table,source_at,current_value,current_conf,methodology from public.market_observations mo join public.instruments i on i.id=mo.instrument_id where mo.instrument_id=sc.instrument_id and mo.interval_code='quote' and btrim(coalesce(mo.currency_code,i.currency_code))=a.condition ->> 'currency_code' order by mo.observed_at desc,mo.id desc limit 1;
      elsif a.alert_type='data_freshness' then
        select i.id,i.asset_type,i.created_at into inst from public.instruments i where i.id=sc.instrument_id;
        select mo.id,mo.observed_at into latest_obs from public.market_observations mo where mo.instrument_id=sc.instrument_id and mo.interval_code='quote' order by mo.observed_at desc,mo.id desc limit 1;
        status_value:=public.market_freshness_status_v1(inst.asset_type,latest_obs.observed_at,inst.created_at,p_now);
        source_key:=coalesce(latest_obs.id::text,'none')||':'||status_value; source_table:='market_observations+clock'; source_at:=coalesce(latest_obs.observed_at,p_now); current_value:=jsonb_build_object('value',status_value);
      elsif a.alert_type='market_assessment' then
        select g.assessment_id::text,'gpt_market_assessments',g.created_at,
          case metric when 'rating' then jsonb_build_object('value',g.rating) when 'score' then jsonb_build_object('value',g.score) end,
          g.confidence,g.methodology_version
        into source_key,source_table,source_at,current_value,current_conf,methodology
        from public.gpt_market_assessments g join public.gpt_market_runs r on r.run_id=g.run_id and r.status='succeeded' where g.instrument_id=sc.instrument_id order by g.assessment_date desc,g.created_at desc,g.assessment_id desc limit 1;
      elsif a.alert_type='market_convergence' then
        select c.id::text,'market_convergence_assessments',c.updated_at,
          case metric when 'convergence_label' then jsonb_build_object('value',c.convergence_label) when 'convergence_score' then jsonb_build_object('value',c.convergence_score) end,
          c.convergence_confidence,c.methodology_version
        into source_key,source_table,source_at,current_value,current_conf,methodology from public.market_convergence_assessments c where c.instrument_id=sc.instrument_id order by c.assessment_date desc,c.updated_at desc,c.id desc limit 1;
      elsif a.alert_type='technical_score' then
        select m.id::text,'market_scores',m.calculated_at,
          jsonb_build_object('value',case metric when 'overall_score' then m.overall_score when 'momentum_score' then m.momentum_score when 'trend_score' then m.trend_score when 'volatility_score' then m.volatility_score when 'volume_score' then m.volume_score end),
          m.confidence_score,m.methodology_version
        into source_key,source_table,source_at,current_value,current_conf,methodology from public.market_scores m where m.instrument_id=sc.instrument_id and m.score_status='complete' order by m.score_date desc,m.calculated_at desc,m.id desc limit 1;
      end if;
      if source_key is null or current_value is null or (current_conf is not null and current_conf < min_conf) then continue; end if;
      select * into st from public.alert_evaluation_state s where s.alert_id=a.id and s.instrument_id=sc.instrument_id limit 1;
      if not found then
        current_text:=current_value ->> 'value'; current_truth:=false;
        if op in ('enters_value','enters_state') then current_truth:=exists(select 1 from jsonb_array_elements_text(coalesce(a.condition -> 'values',a.condition -> 'states')) v where v=current_text);
        elsif op='crosses_above' then current_truth:=current_text::numeric>threshold;
        elsif op='crosses_below' then current_truth:=current_text::numeric<threshold;
        end if;
        insert into public.alert_evaluation_state(alert_id,instrument_id,last_source_key,last_source_table,last_source_at,last_value,condition_true,last_evaluated_at,updated_at)
        values(a.id,sc.instrument_id,source_key,source_table,source_at,current_value,current_truth,p_now,p_now);
        continue;
      end if;
      if st.last_source_key is not distinct from source_key then update public.alert_evaluation_state set last_evaluated_at=p_now,updated_at=p_now where id=st.id; continue; end if;
      current_text:=current_value ->> 'value'; prior_text:=st.last_value ->> 'value'; should_trigger:=false; current_truth:=false;
      if op in ('enters_value','enters_state') then current_truth:=exists(select 1 from jsonb_array_elements_text(coalesce(a.condition -> 'values',a.condition -> 'states')) v where v=current_text); should_trigger:=current_truth and not coalesce(st.condition_true,false);
      elsif op='changes' then current_truth:=false; should_trigger:=prior_text is distinct from current_text;
      elsif op='crosses_above' then current_num:=current_text::numeric; prior_num:=nullif(prior_text,'')::numeric; current_truth:=current_num>threshold; should_trigger:=prior_num<=threshold and current_num>threshold;
      elsif op='crosses_below' then current_num:=current_text::numeric; prior_num:=nullif(prior_text,'')::numeric; current_truth:=current_num<threshold; should_trigger:=prior_num>=threshold and current_num<threshold;
      end if;
      new_rearm:=st.rearm_cycle; if coalesce(st.condition_true,false) and not current_truth then new_rearm:=new_rearm+1; end if;
      if should_trigger then
        if a.alert_type='data_freshness' then v_event_key:=sc.instrument_id::text||':'||current_text||':'||new_rearm::text; else v_event_key:=source_key||':'||coalesce(metric,'value')||':'||op; end if;
        event_inserted:=null;
        insert into public.alert_events(alert_id,instrument_id,triggered_at,trigger_value,message,notification_status,event_key,metadata)
        values(a.id,sc.instrument_id,p_now,case when current_text ~ '^-?[0-9]+(\.[0-9]+)?$' then current_text::numeric else null end,
          a.name||' triggered for '||(select i.symbol from public.instruments i where i.id=sc.instrument_id),'not_requested',v_event_key,
          jsonb_build_object('condition_version','alert-trigger-v1','alert_type',a.alert_type,'operator',op,'metric',metric,'source_table',source_table,'source_row_id',source_key,'source_at',source_at,'prior_value',prior_text,'current_value',current_text,'threshold',threshold,'selected_values',coalesce(a.condition -> 'values',a.condition -> 'states'),'confidence',current_conf,'methodology_version',methodology,'evaluator_version','alert-evaluator-v1','instrument_id',sc.instrument_id,'watchlist_id',a.watchlist_id,'rearm_cycle',new_rearm))
        on conflict(alert_id,event_key) do nothing returning id into event_inserted;
        if event_inserted is not null then created_events:=created_events+1; update public.alerts set last_triggered_at=p_now where id=a.id; end if;
      end if;
      update public.alert_evaluation_state set last_source_key=source_key,last_source_table=source_table,last_source_at=source_at,last_value=current_value,condition_true=current_truth,rearm_cycle=new_rearm,last_evaluated_at=p_now,last_triggered_at=case when should_trigger and event_inserted is not null then p_now else last_triggered_at end,updated_at=p_now where id=st.id;
    end loop;
  end if;
  if a.watchlist_id is not null then delete from public.alert_evaluation_state s where s.alert_id=a.id and s.instrument_id is not null and not exists(select 1 from public.watchlist_items wi where wi.watchlist_id=a.watchlist_id and wi.instrument_id=s.instrument_id); end if;
  return created_events;
end;
$$;
