# Trading Platform Documentation

This directory documents the current Discover Boulders Markets platform. Obsolete delivery-status narratives have been removed; historical implementation evidence remains in the audit records.

## Source-of-truth order

1. Supabase production schema, functions, schedules, policies and persisted results.
2. GitHub application source and canonical methodologies.
3. Vercel deployment configuration and production behaviour.
4. Historical audit records for how a result was verified.

The [canonical project plan](project-plan.md) controls authorised work. The [development workflow](development-workflow.md) requires documentation-impact review for significant architecture, schema, security, automation and operational changes.

## Architecture and product

- [Platform architecture](platform-architecture.md)
- [Assessment system overview](assessment-system-overview.md)
- [Supabase data model](supabase-data-model.md)
- [Frontend route map](frontend-route-map.md)
- [Functional roadmap](functional-roadmap.md)
- [Mobile interaction review](mobile-interaction-review.md)
- [Palette compliance review](palette-compliance-review.md)

## User guide

- [Platform user guide](user-guide.md) — canonical user documentation for the production platform; rendered in-app at `/help`
- [User guide project plan](user-guide-project-plan.md)
- [User guide controller journal](user-guide-controller-journal.md)
- [In-app User Guide agentic project](in-app-user-guide-project-plan.md) — publishes the canonical guide at `/help`
- [In-app User Guide controller journal](in-app-user-guide-controller-journal.md)
- [In-app User Guide agentic controller](../automation/in-app-user-guide-agentic-controller.md)

## Market data and short-term assessment

- [Market data pipeline](pipelines/market-data-pipeline.md)
- [Historical market-data backfill](pipelines/historical-market-data-backfill.md)
- [Market Assessment pipeline](pipelines/market-assessment-pipeline.md)
- [Daily Market Assessment specification](../automation/daily-market-assessment.md)
- [Technical calculation specification](specifications/technical-calculation-specification.md)
- [Technical indicator pipeline](pipelines/technical-indicator-pipeline.md)
- [Technical scoring specification](specifications/technical-market-scoring-specification.md)
- [Technical scoring pipeline](pipelines/technical-market-scoring-pipeline.md)
- [Technical Engine operations](pipelines/technical-engine-operations.md)
- [Technical Engine independence evidence](pipelines/technical-engine-independence.md)
- [Market Convergence specification](specifications/market-convergence-specification.md)
- [Market Convergence pipeline](pipelines/market-convergence-pipeline.md)

## Long-term Opportunity research

- [Opportunity Assessment pipeline](pipelines/opportunity-assessment-pipeline.md)
- [Daily Opportunity Assessment specification](../automation/daily-opportunity-assessment.md)
- [External opinion model](specifications/external-opinion-model.md)
- [External opinion pipeline](pipelines/external-opinion-pipeline.md)

## Monitoring and private workspaces

- [My Dashboard agentic project plan](my-dashboard-agentic-project-plan.md) — personal recommendations, watchlists, Opportunities, portfolio health and forward paper-decision feedback
- [My Dashboard controller journal](my-dashboard-controller-journal.md)
- [My Dashboard agentic controller](../automation/my-dashboard-agentic-controller.md)
- [Watchlist access model](security/watchlist-auth-model.md)
- [Watchlist activation](watchlist-activation.md)
- [Alert trigger specification](specifications/alert-trigger-specification.md)
- [Alert lifecycle](alert-lifecycle.md)
- [Operational runbook](operational-runbook.md)
- [Security and operational notes](security-and-operational-notes.md)

## Strategy laboratory

- [Strategy framework](strategy-framework.md)
- [Daily Trend Pullback strategy](specifications/daily-trend-pullback-strategy.md)
- [Backtest specification](specifications/daily-trend-pullback-backtest-v1.md)
- [Test-run ingestion contract](specifications/strategy-test-run-ingestion.md)
- [Baseline backtest result](backtests/daily-trend-pullback-v1-baseline-result.md)
- [Standard strategy review](strategy-reviews/daily-trend-pullback-v1-standard-review.md)

The first strategy review outcome is `VALIDATE_ROBUSTNESS / continue_testing`. Live trading remains disabled.

## Security

- [Market Assessment access classification](security/market-assessment-access-classification.md)
- [Helper-function search-path hardening](security/helper-function-search-path-hardening.md)
- [pg_net extension review](security/pg-net-extension-review.md)
- [Watchlist authentication and ownership](security/watchlist-auth-model.md)

## Delivery and audit evidence

- [Canonical project plan](project-plan.md)
- [My Dashboard agentic project plan](my-dashboard-agentic-project-plan.md)
- [Controller journal](project-controller-journal.md)
- [Independent task audits](project-audits/)
- [User guide delivery plan](user-guide-project-plan.md)
- [User guide controller journal](user-guide-controller-journal.md)
- [In-app User Guide delivery plan](in-app-user-guide-project-plan.md)
- [In-app User Guide controller journal](in-app-user-guide-controller-journal.md)

Audit records and completed plan entries are retained as durable evidence. They are not current-work instructions.
