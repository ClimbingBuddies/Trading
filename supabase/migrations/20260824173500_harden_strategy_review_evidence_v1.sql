revoke all privileges on table public.trading_decision_evaluations from anon, authenticated;
grant select on table public.trading_decision_evaluations to authenticated;

drop policy if exists trading_evaluations_owner_insert on public.trading_decision_evaluations;
drop policy if exists trading_evaluations_owner_update on public.trading_decision_evaluations;
drop policy if exists trading_evaluations_owner_delete on public.trading_decision_evaluations;

comment on table public.trading_decision_evaluations is
'Strategy decision-review evidence. Authenticated owners may read their own rows through RLS; normal clients cannot insert, update, delete or truncate review outcomes. Trusted service/database evaluators create the evidence.';