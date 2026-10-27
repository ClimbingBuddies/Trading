-- Read-only recovery inventory for an authorised administrator.
-- Run in a client that stops on error. Do not weaken grants to run this through the app.
-- No function bodies, cron command text, raw research, user notes or credentials are selected.
begin transaction read only;
set local statement_timeout = '15s';
set local lock_timeout = '3s';

select clock_timestamp() as inspected_at,
       clock_timestamp() at time zone 'Australia/Perth' as perth_time,
       clock_timestamp() at time zone 'America/New_York' as new_york_time,
       current_setting('transaction_read_only') as read_only;

select name, to_regclass(name) is not null as relation_present
from (values ('cron.job'), ('cron.job_run_details'), ('private.shared_evaluator_release'),
  ('private.shared_decision_config'), ('private.shared_market_calendars'),
  ('private.trading_controller_attempts'), ('private.shared_evaluation_runs')) expected(name);

-- Only the backend watchdog/evaluation jobs live in pg_cron; the external 08:00
-- controller's actual saved task and invocation history must be inspected separately.
select jobid, jobname, schedule, active
from cron.job
where jobname ~ '(trading|shared|decision|prediction)'
order by jobname;

select r.jobid, j.jobname, r.status, r.start_time, r.end_time
from cron.job_run_details r join cron.job j on j.jobid = r.jobid
where j.jobname ~ '(trading|shared|decision|prediction)'
order by r.start_time desc limit 40;

select enabled, accepted_revision from private.shared_evaluator_release;

select i.symbol, i.asset_type, i.currency_code, c.enabled,
       p.provider_code, b.symbol as benchmark, c.verified_at
from public.instruments i
left join private.shared_decision_config c on c.instrument_id = i.id
left join public.instruments b on b.id = c.benchmark_instrument_id
left join public.data_providers p on p.id = c.provider_id
where i.is_active
order by i.symbol;

select exchange_code, revision, time_zone, verified_at, valid_until,
       coverage_start, coverage_end
from private.shared_market_calendars
order by valid_until desc limit 20;

select morning_date, stage, state, spec_revision, started_at, finished_at, reason_code
from private.trading_controller_attempts
order by started_at desc limit 30;

select origin, status, spec_revision, started_at, completed_at, evaluated_count, blocked_count
from private.shared_evaluation_runs
order by started_at desc limit 30;

rollback;
