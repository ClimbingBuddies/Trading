-- Complete SEC-002 after the corrected frontend query is live in production.
--
-- The dashboard now requests only the approved seven-field published run envelope.
-- Remove the four temporary legacy column grants added while Vercel served the
-- pre-SEC-002 query shape. Row-level publication policies remain unchanged.

revoke select (
  model_name,
  prompt_version,
  analysis_mode,
  notes
) on table public.gpt_market_runs from anon, authenticated;
