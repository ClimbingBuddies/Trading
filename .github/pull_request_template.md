## Change summary

Describe the implementation and the user/system contract it changes.

## Verification

- [ ] Relevant implementation checks/tests have been run.
- [ ] Production/deployment evidence is included when the change affects deployed behaviour.
- [ ] No fabricated data, evidence or success state was introduced.

## Documentation impact — required

Review [`documentation/development-workflow.md`](../documentation/development-workflow.md) before marking this change ready for review.

Select exactly one:

- [ ] **Documentation updated** — affected canonical documentation is updated in this change set.
- [ ] **No canonical documentation change required** — this change does not alter a documented architecture, schema, security/access, automation/scheduling, operational, methodology or frontend data contract. Explain why below.

**Reason when no documentation change is required:**

<!-- Required when selecting "No canonical documentation change required". -->

### Documentation trigger checklist

Check each applicable trigger and confirm the corresponding documentation has been updated:

- [ ] **Architecture/source-of-truth boundary changed** → `documentation/platform-architecture.md`, `documentation/assessment-system-overview.md`, and relevant pipeline/specification docs reviewed/updated.
- [ ] **Database schema/migration changed** → `documentation/supabase-data-model.md` and relevant pipeline/specification docs reviewed/updated.
- [ ] **RPC/function/RLS/grants/auth/ownership changed** → data-model and relevant security documentation reviewed/updated.
- [ ] **Scheduler/automation/retry/lifecycle changed** → relevant `automation/` specification, pipeline/operations documentation and runbook reviewed/updated.
- [ ] **Assessment/scoring/convergence/strategy methodology changed** → canonical versioned specification/methodology and persisted-provenance documentation reviewed/updated.
- [ ] **Frontend route or user-facing data source changed** → `documentation/frontend-route-map.md` and relevant architecture/frontend docs reviewed/updated.
- [ ] **Deployment/environment/secret/operational ownership changed** → root `README.md`, security/operational notes and runbook reviewed/updated as applicable.
- [ ] **New canonical documentation added** → `documentation/README.md` and other relevant navigation/index files updated.
- [ ] **None of the above apply.**

> **Review gate:** if a significant architecture or schema change is present, the `Documentation updated` option must be selected and the relevant canonical documentation must be part of the same change set. A reviewer should return the change for rework if that documentation is missing or materially stale.

## Security and operational boundary

- [ ] No privileged frontend secret or service-role credential was introduced.
- [ ] Existing RLS/ownership and analytical-independence boundaries remain deliberate, or their approved changes are documented.
- [ ] Accepted historical evidence/results were not rewritten merely to make current state appear healthy.