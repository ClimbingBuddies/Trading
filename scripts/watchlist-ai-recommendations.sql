begin;
create or replace function private.shared_research_input_v1(p_assessment uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a record; evidence jsonb; prices jsonb; count_all bigint; provenance jsonb;
begin
 select ass.*,r.analysis_cutoff_time,r.completed_at,r.analysis_mode,r.status run_status,
 i.symbol,i.instrument_name,i.exchange_code,trim(i.currency_code) currency
 into a from public.gpt_market_assessments ass join public.gpt_market_runs r on r.run_id=ass.run_id
 join public.instruments i on i.id=ass.instrument_id
 where ass.assessment_id=p_assessment and i.is_active and i.asset_type='equity' and i.exchange_code in('ASX','NYSE','NASDAQ')
 and not ass.technical_engine_input_used and ass.methodology_version='independent-market-ai-v1'
 and r.analysis_mode in('manual','scheduled') and r.status in('succeeded','partial')
 and r.completed_at<=clock_timestamp() and ass.created_at<=clock_timestamp()
 and r.analysis_cutoff_time between clock_timestamp()-interval '24 hours' and r.completed_at
 and ass.assessment_date=(r.analysis_cutoff_time at time zone 'America/New_York')::date;
 if a.assessment_id is null then raise exception 'FRESH_INDEPENDENT_RESEARCH_REQUIRED';end if;
 if not exists(select 1 from public.watchlist_items where instrument_id=a.instrument_id) then raise exception 'WATCHED_INSTRUMENT_REQUIRED';end if;
 if exists(select 1 from private.shared_decision_config where instrument_id=a.instrument_id and enabled)
 then raise exception 'USE_MEASURABLE_PUBLICATION_PATH';end if;
 if exists(select 1 from public.gpt_market_assessments x join public.gpt_market_runs r on r.run_id=x.run_id
 where x.instrument_id=a.instrument_id and x.created_at>a.created_at and not x.technical_engine_input_used
 and r.analysis_mode in('manual','scheduled') and r.status in('succeeded','partial') and r.completed_at<=clock_timestamp())
 then raise exception 'NEWER_ASSESSMENT_AVAILABLE';end if;
 -- Every direct source needs a trusted receipt made before the cutoff.
 if exists(select 1 from public.gpt_market_evidence e
 left join private.shared_research_evidence_links l on l.evidence_id=e.evidence_id
 left join private.shared_research_source_receipts v on v.id=l.source_receipt_id
 where e.assessment_id=p_assessment and e.instrument_opinion_id is null
 and (v.id is null or v.verified_at>a.analysis_cutoff_time
 or v.source_published_at>a.analysis_cutoff_time or v.source_url is distinct from e.source_url
 or v.summary is distinct from e.evidence_text))
 then raise exception 'DIRECT_SOURCE_CUTOFF_PROOF_REQUIRED';end if;
 -- An atomic opinion is available only at its observed_at, not an invented filing time.
 if exists(select 1 from public.gpt_market_evidence e join public.instrument_opinions o on o.id=e.instrument_opinion_id
 where e.assessment_id=p_assessment and (o.observed_at is null or o.observed_at>a.analysis_cutoff_time or o.source_published_at>a.analysis_cutoff_time))
 then raise exception 'FUTURE_SOURCE_EVIDENCE';end if;
 select jsonb_agg(jsonb_build_object('id',e.evidence_id,'type',e.evidence_type,'name',e.source_name,'url',e.source_url,
 'text',e.evidence_text,'confidence',e.confidence,'opinionId',e.instrument_opinion_id,'canonicalSourceKey',e.canonical_source_key,'availableAt',coalesce(o.observed_at,v.verified_at),
 'sourcePublishedAt',coalesce(o.source_published_at,v.source_published_at),'contentHash',v.content_hash)
 order by e.evidence_id) into evidence from public.gpt_market_evidence e
 left join public.instrument_opinions o on o.id=e.instrument_opinion_id
 left join private.shared_research_evidence_links l on l.evidence_id=e.evidence_id
 left join private.shared_research_source_receipts v on v.id=l.source_receipt_id where e.assessment_id=p_assessment;
 if coalesce(jsonb_array_length(evidence),0)=0 then raise exception 'SOURCE_EVIDENCE_REQUIRED';end if;
 select count(*) into count_all from public.market_observations o where o.instrument_id=a.instrument_id
 and o.interval_code='1day' and o.loaded_at<=a.analysis_cutoff_time and o.observed_at<a.analysis_cutoff_time
 and trim(o.currency_code)=a.currency and o.close>0;
 select coalesce(jsonb_agg(to_jsonb(p) order by p.observed_at,p.id),'[]') into prices from(
 select o.id,o.provider_id,pr.provider_name,o.observed_at,o.loaded_at,o.close::text close,o.adjusted_close::text adjusted_close,o.raw_payload
 from public.market_observations o join public.data_providers pr on pr.id=o.provider_id where o.instrument_id=a.instrument_id and o.interval_code='1day'
 and o.loaded_at<=a.analysis_cutoff_time and o.observed_at<a.analysis_cutoff_time
 and trim(o.currency_code)=a.currency and o.close>0 order by o.observed_at desc,o.id desc limit 60)p;
 select jsonb_build_object('status',case when jsonb_array_length(prices)>0 then 'AVAILABLE' else 'ABSENT' end,
 'latestAt',prices->-1->'observed_at','latestLoadedAt',prices->-1->'loaded_at',
 'providers',coalesce((select jsonb_agg(distinct x->>'provider_name') from jsonb_array_elements(prices)x),'[]'::jsonb),
 'sampleRows',jsonb_array_length(prices),'availableRows',count_all,'omittedRows',greatest(count_all-60,0),
 'caveat','Frozen provider labels identify these research observations. Verified '||a.exchange_code||' paper-session attribution, provider mapping and a '||a.currency||' benchmark are still required; no returns are calculated.') into provenance;
 return jsonb_build_object('contractVersion',1,'methodology','shared-research-only-v1','assessment',to_jsonb(a),
 'evidence',evidence,'prices',prices,'priceEvidence',provenance,'availablePriceRows',count_all,'omittedPriceRows',greatest(count_all-60,0),
 'measurementStatus','NOT_MEASURABLE','includedInPerformance',false);
end $$;

create function public.watchlist_ai_recommendations_v1() returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare user_id uuid:=auth.uid(); payload jsonb;
begin
 if user_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Permanent sign-in required';end if;
 with watched as materialized(
 select distinct wi.instrument_id from public.watchlist_items wi join public.watchlists w on w.id=wi.watchlist_id where w.owner_user_id=user_id
 ), candidates as(
 select a.instrument_id,a.assessment_id,a.rating,a.assessment_date,a.created_at,a.summary,a.key_risks,a.model_version,
 null::text ai_action,'SCHEDULED_ASSESSMENT'::text source_kind,r.analysis_cutoff_time source_cutoff,null::uuid saved_record_id,null::text measurement_blocker
 from public.gpt_market_assessments a join public.gpt_market_runs r on r.run_id=a.run_id join watched w on w.instrument_id=a.instrument_id
 where r.analysis_mode='scheduled' and r.status in('succeeded','partial') and r.completed_at<=clock_timestamp()
 and r.analysis_cutoff_time<=r.completed_at and a.created_at<=clock_timestamp()
 and a.methodology_version='independent-market-ai-v1' and not a.technical_engine_input_used
 union all
 select c.instrument_id,c.assessment_id,a.rating,(c.source_cutoff at time zone 'America/New_York')::date,c.published_at,c.thesis,c.risks,c.model_identity,
 c.action,'SHARED_CALL',c.source_cutoff,c.id,null::text from public.shared_decision_calls c
 join public.gpt_market_assessments a on a.assessment_id=c.assessment_id join watched w on w.instrument_id=c.instrument_id
 union all
 select c.instrument_id,d.assessment_id,a.rating,(d.source_cutoff at time zone 'America/New_York')::date,d.published_at,d.thesis,d.risks,d.model_identity,
 d.action,'SHARED_CALL',d.source_cutoff,d.id,null::text from public.shared_decision_reviews d join public.shared_decision_calls c on c.id=d.call_id
 join public.gpt_market_assessments a on a.assessment_id=d.assessment_id join watched w on w.instrument_id=c.instrument_id
 union all
 select r.instrument_id,r.assessment_id,a.rating,(r.source_cutoff at time zone 'America/New_York')::date,r.published_at,r.thesis,r.risks,r.model_identity,
 r.action,'RESEARCH_ONLY',r.source_cutoff,r.id,r.measurement_blocker from public.shared_research_recommendations r
 join public.gpt_market_assessments a on a.assessment_id=r.assessment_id join watched w on w.instrument_id=r.instrument_id
 ), latest as(
 select distinct on(instrument_id) * from candidates order by instrument_id,source_cutoff desc,created_at desc,coalesce(saved_record_id,assessment_id) desc
 )
 select jsonb_build_object('contractVersion',1,'items',coalesce(jsonb_agg(to_jsonb(l) order by instrument_id),'[]'::jsonb)) into payload from latest l;
 return payload;
end $$;
revoke all on function public.watchlist_ai_recommendations_v1() from public,anon,service_role;
grant execute on function public.watchlist_ai_recommendations_v1() to authenticated;
commit;
