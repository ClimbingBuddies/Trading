-- Table-only diagnostic, no application functions or generated invocations.
-- Row comparison is NOT source admission, arithmetic validation or dispatch permission.
with selected as (
 select i.id,r.input_envelope,to_jsonb(t) technical,to_jsonb(s) source_snapshot,
   to_jsonb(a) ai,to_jsonb(ar) ai_run,to_jsonb(c) calendar
 from public.instruments i
 left join lateral(select * from market_convergence.asx_runs_v1 where instrument_id=i.id
   and status='succeeded' and finished_at<=statement_timestamp() order by finished_at desc,id desc limit 1) r on true
 left join lateral(select * from public.market_scores where instrument_id=i.id
   and methodology_version='technical-score-asx-v1' and calculated_at<=statement_timestamp()
   order by score_date desc,calculated_at desc,id desc limit 1) t on true
 left join technical_engine.asx_input_snapshots s on s.id::text=t.score_details->>'source_snapshot_id' and s.instrument_id=i.id
 left join lateral(select * from public.gpt_market_assessments where instrument_id=i.id
   and methodology_version='independent-market-ai-v1' and created_at<=statement_timestamp()
   order by assessment_date desc,created_at desc,assessment_id desc limit 1) a on true
 left join public.gpt_market_runs ar on ar.run_id=a.run_id
 left join lateral(select * from market_convergence.asx_calendars_v1
   where verified_at<=statement_timestamp() and valid_until>statement_timestamp()
   and (statement_timestamp() at time zone 'Australia/Sydney')::date-1 between (manifest->>'startDate')::date and (manifest->>'endDate')::date
   order by verified_at desc,revision desc limit 1) c on true
 where i.is_active and i.exchange_code='ASX'
), classified as (
 select case when input_envelope is null then 'NO_SUCCESSFUL_RECEIPT'
   when technical is null or source_snapshot is null or ai is null or ai_run is null or calendar is null then 'CURRENT_LINEAGE_ROW_MISSING'
   when input_envelope->'technical' is distinct from technical
     or input_envelope->'source_snapshot' is distinct from source_snapshot
     or input_envelope->'ai' is distinct from ai or input_envelope->'calendar' is distinct from calendar
     or ((input_envelope->'ai_run')-'notes') is distinct from (ai_run-'notes') then 'ANALYTICAL_OR_LIFECYCLE_ROW_CHANGED'
   when input_envelope->'ai_run' is distinct from ai_run then 'RUN_NOTES_ONLY'
   else 'STORED_LINEAGE_ROWS_MATCH' end lineage_state from selected
)
select statement_timestamp() checked_at,lineage_state,count(*) instruments,
 'TABLE_COMPARISON_ONLY_NOT_ADMISSION'::text verification_scope
from classified group by lineage_state order by lineage_state;
