# Security and Operational Notes

**Last reconciled:** 25 August 2026

This document summarises the durable Trading platform security and operational boundaries. Detailed decisions and dated evidence remain in the linked specifications, pipelines and audit records.

## Frontend credential model

The Next.js frontend uses the Supabase project URL and publishable key from deployment environment variables.

It does not use a Supabase service-role/secret key or the Twelve Data API key. Backend credentials remain in trusted Supabase/Vercel execution paths. SEC-005 removed hard-coded frontend fallbacks and independently verified fallback-free production routes.

## Public read surfaces

Unauthenticated users may read the deliberately published Market, Assessment and Opportunity outputs required by the public dashboard.

The Market Assessment boundary is defined in [Market Assessment Access Classification](security/market-assessment-access-classification.md):

- only approved terminal non-test output and linked evidence are public read-only;
- run control, queues, schedule logs, writes and orchestration remain internal;
- client writes are denied;
- orchestration functions remain trusted-backend-only.

## Private owner workspaces

Watchlists, alerts and strategies are permanent-user private workspaces.

- `watchlists` and `watchlist_items` use owner and parent-owner RLS.
- `alerts` uses owner-scoped CRUD while evaluator-generated `alert_events` is owner-readable and not browser-writable.
- strategy definitions, test runs and decision evaluations are owner-scoped.
- anonymous and authenticated-anonymous identities are not accepted as v1 owners.
- no privileged credential is exposed to the frontend.

See [Watchlist Authentication and Ownership Model](security/watchlist-auth-model.md), [Watchlist Activation](watchlist-activation.md), [Alert Lifecycle](alert-lifecycle.md) and [Strategy Framework](strategy-framework.md).

## Internal analytical and orchestration boundaries

- The Technical Engine and Market Convergence write paths are service-only; public/client writes remain denied.
- External-opinion collection, consensus and lineage are service-only and cannot write Technical, Convergence or Opportunity conclusions.
- Market AI, Technical Engine and Opportunity Assessment retain their documented analytical-independence boundaries.
- Retryable workflows use explicit lifecycle state and deterministic/idempotent identities.

## Database hardening

SEC-003 applied empty fixed search paths and qualified application references to the application-owned helper functions. The independent audit confirmed preserved execution grants and live smoke paths.

SEC-004 reviewed the non-relocatable `pg_net` extension. Its supported `net` schema placement and remaining advisory warning are explicitly accepted with documented rationale.

Relevant records:

- [Helper-function search-path hardening](security/helper-function-search-path-hardening.md)
- [pg_net extension review](security/pg-net-extension-review.md)
- [SEC-003 audit](project-audits/SEC-003.md)
- [SEC-004 audit](project-audits/SEC-004.md)
- [SEC-005 audit](project-audits/SEC-005.md)

## Historical Market backlog

OPS-007 resolved the orphan queue backlog and stale test-run lifecycle non-destructively. Historical assessment/evidence content and schedule logs remain preserved; the rows are not replayed as current work.

## Trading safety boundary

The platform stores strategy evidence and review decisions but does not authorise live trading. The first persisted strategy remains `VALIDATE_ROBUSTNESS / continue_testing` with live execution disabled.
