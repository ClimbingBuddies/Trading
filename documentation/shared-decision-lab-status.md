# Shared Decision Lab implementation

## Installed foundation — 17 September 2026

Migration `shared_decision_lab_foundation` adds shared calls, reviews and paper outcomes, plus a separate owner-only notes table. Existing personal tables and history remain unchanged. Raw generation evidence is private and inaccessible to browser roles.

`scripts/shared-decision-lab.sql` is the migration source. `scripts/test-shared-decision-lab.sql` is a rollback-only integration test against the existing instrument/assessment schema.

Verified against Supabase `glvbqcplgjdfgjyknzsa`:

- PASS: signed-in users can read the same shared call.
- PASS: another signed-in subject cannot read an owner's note.
- PASS: repeating the same note request returns the same ID without duplication.
- PASS: changing the payload while reusing its request ID is rejected.
- PASS: signed-in clients cannot rewrite AI calls.
- PASS: anonymous sessions cannot read shared calls or append private notes.
- PASS: the immutability trigger rejects privileged updates as well.
- PASS: raw generation evidence is not granted to clients.
- PASS: temporary fixtures were rolled back; no AI results were fabricated.

The Supabase security advisor flags the signed-in SECURITY DEFINER note function. This is intentional: it derives the owner from auth.uid(), rejects anonymous sessions, validates the target call, and accepts no owner parameter. Direct table writes remain revoked. The private evidence table deliberately has no access policies (deny by default). Existing unrelated project advisories remain outside this change.

## Remaining before switching the app

1. Implement a single shared candidate queue from the union of watchlists and open shared calls, with no owner identifiers in public results.
2. Implement canonical provider/benchmark settings, readiness checks, private source snapshots and hash-checked publication. Validate freshness and symbol identity; preserve original publication times. Do not copy personal history into shared records.
3. Implement append-only evaluation of shared positions and schedule it alongside existing legacy evaluation. Keep private notes out of all calculations. Verify entry/exit timing, costs and benchmark returns with deterministic fixtures.
4. Update canonical controller instructions to publish shared calls once, record unchanged reviews and explicit blockers, and preserve independent research.
5. Build the approved table and drawer. Retain access to legacy personal history. Verify actual sign-in, filters, shared evidence display and private note behavior in the browser.

No public AI publication endpoint exists yet. The dashboard and controller have not been switched to the new tables. This foundation is not an end-to-end completion claim.
