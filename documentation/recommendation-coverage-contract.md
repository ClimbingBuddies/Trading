# Recommendation coverage contract v1

Scope: all seven currently watched active instruments; Recommendations must show saved genuine AI views including published manual research-only calls. Complete missing FIG source-based research without claiming NYSE paper support.

Reader public.watchlist_ai_recommendations_v1() permanent sign-in, auth.uid owner watchlists only, safe projection no notes/raw data. JSON contractVersion1/items array of Assessment-shape records: assessment_id,instrument_id,rating,assessment_date,created_at,summary,key_risks,model_version plus ai_action nullable enum, source_kind SCHEDULED_ASSESSMENT/SHARED_CALL/RESEARCH_ONLY, source_cutoff, saved_record_id nullable,measurement_blocker nullable. Choose latest source cutoff then publication/creation timestamp then stable recordID from completed independent scheduled assessments, immutable shared calls/reviews and published research-only records. Do not expose arbitrary unpublished manual/test/rerun assessments. Older than72h remains labelled.

Watchlist UI loads this guarded reader rather than direct scheduled-only table. Explicit saved action takes priority over assessment rating; matching personal plan can supply timing only for same assessment/horizon. Research-only view never inherits personal tracking plan; displays research-only/not measurable and blocker. Preserve scoped list/auth cancellation, errors/empty and safe private note behavior.

Extend guarded research publisher from ASX to ASX/NYSE/NASDAQ watched active equities lacking enabled measurable configuration; no bypass for configured instruments. Keep temporal receipts, immutable bundles, exact retries, provider-specific raw provenance and performance exclusion. Existing ASX originals unchanged. Dynamic venue/provider caveat must not falsely label Tiingo unofficial or NYSE ASX.

Lead owns SQL/migration, research/data, docs/release. Dashboard owns WatchlistsClient.tsx and SharedResearchRecommendations.tsx generic venue notice only. Tester/reviewer inspect final frozen revision independently; no live fake fixtures outside rollback.

Production acceptance: union of seven active watched instruments is covered; the largest actual owner scope contains six and must not receive the other owner's NVDA. Controller coverage uses trusted instrument/assessment/publication metadata, never fabricated user sessions.
