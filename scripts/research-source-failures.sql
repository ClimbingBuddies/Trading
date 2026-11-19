-- Read-only operational diagnostic. No raw documents, symbols or account data.
-- A source can have saved opinions and still fail complete collection.
with latest_review as (
  select * from public.opinion_reviews
  order by started_at desc, id desc
  limit 1
)
select r.review_date, r.started_at, r.completed_at, r.status as review_status,
       r.instruments_checked, r.coverage_current, r.coverage_stale, r.coverage_none,
       s.source_key, s.is_active as source_currently_active,
       sr.status as source_status, sr.items_seen, sr.opinions_inserted,
       sr.duplicates_skipped, sr.error_message is not null as has_error,
       case when sr.error_message in (
         'ISSUER_SOURCE_COVERAGE_INCOMPLETE', 'ANALYST_SOURCE_COVERAGE_INCOMPLETE',
         'APPROVED_NEWS_SOURCE_UNAVAILABLE', 'APPROVED_REGULATORY_SOURCE_UNAVAILABLE',
         'SPECIALIST_SOURCE_VERIFICATION_INCOMPLETE', 'READER_SIZE_LIMIT',
         'READER_FETCH_UNAVAILABLE', 'DYNAMIC_INDEX_UNREADABLE', 'SOURCE_ACCESS_DENIED',
         'SOURCE_RATE_LIMITED', 'SOURCE_DOCUMENT_MISSING', 'SOURCE_CONTENT_UNVERIFIED',
         'RUNTIME_READER_CAPABILITY_UNAVAILABLE'
       ) then sr.error_message
         when sr.error_message is not null then 'DETAIL_REQUIRES_PRIVATE_REVIEW'
       end as source_reason,
       case when sr.metadata ->> 'collection_contract' = 'research-source-recovery-v1'
            then 'research-source-recovery-v1' end as collection_contract,
       case when coalesce(sr.metadata ->> 'source_sha', sr.metadata ->> 'sourceSha') ~ '^[0-9a-f]{40}$'
            then coalesce(sr.metadata ->> 'source_sha', sr.metadata ->> 'sourceSha') end as source_sha,
       case when sr.metadata ->> 'collection_contract' = 'research-source-recovery-v1'
                   and jsonb_typeof(sr.metadata -> 'coverage_ledger') = 'array'
            then 'LEDGER_PRESENT_REQUIRES_SCOPE_AND_EVIDENCE_REVIEW'
            else 'COLLECTION_TELEMETRY_UNVERIFIED' end as telemetry_state,
       case when jsonb_typeof(sr.metadata -> 'coverage_ledger') = 'array'
            then jsonb_array_length(sr.metadata -> 'coverage_ledger') end as ledger_rows
from latest_review r
left join public.opinion_source_review_results sr on sr.review_id = r.id
left join public.opinion_sources s on s.id = sr.source_id
order by s.source_key nulls last;
