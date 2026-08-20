-- Harden SEC-003 helper-function name resolution.
--
-- Every application relation and row-type reference in these function bodies is
-- already schema-qualified. Pinning search_path to the empty string leaves
-- pg_catalog built-ins available while preventing caller-controlled or future
-- schema objects from changing how trusted helpers resolve names.

alter function public.begin_market_assessment_attempt(bigint)
  set search_path = '';

alter function public.claim_market_assessment_queue(text)
  set search_path = '';

alter function public.enforce_market_ai_independence_metadata()
  set search_path = '';

alter function public.finalize_chatgpt_market_assessment(bigint, uuid, text)
  set search_path = '';

alter function public.finalize_market_assessment_queue(bigint, text, uuid, text)
  set search_path = '';

alter function public.prepare_chatgpt_market_assessment(date, text, text)
  set search_path = '';

alter function public.process_market_assessment_queue()
  set search_path = '';

alter function public.queue_daily_market_assessment()
  set search_path = '';

alter function public.set_trading_updated_at()
  set search_path = '';
