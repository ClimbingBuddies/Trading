begin;
create table private.shared_research_source_receipts(
 id uuid primary key default gen_random_uuid(), source_url text not null,
 source_published_at timestamptz, verified_at timestamptz not null default clock_timestamp(),
 summary text not null check(length(trim(summary)) between 20 and 12000),
 content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
 check(source_published_at is null or source_published_at<=verified_at)
);
create function private.stamp_shared_research_receipt_v1() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin new.verified_at:=clock_timestamp();return new;end $$;
revoke all on function private.stamp_shared_research_receipt_v1() from public,anon,authenticated,service_role;
create trigger shared_research_receipt_clock before insert on private.shared_research_source_receipts for each row execute function private.stamp_shared_research_receipt_v1();
create table private.shared_research_evidence_links(
 evidence_id uuid primary key references public.gpt_market_evidence(evidence_id),
 source_receipt_id uuid not null references private.shared_research_source_receipts(id)
);
alter table private.shared_research_source_receipts enable row level security;
alter table private.shared_research_evidence_links enable row level security;
revoke all on private.shared_research_source_receipts,private.shared_research_evidence_links from public,anon,authenticated,service_role;
create trigger shared_research_receipts_immutable before update or delete on private.shared_research_source_receipts for each row execute function private.reject_prediction_change_v1();
create trigger shared_research_links_immutable before update or delete on private.shared_research_evidence_links for each row execute function private.reject_prediction_change_v1();
create table public.shared_research_recommendations(
 id uuid primary key default gen_random_uuid(),
 assessment_id uuid not null unique references public.gpt_market_assessments(assessment_id),
 instrument_id uuid not null references public.instruments(id),
 published_at timestamptz not null default clock_timestamp(), source_cutoff timestamptz not null,
 action text not null check(action in('BUY','WAIT','HOLD','SELL','REDUCE','AVOID')),
 thesis text not null check(length(trim(thesis)) between 20 and 12000),
 risks text not null check(length(trim(risks)) between 20 and 12000),
 model_identity text not null check(length(trim(model_identity)) between 3 and 200),
 input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),
 measurement_blocker text not null check(length(trim(measurement_blocker)) between 20 and 2000),
 check(source_cutoff<published_at)
);
create table private.shared_research_evidence(
 recommendation_id uuid primary key references public.shared_research_recommendations(id),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object')
);
alter table public.shared_research_recommendations enable row level security;
alter table private.shared_research_evidence enable row level security;
revoke all on public.shared_research_recommendations,private.shared_research_evidence from public,anon,authenticated,service_role;
create trigger shared_research_immutable before update or delete on public.shared_research_recommendations for each row execute function private.reject_prediction_change_v1();
create trigger shared_research_evidence_immutable before update or delete on private.shared_research_evidence for each row execute function private.reject_prediction_change_v1();

create function private.shared_research_input_v1(p_assessment uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a record; evidence jsonb; prices jsonb; count_all bigint; provenance jsonb;
begin
 select ass.*,r.analysis_cutoff_time,r.completed_at,r.analysis_mode,r.status run_status,
 i.symbol,i.instrument_name,i.exchange_code,trim(i.currency_code) currency
 into a from public.gpt_market_assessments ass join public.gpt_market_runs r on r.run_id=ass.run_id
 join public.instruments i on i.id=ass.instrument_id
 where ass.assessment_id=p_assessment and i.is_active and i.asset_type='equity' and i.exchange_code='ASX'
 and not ass.technical_engine_input_used and ass.methodology_version='independent-market-ai-v1'
 and r.analysis_mode in('manual','scheduled') and r.status in('succeeded','partial')
 and r.completed_at<=clock_timestamp() and ass.created_at<=clock_timestamp()
 and r.analysis_cutoff_time between clock_timestamp()-interval '24 hours' and r.completed_at
 and ass.assessment_date=(r.analysis_cutoff_time at time zone 'America/New_York')::date;
 if a.assessment_id is null then raise exception 'FRESH_INDEPENDENT_ASX_RESEARCH_REQUIRED';end if;
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
 'caveat','These frozen prices are research evidence from an unofficial provider. ASX paper-session attribution and an AUD benchmark remain unverified; no returns are calculated.') into provenance;
 return jsonb_build_object('contractVersion',1,'methodology','shared-research-only-v1','assessment',to_jsonb(a),
 'evidence',evidence,'prices',prices,'priceEvidence',provenance,'availablePriceRows',count_all,'omittedPriceRows',greatest(count_all-60,0),
 'measurementStatus','NOT_MEASURABLE','includedInPerformance',false);
