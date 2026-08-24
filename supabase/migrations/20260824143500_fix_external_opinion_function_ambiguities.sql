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
    delete from public.opinion_source_review_results rr where rr.review_id=r.id;
  else
    insert into public.opinion_reviews(review_date,triggered_by,methodology_version,status)
    values(p_review_date,p_triggered_by,'external-opinion-v1','running') returning * into r;
  end if;
  insert into public.opinion_source_review_results(review_id,source_id,status)
  select r.id,s.id,'pending' from public.opinion_sources s where s.is_active
  on conflict on constraint opinion_source_review_results_pkey do nothing;
  return query select r.id,r.status,false,r.attempt_count;
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
  select ins.id into i from public.instruments ins where ins.symbol=p_instrument_symbol and ins.is_active;
  if i is null then raise exception 'Unknown active instrument %',p_instrument_symbol; end if;
  select * into s from public.opinion_sources src where src.source_key=p_source_key and src.is_active;
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
  on conflict do nothing returning id into oid;
  if oid is null then
    select o.id into oid from public.instrument_opinions o where o.instrument_id=i and o.observation_key=okey;
  else
    did_insert:=true;
  end if;
  update public.opinion_reviews r set opinions_seen=r.opinions_seen+1, opinions_inserted=r.opinions_inserted+(case when did_insert then 1 else 0 end), duplicates_skipped=r.duplicates_skipped+(case when did_insert then 0 else 1 end) where r.id=p_review_id;
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
  v_consensus_id uuid;
  previous record;
  stance text;
  score numeric;
  material boolean;
  created_count integer:=0;
begin
  select * into r from public.opinion_reviews rv where rv.id=p_review_id;
  if not found then raise exception 'Unknown opinion review'; end if;
  for inst in select ins.id from public.instruments ins where ins.is_active loop
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
      delete from public.instrument_opinion_consensus cc where cc.instrument_id=inst.id and cc.as_of_date=r.review_date;
      continue;
    end if;
    score:=round(c.score,2);
    if (c.bullish_count+c.positive_news_count)>0 and (c.bearish_count+c.negative_news_count)>0 and abs(score-50)<10 then stance:='mixed';
    elsif score>=72.5 then stance:='bullish';
    elsif score>=57.5 then stance:='positive';
    elsif score>=42.5 then stance:='neutral';
    elsif score>=27.5 then stance:='negative';
    else stance:='bearish'; end if;
    select cc.consensus_stance,cc.consensus_score into previous from public.instrument_opinion_consensus cc where cc.instrument_id=inst.id and cc.as_of_date<r.review_date order by cc.as_of_date desc limit 1;
    material:=previous.consensus_stance is not null and (previous.consensus_stance is distinct from stance or abs(coalesce(previous.consensus_score,score)-score)>=15);
    insert into public.instrument_opinion_consensus(instrument_id,review_id,as_of_date,analyst_count,bullish_count,neutral_count,bearish_count,positive_news_count,negative_news_count,consensus_stance,consensus_score,key_change,is_material_change,generated_at,methodology_version,source_family_count,coverage_status,fresh_through)
    values(inst.id,p_review_id,r.review_date,c.analyst_count,c.bullish_count,c.neutral_count,c.bearish_count,c.positive_news_count,c.negative_news_count,stance,score,
      case when previous.consensus_stance is null then 'Initial deduplicated external-opinion consensus.' else 'Consensus '||previous.consensus_stance||' -> '||stance||'; score '||coalesce(previous.consensus_score::text,'n/a')||' -> '||score::text end,
      material,clock_timestamp(),'external-opinion-consensus-v1',c.source_family_count,'current',c.fresh_through)
    on conflict(instrument_id,as_of_date) do update set review_id=excluded.review_id,analyst_count=excluded.analyst_count,bullish_count=excluded.bullish_count,neutral_count=excluded.neutral_count,bearish_count=excluded.bearish_count,positive_news_count=excluded.positive_news_count,negative_news_count=excluded.negative_news_count,consensus_stance=excluded.consensus_stance,consensus_score=excluded.consensus_score,key_change=excluded.key_change,is_material_change=excluded.is_material_change,generated_at=excluded.generated_at,methodology_version=excluded.methodology_version,source_family_count=excluded.source_family_count,coverage_status=excluded.coverage_status,fresh_through=excluded.fresh_through
    returning id into v_consensus_id;
    delete from public.opinion_consensus_members m where m.consensus_id=v_consensus_id;
    insert into public.opinion_consensus_members(consensus_id,opinion_id,evidence_family_key,canonical_source_key)
    select v_consensus_id,d.id,d.canonical_source_key||':'||d.claim_hash,d.canonical_source_key
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

revoke all on function external_opinion.prepare_review_v1(date,text) from public,anon,authenticated;
revoke all on function external_opinion.ingest_opinion_v1(uuid,text,text,text,text,text,text,text,timestamptz,text,text,numeric,text,text,text,numeric,boolean) from public,anon,authenticated;
revoke all on function external_opinion.rebuild_consensus_v1(uuid) from public,anon,authenticated;
grant execute on function external_opinion.prepare_review_v1(date,text) to service_role;
grant execute on function external_opinion.ingest_opinion_v1(uuid,text,text,text,text,text,text,text,timestamptz,text,text,numeric,text,text,text,numeric,boolean) to service_role;
grant execute on function external_opinion.rebuild_consensus_v1(uuid) to service_role;