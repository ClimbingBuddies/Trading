drop index if exists public.alerts_owner_user_id_idx;
drop index if exists public.alerts_instrument_id_idx;
drop index if exists public.alerts_watchlist_id_idx;
create index if not exists alert_evaluation_state_instrument_idx on public.alert_evaluation_state(instrument_id) where instrument_id is not null;
create index if not exists alert_evaluation_state_theme_idx on public.alert_evaluation_state(theme_id) where theme_id is not null;
create index if not exists alert_evaluator_runs_alert_idx on public.alert_evaluator_runs(alert_id) where alert_id is not null;
create index if not exists alert_evaluator_runs_instrument_idx on public.alert_evaluator_runs(instrument_id) where instrument_id is not null;
create index if not exists alert_evaluator_runs_theme_idx on public.alert_evaluator_runs(theme_id) where theme_id is not null;
create index if not exists alert_events_theme_idx on public.alert_events(theme_id) where theme_id is not null;

drop policy if exists alert_evaluation_state_no_client_access on public.alert_evaluation_state;
create policy alert_evaluation_state_no_client_access on public.alert_evaluation_state
for all to authenticated using (false) with check (false);

drop policy if exists alert_evaluator_runs_no_client_access on public.alert_evaluator_runs;
create policy alert_evaluator_runs_no_client_access on public.alert_evaluator_runs
for all to authenticated using (false) with check (false);
