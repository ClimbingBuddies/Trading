alter table public.trading_strategies
  add column if not exists strategy_version integer not null default 1,
  add column if not exists methodology_version text not null default 'strategy-definition-v1',
  add column if not exists universe_definition jsonb not null default '{}'::jsonb,
  add column if not exists entry_rules jsonb not null default '{}'::jsonb,
  add column if not exists exit_rules jsonb not null default '{}'::jsonb,
  add column if not exists risk_rules jsonb not null default '{}'::jsonb,
  add column if not exists execution_rules jsonb not null default '{}'::jsonb,
  add column if not exists data_requirements jsonb not null default '{}'::jsonb,
  add column if not exists live_execution_enabled boolean not null default false;

alter table public.trading_strategies drop constraint if exists trading_strategies_owner_user_id_strategy_code_key;
create unique index if not exists trading_strategies_owner_code_version_uidx
  on public.trading_strategies(owner_user_id, strategy_code, strategy_version);

alter table public.trading_strategies drop constraint if exists trading_strategies_strategy_version_check;
alter table public.trading_strategies add constraint trading_strategies_strategy_version_check check (strategy_version >= 1);

alter table public.trading_strategies drop constraint if exists trading_strategies_universe_object_check;
alter table public.trading_strategies add constraint trading_strategies_universe_object_check check (jsonb_typeof(universe_definition) = 'object');
alter table public.trading_strategies drop constraint if exists trading_strategies_entry_object_check;
alter table public.trading_strategies add constraint trading_strategies_entry_object_check check (jsonb_typeof(entry_rules) = 'object');
alter table public.trading_strategies drop constraint if exists trading_strategies_exit_object_check;
alter table public.trading_strategies add constraint trading_strategies_exit_object_check check (jsonb_typeof(exit_rules) = 'object');
alter table public.trading_strategies drop constraint if exists trading_strategies_risk_object_check;
alter table public.trading_strategies add constraint trading_strategies_risk_object_check check (jsonb_typeof(risk_rules) = 'object');
alter table public.trading_strategies drop constraint if exists trading_strategies_execution_object_check;
alter table public.trading_strategies add constraint trading_strategies_execution_object_check check (jsonb_typeof(execution_rules) = 'object');
alter table public.trading_strategies drop constraint if exists trading_strategies_data_object_check;
alter table public.trading_strategies add constraint trading_strategies_data_object_check check (jsonb_typeof(data_requirements) = 'object');

comment on column public.trading_strategies.strategy_version is 'Explicit version of the strategy rules. A strategy_code may have multiple independently testable versions.';
comment on column public.trading_strategies.universe_definition is 'Persisted eligible-universe rules and current symbol snapshot for this strategy version.';
comment on column public.trading_strategies.entry_rules is 'Deterministic entry signal and order-timing contract.';
comment on column public.trading_strategies.exit_rules is 'Deterministic stop, trend and time-exit contract.';
comment on column public.trading_strategies.risk_rules is 'Position sizing, exposure and portfolio risk limits.';
comment on column public.trading_strategies.execution_rules is 'Execution assumptions for testing; live execution remains separately gated.';
comment on column public.trading_strategies.data_requirements is 'Required source fields/history and missing-data behaviour.';
comment on column public.trading_strategies.live_execution_enabled is 'Must remain false until a later explicit live-trading approval and implementation gate.';