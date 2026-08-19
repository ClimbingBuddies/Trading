-- Temporary SEC-002 compatibility bridge while the corrected frontend deployment is pending.
--
-- The row-level publication boundary remains in force: clients can still see only
-- completed terminal `scheduled` runs. This migration temporarily restores SELECT
-- on the four legacy run columns requested by the currently deployed frontend so
-- production routes do not fail while Vercel is serving the pre-SEC-002 query shape.
--
-- Remove these four grants once the frontend commit that reads only the approved
-- seven-field published run envelope is live in production.

grant select (
  model_name,
  prompt_version,
  analysis_mode,
  notes
) on table public.gpt_market_runs to anon, authenticated;
