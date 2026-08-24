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
  v_stance text;
  v_score numeric;
  v_material boolean;
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
      count(*) filter(where d.opinion_type in ('analyst_rating','analyst_target')) analyst_count,
      count(*) filter(where d.opinion_type in ('analyst_rating','analyst_target') and d.stance in ('bullish','positive')) bullish_count,
      count(*) filter(where d.opinion_type in ('analyst_rating','analyst_target') and d.stance in ('neutral','mixed','unknown')) neutral_count,
      count(*) filter(where d.opinion_type in ('analyst_rating','analyst_target') and d.stance in ('bearish','negative')) bearish_count,
      count(*) filter(where d.opinion_type not in ('analyst_rating','analyst_target') and d.stance in ('bullish','positive')) positive_news_count,
      count(*) filter(where d.opinion_type not in ('analyst_rating','analyst_target') and d.stance in ('bearish','negative')) negative_news_count,
      avg(case d.stance when 'bullish' then 90 when 'positive' then 70 when 'neutral' then 50 when 'mixed' then 50 when 'unknown' then 50 when 'negative' then 30 when 'bearish' then 10 end)::numeric score,
      count(distinct d.canonical_source_key) source_family_count,
      max(d.effective_at) fresh_through
    into c from d;
    if coalesce(c.total,0)=0 then
      delete from public.instrument_opinion_consensus cc where cc.instrument_id=inst.id and cc.as_of_date=r.review_date;
      continue;
    end if;
    v_score:=round(c.score,2);
    if (c.bullish_count+c.positive_news_count)>0 and (c.bearish_count+c.negative_news_count)>0 and abs(v_score-50)<10 then v_stance:='mixed';
    elsif v_score>=72.5 then v_stance:='bullish';
    elsif v_score>=57.5 then v_stance:='positive';
    elsif v_score>=42.5 then v_stance:='neutral';
    elsif v_score>=27.5 then v_stance:='negative';
    else v_stance:='bearish'; end if;
    select cc.consensus_stance,cc.consensus_score into previous from public.instrument_opinion_consensus cc where cc.instrument_id=inst.id and cc.as_of_date<r.review_date order by cc.as_of_date desc limit 1;
    v_material:=previous.consensus_stance is not null and (previous.consensus_stance is distinct from v_stance or abs(coalesce(previous.consensus_score,v_score)-v_score)>=15);
    insert into public.instrument_opinion_consensus(instrument_id,review_id,as_of_date,analyst_count,bullish_count,neutral_count,bearish_count,positive_news_count,negative_news_count,consensus_stance,consensus_score,key_change,is_material_change,generated_at,methodology_version,source_family_count,coverage_status,fresh_through)
    values(inst.id,p_review_id,r.review_date,c.analyst_count,c.bullish_count,c.neutral_count,c.bearish_count,c.positive_news_count,c.negative_news_count,v_stance,v_score,
      case when previous.consensus_stance is null then 'Initial deduplicated external-opinion consensus.' else 'Consensus '||previous.consensus_stance||' -> '||v_stance||'; score '||coalesce(previous.consensus_score::text,'n/a')||' -> '||v_score::text end,
      v_material,clock_timestamp(),'external-opinion-consensus-v1',c.source_family_count,'current',c.fresh_through)
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

revoke all on function external_opinion.rebuild_consensus_v1(uuid) from public,anon,authenticated;
grant execute on function external_opinion.rebuild_consensus_v1(uuid) to service_role;