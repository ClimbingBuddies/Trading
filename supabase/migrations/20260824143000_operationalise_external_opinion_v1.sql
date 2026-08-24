create schema if not exists external_opinion;
revoke all on schema external_opinion from public, anon, authenticated;
grant usage on schema external_opinion to service_role;

create or replace function external_opinion.normalize_source_url_v1(p_url text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
  parts text[];
begin
  v := nullif(btrim(p_url), '');
  if v is null then return null; end if;
  v := regexp_replace(v, '#.*$', '');
  v := regexp_replace(v, '([?&])(utm_[^=&#]+|gclid|fbclid|mc_cid|mc_eid)=[^&#]*', '\1', 'gi');
  v := regexp_replace(v, '\?&', '?', 'g');
  v := regexp_replace(v, '&&+', '&', 'g');
  v := regexp_replace(v, '[?&]+$', '');
  parts := regexp_match(v, '^(https?://)([^/]+)(.*)$', 'i');
  if parts is not null then
    v := lower(parts[1]) || lower(parts[2]) || parts[3];
  end if;
  if position('?' in v) = 0 then
    v := regexp_replace(v, '/+$', '');
  end if;
  return v;
end;
$$;

create or replace function external_opinion.source_domain_v1(p_url text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
  m text[];
begin
  v := external_opinion.normalize_source_url_v1(p_url);
  if v is null then return null; end if;
  m := regexp_match(v, '^https?://([^/:?#]+)', 'i');
  if m is null then return null; end if;
  return regexp_replace(lower(m[1]), '^www\.', '');
end;
$$;

create or replace function external_opinion.claim_hash_v1(p_headline text, p_summary text, p_rationale text)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(lower(regexp_replace(coalesce(p_headline,'') || '|' || coalesce(p_summary,'') || '|' || coalesce(p_rationale,''), '\s+', ' ', 'g')));
$$;

create or replace function external_opinion.canonical_source_key_v1(
  p_source_id uuid,
  p_source_url text,
  p_external_reference text,
  p_content_hash text,
  p_source_published_at timestamptz,
  p_headline text,
  p_summary text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_url text;
begin
  v_url := external_opinion.normalize_source_url_v1(p_source_url);
  if v_url is not null then
    return 'url-md5:' || md5(v_url);
  end if;
  if p_source_id is not null and nullif(btrim(p_external_reference),'') is not null then
    return 'source-ref:' || p_source_id::text || ':' || md5(btrim(p_external_reference));
  end if;
  if nullif(btrim(p_content_hash),'') is not null then
    return 'content:' || lower(btrim(p_content_hash));
  end if;
  return 'fallback:' || md5(coalesce(p_source_id::text,'') || '|' || coalesce(p_source_published_at::date::text,'') || '|' || lower(regexp_replace(coalesce(p_headline,'') || '|' || coalesce(p_summary,''), '\s+', ' ', 'g')));
end;
$$;

create or replace function external_opinion.observation_key_v1(
  p_canonical_source_key text,
  p_source_published_at timestamptz,
  p_claim_hash text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(coalesce(p_canonical_source_key,'') || '|' || coalesce(p_source_published_at::date::text,'undated') || '|' || coalesce(p_claim_hash,''));
$$;

alter table public.opinion_sources
  add column if not exists collection_method text not null default 'web_research',
  add column if not exists approved_domains text[] not null default '{}'::text[],
  add column if not exists lookback_hours integer not null default 168,
  add column if not exists max_items_per_instrument integer not null default 2,
  add column if not exists trust_tier text not null default 'secondary',
  add column if not exists collection_notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.opinion_sources drop constraint if exists opinion_sources_collection_method_check;
alter table public.opinion_sources add constraint opinion_sources_collection_method_check check (collection_method in ('web_research','official_web','disabled'));
alter table public.opinion_sources drop constraint if exists opinion_sources_lookback_hours_check;
alter table public.opinion_sources add constraint opinion_sources_lookback_hours_check check (lookback_hours between 1 and 2160);
alter table public.opinion_sources drop constraint if exists opinion_sources_max_items_check;
alter table public.opinion_sources add constraint opinion_sources_max_items_check check (max_items_per_instrument between 1 and 10);
alter table public.opinion_sources drop constraint if exists opinion_sources_trust_tier_check;
alter table public.opinion_sources add constraint opinion_sources_trust_tier_check check (trust_tier in ('primary','secondary','specialist'));

update public.opinion_sources
set collection_method='web_research', approved_domains=array['stockanalysis.com'], lookback_hours=720, max_items_per_instrument=1, trust_tier='secondary',
    collection_notes='Use visible analyst-consensus or target-price information with an explicit as-of date. Do not treat a provider consensus as the Trading rating.', updated_at=now()
where source_key='analyst_consensus';
update public.opinion_sources
set collection_method='web_research', approved_domains=array['reuters.com'], lookback_hours=168, max_items_per_instrument=2, trust_tier='secondary',
    collection_notes='Use material current financial reporting only. Preserve the original Reuters URL/date and classify reported sentiment separately from fact.', updated_at=now()
where source_key='financial_news';
update public.opinion_sources
set collection_method='official_web', approved_domains='{}'::text[], lookback_hours=720, max_items_per_instrument=2, trust_tier='primary',
    collection_notes='Use only the issuer, fund sponsor or official investor-relations/press-release site. The collector must verify primary-source provenance before ingestion.', updated_at=now()
where source_key='official_company';
update public.opinion_sources
set collection_method='official_web', approved_domains=array['sec.gov'], lookback_hours=720, max_items_per_instrument=2, trust_tier='primary',
    collection_notes='Use official SEC/regulatory material. Store the filing/announcement URL and publication date; do not convert a filing into sentiment unless the source itself supports that classification.', updated_at=now()
where source_key='regulatory';
update public.opinion_sources
set collection_method='web_research', approved_domains=array['iea.org','federalreserve.gov','imf.org','worldbank.org'], lookback_hours=720, max_items_per_instrument=2, trust_tier='specialist',
    collection_notes='Use authoritative specialist/macro research only when materially relevant to the instrument. Preserve publication date and source scope.', updated_at=now()
where source_key='research';

alter table public.opinion_reviews
  add column if not exists review_date date,
  add column if not exists triggered_by text,
  add column if not exists methodology_version text not null default 'external-opinion-v1',
  add column if not exists attempt_count integer not null default 1,
  add column if not exists sources_checked integer not null default 0,
  add column if not exists source_failures integer not null default 0,
  add column if not exists opinions_seen integer not null default 0,
  add column if not exists duplicates_skipped integer not null default 0,
  add column if not exists consensus_rows integer not null default 0,
  add column if not exists coverage_current integer not null default 0,
  add column if not exists coverage_stale integer not null default 0,
  add column if not exists coverage_none integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.opinion_reviews
set review_date=coalesce(review_date, started_at::date), triggered_by=coalesce(triggered_by,'legacy-test')
where review_date is null or triggered_by is null;
alter table public.opinion_reviews alter column review_date set not null;
alter table public.opinion_reviews alter column triggered_by set not null;
alter table public.opinion_reviews drop constraint if exists opinion_reviews_attempt_count_check;
alter table public.opinion_reviews add constraint opinion_reviews_attempt_count_check check (attempt_count >= 1);
create unique index if not exists opinion_reviews_daily_runner_uidx on public.opinion_reviews(review_date, methodology_version, triggered_by);

create table if not exists public.opinion_source_review_results (
  review_id uuid not null references public.opinion_reviews(id) on delete cascade,
  source_id uuid not null references public.opinion_sources(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','skipped')),
  items_seen integer not null default 0 check (items_seen >= 0),
  opinions_inserted integer not null default 0 check (opinions_inserted >= 0),
  duplicates_skipped integer not null default 0 check (duplicates_skipped >= 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  primary key (review_id, source_id)
);

alter table public.instrument_opinions
  add column if not exists canonical_source_url text,
  add column if not exists source_domain text,
  add column if not exists canonical_source_key text,
  add column if not exists claim_hash text,
  add column if not exists observation_key text,
  add column if not exists collector_version text not null default 'external-opinion-v1';

update public.instrument_opinions
set canonical_source_url=external_opinion.normalize_source_url_v1(source_url),
    source_domain=external_opinion.source_domain_v1(source_url),
    claim_hash=external_opinion.claim_hash_v1(headline,summary,rationale),
    canonical_source_key=external_opinion.canonical_source_key_v1(source_id,source_url,external_reference,content_hash,source_published_at,headline,summary)
where canonical_source_key is null or claim_hash is null or canonical_source_url is null or source_domain is null;
update public.instrument_opinions
set observation_key=external_opinion.observation_key_v1(canonical_source_key,source_published_at,claim_hash)
where observation_key is null;

alter table public.instrument_opinions alter column review_id set not null;
alter table public.instrument_opinions alter column source_id set not null;
alter table public.instrument_opinions alter column canonical_source_key set not null;
alter table public.instrument_opinions alter column claim_hash set not null;
alter table public.instrument_opinions alter column observation_key set not null;

alter table public.instrument_opinions drop constraint if exists instrument_opinions_instrument_id_content_hash_key;
alter table public.instrument_opinions drop constraint if exists instrument_opinions_instrument_id_source_id_external_refere_key;
drop index if exists public.instrument_opinions_instrument_id_content_hash_key;
drop index if exists public.instrument_opinions_instrument_id_source_id_external_refere_key;
create unique index if not exists instrument_opinions_observation_uidx on public.instrument_opinions(instrument_id,observation_key);
create index if not exists instrument_opinions_canonical_source_idx on public.instrument_opinions(instrument_id,canonical_source_key);
create index if not exists instrument_opinions_content_hash_idx on public.instrument_opinions(instrument_id,content_hash) where content_hash is not null;
create index if not exists instrument_opinions_source_reference_idx on public.instrument_opinions(instrument_id,source_id,external_reference) where external_reference is not null;
create index if not exists instrument_opinions_source_id_idx on public.instrument_opinions(source_id);

create or replace function external_opinion.set_opinion_identity_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.canonical_source_url := external_opinion.normalize_source_url_v1(new.source_url);
  new.source_domain := external_opinion.source_domain_v1(new.source_url);
  new.claim_hash := external_opinion.claim_hash_v1(new.headline,new.summary,new.rationale);
  if nullif(btrim(new.content_hash),'') is null then new.content_hash := new.claim_hash; end if;
  new.canonical_source_key := external_opinion.canonical_source_key_v1(new.source_id,new.source_url,new.external_reference,new.content_hash,new.source_published_at,new.headline,new.summary);
  new.observation_key := external_opinion.observation_key_v1(new.canonical_source_key,new.source_published_at,new.claim_hash);
  if nullif(btrim(new.collector_version),'') is null then new.collector_version := 'external-opinion-v1'; end if;
  return new;
end;
$$;

drop trigger if exists instrument_opinions_identity_v1 on public.instrument_opinions;
create trigger instrument_opinions_identity_v1 before insert or update of source_id,source_url,external_reference,content_hash,source_published_at,headline,summary,rationale on public.instrument_opinions
for each row execute function external_opinion.set_opinion_identity_v1();

alter table public.instrument_opinion_consensus
  add column if not exists methodology_version text not null default 'external-opinion-consensus-v1',
  add column if not exists source_family_count integer not null default 0,
  add column if not exists coverage_status text not null default 'none',
  add column if not exists fresh_through timestamptz;
alter table public.instrument_opinion_consensus drop constraint if exists instrument_opinion_consensus_coverage_status_check;
alter table public.instrument_opinion_consensus add constraint instrument_opinion_consensus_coverage_status_check check (coverage_status in ('current','stale','none'));

create table if not exists public.opinion_consensus_members (
  consensus_id uuid not null references public.instrument_opinion_consensus(id) on delete cascade,
  opinion_id uuid not null references public.instrument_opinions(id) on delete cascade,
  evidence_family_key text not null,
  canonical_source_key text not null,
  added_at timestamptz not null default now(),
  primary key (consensus_id, opinion_id),
  unique (consensus_id, evidence_family_key)
);
create index if not exists opinion_consensus_members_opinion_idx on public.opinion_consensus_members(opinion_id);

alter table public.gpt_market_evidence
  add column if not exists instrument_opinion_id uuid references public.instrument_opinions(id) on delete set null,
  add column if not exists canonical_source_key text;
create index if not exists gpt_market_evidence_instrument_opinion_idx on public.gpt_market_evidence(instrument_opinion_id) where instrument_opinion_id is not null;

update public.gpt_market_evidence
set canonical_source_key='url-md5:' || md5(external_opinion.normalize_source_url_v1(source_url))
where evidence_type='external_opinion' and canonical_source_key is null and nullif(btrim(source_url),'') is not null;
create unique index if not exists gpt_market_evidence_external_source_uidx on public.gpt_market_evidence(assessment_id,canonical_source_key)
where evidence_type='external_opinion' and canonical_source_key is not null;

create or replace function external_opinion.validate_market_evidence_lineage_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  assessment_instrument uuid;
begin
  if new.evidence_type <> 'external_opinion' then return new; end if;
  if new.instrument_opinion_id is not null then
    select instrument_id,canonical_source_key,source_url into o from public.instrument_opinions where id=new.instrument_opinion_id;
    if not found then raise exception 'Unknown instrument_opinion_id'; end if;
    select instrument_id into assessment_instrument from public.gpt_market_assessments where assessment_id=new.assessment_id;
    if assessment_instrument is distinct from o.instrument_id then raise exception 'External opinion lineage instrument mismatch'; end if;
    new.canonical_source_key := o.canonical_source_key;
    if new.source_url is null then new.source_url := o.source_url; end if;
  elsif new.canonical_source_key is null and nullif(btrim(new.source_url),'') is not null then
    new.canonical_source_key := 'url-md5:' || md5(external_opinion.normalize_source_url_v1(new.source_url));
  end if;
  return new;
end;
$$;

drop trigger if exists gpt_market_evidence_external_lineage_v1 on public.gpt_market_evidence;
create trigger gpt_market_evidence_external_lineage_v1 before insert or update of evidence_type,instrument_opinion_id,source_url,canonical_source_key on public.gpt_market_evidence
for each row execute function external_opinion.validate_market_evidence_lineage_v1();

create or replace function external_opinion.prepare_review_v1(p_review_date date, p_triggered_by text)
returns table(review_id uuid, review_status text, already_complete boolean, attempt_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.opinion_reviews%rowtype;
begin
  select * into r from public.opinion_reviews where review_date=p_review_date and methodology_version='external-opinion-v1' and triggered_by=p_triggered_by;
  if found and r.status='succeeded' then
    return query select r.id,r.status,true,r.attempt_count;
    return;
  end if;
  if found then
    update public.opinion_reviews
      set started_at=clock_timestamp(),completed_at=null,status='running',attempt_count=r.attempt_count+1,
          instruments_checked=0,opinions_inserted=0,material_changes=0,error_message=null,sources_checked=0,source_failures=0,
          opinions_seen=0,duplicates_skipped=0,consensus_rows=0,coverage_current=0,coverage_stale=0,coverage_none=0,
          metadata='{}'::jsonb
      where id=r.id returning * into r;
    delete from public.opinion_source_review_results where review_id=r.id;
  else
    insert into public.opinion_reviews(review_date,triggered_by,methodology_version,status)
    values(p_review_date,p_triggered_by,'external-opinion-v1','running') returning * into r;
  end if;
  insert into public.opinion_source_review_results(review_id,source_id,status)
  select r.id,s.id,'pending' from public.opinion_sources s where s.is_active
  on conflict(review_id,source_id) do nothing;
  return query select r.id,r.status,false,r.attempt_count;
end;
$$;

create or replace function external_opinion.record_source_result_v1(
  p_review_id uuid,
  p_source_key text,
  p_status text,
  p_items_seen integer default 0,
  p_opinions_inserted integer default 0,
  p_duplicates_skipped integer default 0,
  p_error_message text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare sid uuid;
begin
  if p_status not in ('succeeded','failed','skipped') then raise exception 'Invalid source result status'; end if;
  select id into sid from public.opinion_sources where source_key=p_source_key and is_active;
  if sid is null then raise exception 'Unknown active opinion source %',p_source_key; end if;
  insert into public.opinion_source_review_results(review_id,source_id,status,items_seen,opinions_inserted,duplicates_skipped,error_message,started_at,completed_at,metadata)
  values(p_review_id,sid,p_status,greatest(p_items_seen,0),greatest(p_opinions_inserted,0),greatest(p_duplicates_skipped,0),p_error_message,clock_timestamp(),clock_timestamp(),coalesce(p_metadata,'{}'::jsonb))
  on conflict(review_id,source_id) do update set status=excluded.status,items_seen=excluded.items_seen,opinions_inserted=excluded.opinions_inserted,
    duplicates_skipped=excluded.duplicates_skipped,error_message=excluded.error_message,started_at=coalesce(public.opinion_source_review_results.started_at,excluded.started_at),
    completed_at=excluded.completed_at,metadata=excluded.metadata;
end;
$$;

create or replace function external_opinion.ingest_opinion_v1(
  p_review_id uuid,
  p_instrument_symbol text,
  p_source_key text,
  p_opinion_type text,
  p_stance text,
  p_headline text,
  p_summary text,
  p_source_url text,
  p_source_published_at timestamptz,
  p_external_reference text default null,
  p_rating text default null,
  p_target_price numeric default null,
  p_target_currency text default null,
  p_time_horizon text default null,
  p_rationale text default null,
  p_confidence numeric default null,
  p_is_material boolean default false
)
returns table(opinion_id uuid, inserted boolean, canonical_source_key text, observation_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  i uuid;
  s public.opinion_sources%rowtype;
  domain text;
  ckey text;
  chash text;
  okey text;
  oid uuid;
  did_insert boolean:=false;
begin
  if not exists(select 1 from public.opinion_reviews r where r.id=p_review_id and r.status='running' and r.methodology_version='external-opinion-v1') then raise exception 'Opinion review is not running'; end if;
  select id into i from public.instruments where symbol=p_instrument_symbol and is_active;
  if i is null then raise exception 'Unknown active instrument %',p_instrument_symbol; end if;
  select * into s from public.opinion_sources where source_key=p_source_key and is_active;
  if not found then raise exception 'Unknown active opinion source %',p_source_key; end if;
  domain:=external_opinion.source_domain_v1(p_source_url);
  if cardinality(s.approved_domains)>0 and not exists(select 1 from unnest(s.approved_domains) d where domain=d or domain like '%.'||d) then
    raise exception 'Source domain % is not approved for %',domain,p_source_key;
  end if;
  chash:=external_opinion.claim_hash_v1(p_headline,p_summary,p_rationale);
  ckey:=external_opinion.canonical_source_key_v1(s.id,p_source_url,p_external_reference,chash,p_source_published_at,p_headline,p_summary);
  okey:=external_opinion.observation_key_v1(ckey,p_source_published_at,chash);
  insert into public.instrument_opinions(instrument_id,review_id,source_id,opinion_type,stance,confidence,rating,target_price,target_currency,time_horizon,headline,summary,rationale,source_url,source_published_at,observed_at,external_reference,content_hash,is_material,canonical_source_url,source_domain,canonical_source_key,claim_hash,observation_key,collector_version)
  values(i,p_review_id,s.id,p_opinion_type,p_stance,p_confidence,p_rating,p_target_price,p_target_currency,p_time_horizon,p_headline,p_summary,p_rationale,p_source_url,p_source_published_at,clock_timestamp(),p_external_reference,chash,p_is_material,external_opinion.normalize_source_url_v1(p_source_url),domain,ckey,chash,okey,'external-opinion-v1')
  on conflict(instrument_id,observation_key) do nothing returning id into oid;
  if oid is null then
    select id into oid from public.instrument_opinions where instrument_id=i and observation_key=okey;
  else
    did_insert:=true;
  end if;
  update public.opinion_reviews set opinions_seen=opinions_seen+1, opinions_inserted=opinions_inserted+(case when did_insert then 1 else 0 end), duplicates_skipped=duplicates_skipped+(case when did_insert then 0 else 1 end) where id=p_review_id;
  return query select oid,did_insert,ckey,okey;
end;
$$;

create or replace function external_opinion.rebuild_consensus_v1(p_review_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.opinion_reviews%rowtype;
  inst record;
  c record;
  consensus_id uuid;
  previous record;
  stance text;
  score numeric;
  material boolean;
  created_count integer:=0;
begin
  select * into r from public.opinion_reviews where id=p_review_id;
  if not found then raise exception 'Unknown opinion review'; end if;
  for inst in select id from public.instruments where is_active loop
    with eligible as (
      select o.*, (o.canonical_source_key||':'||o.claim_hash) evidence_family_key,
             coalesce(o.source_published_at,o.observed_at) effective_at,
             row_number() over(partition by o.instrument_id,o.canonical_source_key,o.claim_hash order by coalesce(o.source_published_at,o.observed_at) desc,o.observed_at desc,o.id desc) rn
      from public.instrument_opinions o join public.opinion_sources s on s.id=o.source_id and s.is_active
      where o.instrument_id=inst.id and coalesce(o.source_published_at,o.observed_at) >= (r.review_date::timestamptz + interval '1 day' - make_interval(hours=>s.lookback_hours))
    ), d as (select * from eligible where rn=1)
    select count(*) total,
      count(*) filter(where opinion_type in ('analyst_rating','analyst_target')) analyst_count,
      count(*) filter(where opinion_type in ('analyst_rating','analyst_target') and stance in ('bullish','positive')) bullish_count,
      count(*) filter(where opinion_type in ('analyst_rating','analyst_target') and stance in ('neutral','mixed','unknown')) neutral_count,
      count(*) filter(where opinion_type in ('analyst_rating','analyst_target') and stance in ('bearish','negative')) bearish_count,
      count(*) filter(where opinion_type not in ('analyst_rating','analyst_target') and stance in ('bullish','positive')) positive_news_count,
      count(*) filter(where opinion_type not in ('analyst_rating','analyst_target') and stance in ('bearish','negative')) negative_news_count,
      avg(case stance when 'bullish' then 90 when 'positive' then 70 when 'neutral' then 50 when 'mixed' then 50 when 'unknown' then 50 when 'negative' then 30 when 'bearish' then 10 end)::numeric score,
      count(distinct canonical_source_key) source_family_count,
      max(effective_at) fresh_through
    into c from d;
    if coalesce(c.total,0)=0 then
      delete from public.instrument_opinion_consensus where instrument_id=inst.id and as_of_date=r.review_date;
      continue;
    end if;
    score:=round(c.score,2);
    if (c.bullish_count+c.positive_news_count)>0 and (c.bearish_count+c.negative_news_count)>0 and abs(score-50)<10 then stance:='mixed';
    elsif score>=72.5 then stance:='bullish';
    elsif score>=57.5 then stance:='positive';
    elsif score>=42.5 then stance:='neutral';
    elsif score>=27.5 then stance:='negative';
    else stance:='bearish'; end if;
    select consensus_stance,consensus_score into previous from public.instrument_opinion_consensus where instrument_id=inst.id and as_of_date<r.review_date order by as_of_date desc limit 1;
    material:=previous.consensus_stance is not null and (previous.consensus_stance is distinct from stance or abs(coalesce(previous.consensus_score,score)-score)>=15);
    insert into public.instrument_opinion_consensus(instrument_id,review_id,as_of_date,analyst_count,bullish_count,neutral_count,bearish_count,positive_news_count,negative_news_count,consensus_stance,consensus_score,key_change,is_material_change,generated_at,methodology_version,source_family_count,coverage_status,fresh_through)
    values(inst.id,p_review_id,r.review_date,c.analyst_count,c.bullish_count,c.neutral_count,c.bearish_count,c.positive_news_count,c.negative_news_count,stance,score,
      case when previous.consensus_stance is null then 'Initial deduplicated external-opinion consensus.' else 'Consensus '||previous.consensus_stance||' -> '||stance||'; score '||coalesce(previous.consensus_score::text,'n/a')||' -> '||score::text end,
      material,clock_timestamp(),'external-opinion-consensus-v1',c.source_family_count,'current',c.fresh_through)
    on conflict(instrument_id,as_of_date) do update set review_id=excluded.review_id,analyst_count=excluded.analyst_count,bullish_count=excluded.bullish_count,neutral_count=excluded.neutral_count,bearish_count=excluded.bearish_count,positive_news_count=excluded.positive_news_count,negative_news_count=excluded.negative_news_count,consensus_stance=excluded.consensus_stance,consensus_score=excluded.consensus_score,key_change=excluded.key_change,is_material_change=excluded.is_material_change,generated_at=excluded.generated_at,methodology_version=excluded.methodology_version,source_family_count=excluded.source_family_count,coverage_status=excluded.coverage_status,fresh_through=excluded.fresh_through
    returning id into consensus_id;
    delete from public.opinion_consensus_members where consensus_id=consensus_id;
    insert into public.opinion_consensus_members(consensus_id,opinion_id,evidence_family_key,canonical_source_key)
    select consensus_id,d.id,d.canonical_source_key||':'||d.claim_hash,d.canonical_source_key
    from (
      select o.*,row_number() over(partition by o.instrument_id,o.canonical_source_key,o.claim_hash order by coalesce(o.source_published_at,o.observed_at) desc,o.observed_at desc,o.id desc) rn
      from public.instrument_opinions o join public.opinion_sources s on s.id=o.source_id and s.is_active
      where o.instrument_id=inst.id and coalesce(o.source_published_at,o.observed_at) >= (r.review_date::timestamptz + interval '1 day' - make_interval(hours=>s.lookback_hours))
    ) d where d.rn=1;
    created_count:=created_count+1;
  end loop;
  return created_count;
end;
$$;

create or replace function external_opinion.finalize_review_v1(p_review_id uuid, p_instruments_checked integer, p_error_message text default null)
returns table(review_status text, opinions_inserted integer, duplicates_skipped integer, consensus_rows integer, coverage_current integer, coverage_stale integer, coverage_none integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.opinion_reviews%rowtype;
  consensus_count integer;
  current_count integer;
  stale_count integer;
  none_count integer;
  checked integer;
  failures integer;
  pending integer;
  final_status text;
begin
  select * into r from public.opinion_reviews where id=p_review_id;
  if not found then raise exception 'Unknown opinion review'; end if;
  consensus_count:=external_opinion.rebuild_consensus_v1(p_review_id);
  select count(*) filter(where status in ('succeeded','failed','skipped')),count(*) filter(where status='failed'),count(*) filter(where status in ('pending','running')) into checked,failures,pending from public.opinion_source_review_results where review_id=p_review_id;
  with coverage as (
    select i.id,
      exists(select 1 from public.instrument_opinions o join public.opinion_sources s on s.id=o.source_id and s.is_active where o.instrument_id=i.id and coalesce(o.source_published_at,o.observed_at) >= (r.review_date::timestamptz + interval '1 day' - make_interval(hours=>s.lookback_hours))) is_current,
      exists(select 1 from public.instrument_opinions o where o.instrument_id=i.id) has_any
    from public.instruments i where i.is_active
  ) select count(*) filter(where is_current),count(*) filter(where not is_current and has_any),count(*) filter(where not has_any) into current_count,stale_count,none_count from coverage;
  if p_error_message is not null and r.opinions_seen=0 then final_status:='failed';
  elsif failures>0 or pending>0 or p_error_message is not null then final_status:='partial';
  else final_status:='succeeded'; end if;
  update public.opinion_reviews set completed_at=clock_timestamp(),status=final_status,instruments_checked=greatest(p_instruments_checked,0),
    sources_checked=checked,source_failures=failures,consensus_rows=consensus_count,coverage_current=current_count,coverage_stale=stale_count,coverage_none=none_count,error_message=p_error_message
  where id=p_review_id returning * into r;
  return query select r.status,r.opinions_inserted,r.duplicates_skipped,r.consensus_rows,r.coverage_current,r.coverage_stale,r.coverage_none;
end;
$$;

create or replace view public.external_opinion_coverage_v1
with (security_invoker=true) as
select i.id instrument_id,i.symbol,
  max(coalesce(o.source_published_at,o.observed_at)) latest_opinion_at,
  case
    when exists(select 1 from public.instrument_opinions ox join public.opinion_sources sx on sx.id=ox.source_id and sx.is_active where ox.instrument_id=i.id and coalesce(ox.source_published_at,ox.observed_at)>=clock_timestamp()-make_interval(hours=>sx.lookback_hours)) then 'current'
    when exists(select 1 from public.instrument_opinions ox where ox.instrument_id=i.id) then 'stale'
    else 'none'
  end coverage_status,
  c.as_of_date latest_consensus_date,c.consensus_stance,c.consensus_score,c.source_family_count,c.fresh_through
from public.instruments i
left join public.instrument_opinions o on o.instrument_id=i.id
left join lateral (select cc.* from public.instrument_opinion_consensus cc where cc.instrument_id=i.id order by cc.as_of_date desc limit 1) c on true
where i.is_active
group by i.id,i.symbol,c.as_of_date,c.consensus_stance,c.consensus_score,c.source_family_count,c.fresh_through;

alter table public.opinion_sources enable row level security;
alter table public.opinion_reviews enable row level security;
alter table public.opinion_source_review_results enable row level security;
alter table public.instrument_opinions enable row level security;
alter table public.instrument_opinion_consensus enable row level security;
alter table public.opinion_consensus_members enable row level security;

revoke all on public.opinion_sources from anon,authenticated;
revoke all on public.opinion_reviews from anon,authenticated;
revoke all on public.opinion_source_review_results from anon,authenticated;
revoke all on public.instrument_opinions from anon,authenticated;
revoke all on public.instrument_opinion_consensus from anon,authenticated;
revoke all on public.opinion_consensus_members from anon,authenticated;
revoke all on public.external_opinion_coverage_v1 from anon,authenticated;

drop policy if exists opinion_sources_no_client_access on public.opinion_sources;
create policy opinion_sources_no_client_access on public.opinion_sources for all to anon,authenticated using(false) with check(false);
drop policy if exists opinion_reviews_no_client_access on public.opinion_reviews;
create policy opinion_reviews_no_client_access on public.opinion_reviews for all to anon,authenticated using(false) with check(false);
drop policy if exists opinion_source_results_no_client_access on public.opinion_source_review_results;
create policy opinion_source_results_no_client_access on public.opinion_source_review_results for all to anon,authenticated using(false) with check(false);
drop policy if exists instrument_opinions_no_client_access on public.instrument_opinions;
create policy instrument_opinions_no_client_access on public.instrument_opinions for all to anon,authenticated using(false) with check(false);
drop policy if exists opinion_consensus_no_client_access on public.instrument_opinion_consensus;
create policy opinion_consensus_no_client_access on public.instrument_opinion_consensus for all to anon,authenticated using(false) with check(false);
drop policy if exists opinion_consensus_members_no_client_access on public.opinion_consensus_members;
create policy opinion_consensus_members_no_client_access on public.opinion_consensus_members for all to anon,authenticated using(false) with check(false);

grant select,insert,update,delete on public.opinion_sources,public.opinion_reviews,public.opinion_source_review_results,public.instrument_opinions,public.instrument_opinion_consensus,public.opinion_consensus_members to service_role;
grant select on public.external_opinion_coverage_v1 to service_role;

revoke all on all functions in schema external_opinion from public,anon,authenticated;
grant execute on all functions in schema external_opinion to service_role;

comment on schema external_opinion is 'Trusted service-only helpers for external-opinion-v1 ingestion, canonical identity, consensus and review lifecycle.';
comment on view public.external_opinion_coverage_v1 is 'Service-only coverage monitor for active instruments: current/stale/none opinion coverage and latest derived consensus.';