end $$;

create function private.publish_shared_research_v1(p_assessment uuid,p_action text,p_thesis text,p_risks text,p_model text,p_input_hash text,p_blocker text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare old public.shared_research_recommendations%rowtype; a uuid; s jsonb; ident uuid; computed text;
begin
 select instrument_id into a from public.gpt_market_assessments where assessment_id=p_assessment;
 if a is null then raise exception 'ASSESSMENT_NOT_FOUND';end if;
 perform pg_advisory_xact_lock(hashtextextended('shared-decision:'||a::text,0));
 select * into old from public.shared_research_recommendations where assessment_id=p_assessment;
 if found then
 if old.action is distinct from p_action or old.thesis is distinct from trim(p_thesis)
 or old.risks is distinct from trim(p_risks) or old.model_identity is distinct from trim(p_model)
 or old.input_hash is distinct from p_input_hash or old.measurement_blocker is distinct from trim(p_blocker)
 then raise exception 'ASSESSMENT_RETRY_PAYLOAD_MISMATCH';end if;
 return old.id;
 end if;
 s:=private.shared_research_input_v1(p_assessment);
 computed:=encode(sha256(convert_to(s::text,'UTF8')),'hex');
 if computed is distinct from p_input_hash then raise exception 'INPUT_HASH_MISMATCH';end if;
 insert into public.shared_research_recommendations(assessment_id,instrument_id,source_cutoff,action,thesis,risks,model_identity,input_hash,measurement_blocker)
 values(p_assessment,a,(s#>>'{assessment,analysis_cutoff_time}')::timestamptz,p_action,trim(p_thesis),trim(p_risks),trim(p_model),p_input_hash,trim(p_blocker)) returning id into ident;
 insert into private.shared_research_evidence values(ident,s);
 return ident;
end $$;

create function public.shared_research_recommendations_v1(p_scope text default 'all') returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare user_id uuid:=auth.uid();payload jsonb;
begin
 if user_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Permanent sign-in required';end if;
 if p_scope is null or p_scope not in('all','watched') then raise exception 'Invalid filter';end if;
 with scoped as materialized(
 select r.* from public.shared_research_recommendations r
 where p_scope='all' or exists(select 1 from public.watchlist_items wi join public.watchlists w on w.id=wi.watchlist_id
 where wi.instrument_id=r.instrument_id and w.owner_user_id=user_id)
 ), latest as(
 select distinct on(instrument_id) * from scoped order by instrument_id,published_at desc,id desc
 ), active as(
 select l.* from latest l where not exists(select 1 from public.shared_decision_calls c where c.instrument_id=l.instrument_id and c.published_at>l.published_at)
 ), decisions as(
 select r.*,jsonb_build_object('id',r.id,'assessmentId',r.assessment_id,'action',r.action,'thesis',r.thesis,'risks',r.risks,
 'modelIdentity',r.model_identity,'publishedAt',r.published_at,'sourceCutoff',r.source_cutoff) decision from scoped r
 )
 select jsonb_build_object('contractVersion',1,'generatedAt',clock_timestamp(),'items',coalesce(jsonb_agg(
 jsonb_build_object('instrument',jsonb_build_object('id',i.id,'symbol',i.symbol,'name',i.instrument_name,'exchange',i.exchange_code,'currency',trim(i.currency_code)),
 'original',(select d.decision from decisions d where d.instrument_id=l.instrument_id order by published_at,id limit 1),
 'latest',(select d.decision from decisions d where d.id=l.id),
 'history',(select jsonb_agg(d.decision order by d.published_at,d.id) from decisions d where d.instrument_id=l.instrument_id),
 'sources',e.snapshot->'evidence','priceEvidence',e.snapshot->'priceEvidence','measurementStatus','NOT_MEASURABLE','measurementBlocker',l.measurement_blocker,
 'includedInPerformance',false) order by i.symbol),'[]')) into payload
 from active l join public.instruments i on i.id=l.instrument_id join private.shared_research_evidence e on e.recommendation_id=l.id;
 return payload;
end $$;
revoke all on function private.shared_research_input_v1(uuid),private.publish_shared_research_v1(uuid,text,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.shared_research_recommendations_v1(text) from public,anon,service_role;
grant execute on function public.shared_research_recommendations_v1(text) to authenticated;
commit;

