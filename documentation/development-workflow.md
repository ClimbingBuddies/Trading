# Development Workflow — Documentation Impact Checklist

**Applies to:** all significant changes to the Trading platform  
**Repository:** `ClimbingBuddies/Trading`  
**Last reviewed:** 25 August 2026

## Purpose

Documentation is part of the implementation contract. A significant architecture or schema change is not ready for review until the canonical documentation affected by that change is updated in the same change set.

The repository pull-request template links to this checklist so documentation impact is considered during normal development rather than after implementation.

## Required documentation-impact decision

Every significant change must make one explicit decision before review:

- **Documentation updated** — the change affects a documented contract and the relevant canonical files are updated in the same change set; or
- **No canonical documentation change required** — only when the change does not alter architecture, schema, security/access, automation/scheduling, operational behaviour, methodology, public routes/data contracts or another documented platform contract. The reason must be stated in the pull request.

For a **significant architecture or schema change**, `No canonical documentation change required` is not a valid choice. The relevant documentation must be updated.

## Documentation triggers and canonical targets

| Change type | Documentation that must be reviewed and updated when affected |
|---|---|
| Architecture, subsystem boundaries or source-of-truth ownership | `documentation/platform-architecture.md`, `documentation/assessment-system-overview.md`, relevant pipeline/specification documents |
| Database table/view/column/relationship or migration | `documentation/supabase-data-model.md`, relevant pipeline/specification documents |
| RPC/function, RLS policy, grants, auth or ownership boundary | `documentation/supabase-data-model.md`, relevant file under `documentation/security/`, `documentation/security-and-operational-notes.md` where applicable |
| Scheduled job, automation controller, retry/idempotency or lifecycle behaviour | relevant file under `automation/`, relevant `documentation/pipelines/` operations document, and `documentation/operational-runbook.md` when recovery behaviour changes |
| Assessment, scoring, convergence or strategy methodology | the canonical versioned specification/methodology file and any pipeline document that describes execution or persisted provenance |
| Frontend route, user-facing data source or cross-system presentation boundary | `documentation/frontend-route-map.md` and relevant frontend/architecture documentation |
| Deployment, environment-variable, secret or operational ownership change | root `README.md`, `documentation/security-and-operational-notes.md`, `documentation/operational-runbook.md` where applicable |
| New canonical documentation file | `documentation/README.md` and any other navigation/index that should expose it |
| Project-controller protocol or delivery-state contract | `automation/project-plan-builder.md`, `automation/project-plan-auditor.md`, `documentation/project-plan.md` as applicable |

This table is a review map, not permission to update unrelated documentation. Change only the canonical files whose contract actually changed.

## Pull-request checklist

Before a change is ready for review:

1. Identify whether architecture, schema, security/access, automation/scheduling, operational behaviour, methodology or frontend data contracts changed.
2. Update every canonical document affected by those changes in the same change set.
3. For schema changes, confirm the documentation reflects the final table/view/function/RLS/grant state, not only migration intent.
4. For architecture changes, confirm diagrams/text still match actual source-of-truth and analytical-independence boundaries.
5. For automation or operational changes, document schedule/ownership, lifecycle, retry/idempotency and failure/recovery behaviour where affected.
6. For new documents, add them to the documentation map.
7. In the pull request, select `Documentation updated` or state a concrete reason why no canonical documentation change is required.
8. Verify links and file names after the documentation changes are committed.

## Review gate

A reviewer should return the change for rework when a significant architecture/schema change is present but the relevant canonical documentation is missing, materially stale or contradicts the implementation.

Documentation must describe the implemented contract. Do not document guessed future behaviour as though it is already deployed or operational.

## Source-of-truth order

When reconciling documentation with implementation, use:

1. Supabase production truth for persisted schema/data/functions/policies/schedules;
2. GitHub source and canonical methodology for application/automation contracts;
3. Vercel deployment and production behaviour where the documented contract is deployment-dependent.

The checklist does not weaken the existing Builder/Auditor evidence rules. It makes documentation impact an explicit part of normal development review.