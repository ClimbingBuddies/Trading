alter table public.gpt_market_assessments
  alter column methodology_version set default 'independent-market-ai-v1',
  alter column technical_engine_input_used set default false;

create or replace function public.enforce_market_ai_independence_metadata()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.methodology_version is null or btrim(new.methodology_version) = '' then
    new.methodology_version := 'independent-market-ai-v1';
  end if;

  if new.technical_engine_input_used is null then
    new.technical_engine_input_used := false;
  end if;

  if new.technical_engine_input_used then
    raise exception 'gpt_market_assessments must remain independent of Technical Engine inputs';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_market_ai_independence_metadata
on public.gpt_market_assessments;

create trigger trg_enforce_market_ai_independence_metadata
before insert or update of methodology_version, technical_engine_input_used
on public.gpt_market_assessments
for each row
execute function public.enforce_market_ai_independence_metadata();

alter table public.gpt_market_assessments
  drop constraint if exists gpt_market_assessments_no_technical_engine_input;

alter table public.gpt_market_assessments
  add constraint gpt_market_assessments_no_technical_engine_input
  check (technical_engine_input_used is not true)
  not valid;
