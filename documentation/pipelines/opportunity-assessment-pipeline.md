# Opportunity Assessment Pipeline

**System:** Discover Boulders Markets / Trading  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Canonical execution specification:** `automation/daily-opportunity-assessment.md`  
**Current canonical specification version:** `1.3`  
**Last reconciled:** 25 August 2026

## Purpose

The Opportunity Assessment pipeline is the long-term research workflow that answers:

> **What important real-world structural or technological changes could create major economic and investment opportunities over the coming months or years?**

It is deliberately independent from the short-term Market Assessment. It does not use Technical Engine results, ChatGPT Market Assessment conclusions, Market Convergence, Buy/Hold/Sell ratings or short-term price momentum as analytical inputs.

Supabase is the system of record for persisted results. GitHub is the system of record for the canonical execution methodology. The Scheduled Task is a runner: it must retrieve the current GitHub specification at the beginning of a run rather than carrying an independent copy of the methodology.

---

## Pipeline at a glance

```text
Scheduled/manual/test invocation
        |
        v
Retrieve automation/daily-opportunity-assessment.md fresh from GitHub
        |
        v
Create opportunity_assessment_runs audit row
        |
        v
Read active/watch Opportunity Themes + prior evidence
        |
        +---------------------------+
        |                           |
        v                           v
Structural Opportunity Signal   Technology Inflection Signal
        |                           |
        |                           +--> Technology Inflection Events
        |                           |
        +-------------+-------------+
                      |
                      v
             Opportunity Convergence
             opportunity_assessments
                      |
          +-----------+-------------+
          |                         |
          v                         v
 Listed instrument exposure     Research & Evidence
 tracked + external             TipTap document + embeds
          |                         |
          +-----------+-------------+
                      |
                      v
             Finalise run lifecycle
             succeeded / partial / failed
```

The Structural Opportunity Signal and Technology Inflection Signal must be produced independently. The Opportunity Assessment is calculated only after both have been completed for a theme.

---

## 1. Invocation and canonical control

Every run must begin by retrieving:

`automation/daily-opportunity-assessment.md`

fresh from `ClimbingBuddies/Trading`.

If the specification cannot be retrieved, the run must stop rather than use a remembered methodology or write new Opportunity Assessment results.

The canonical specification currently identifies version `1.3`. A run records the specification version and, when available, the GitHub content SHA in `public.opportunity_assessment_runs`.

### Execution sources

A run records its origin in `execution_source`:

- `scheduled-task` — production Scheduled Task;
- `manual-chat` — manually initiated run;
- `test` — explicit test execution.

Each invocation receives a new `run_id`, even when it updates the same day's idempotent theme-level results.

---

## 2. Schedule and trigger ownership

The production Scheduled Task is the trigger owner; the analytical methodology remains in GitHub.

- Every run retrieves `automation/daily-opportunity-assessment.md` fresh.
- The runner operates against the complete active/watch theme set and persists explicit lifecycle state.
- OPS-001 independently verified a complete unattended run, Research & Evidence updates and idempotent persistence.
- Runtime cadence and activation are operational configuration and should be checked directly when diagnosing a missed run; volatile task state is not copied into this durable pipeline reference.

---

## 3. Run lifecycle and audit trail

Every invocation creates a row in:

`public.opportunity_assessment_runs`

before research or signal writes begin.

Important fields include:

- `run_id`
- `assessment_date`
- `started_at`
- `completed_at`
- `status`
- `execution_source`
- `task_id`
- `model_reported`
- `reasoning_level_reported`
- `github_spec_version`
- `github_spec_sha`
- `themes_requested`
- `themes_completed`
- `notes`
- `error_message`

The assessment date is based on `Australia/Perth`.

A normal run lifecycle is:

```text
create run row
status = running
        |
        v
process active/watch themes
        |
        v
update themes_completed as work succeeds
        |
        +--> full success --> succeeded
        +--> incomplete but some work persisted --> partial
        +--> unrecoverable failure --> failed
```

The run must reach a terminal state. A workflow that leaves run records indefinitely in `running` is not Operational under the project definition.

### Recent verified run evidence

Live Supabase inspection on 17 August 2026 found successful scheduled runs for:

- 15 August 2026 — 10 requested / 10 completed;
- 16 August 2026 — 10 requested / 10 completed;
- 17 August 2026 — 10 requested / 10 completed.

The 17 August run used GitHub specification version `1.3` and reached `succeeded` with a non-null completion time.

---

## 4. Theme universe

The live theme set is stored in:

`public.opportunity_themes`

The task assesses every theme whose status is:

- `active`; or
- `watch`.

Supabase, not the static baseline list in the specification, is authoritative for the current universe.

The task may discover new themes from current evidence, but new themes should represent a distinct multi-year structural change, bottleneck or technological unlock rather than simply matching a predefined topic list. The specification normally limits new-theme creation to no more than three per daily run.

At verification time there were **10 active/watch themes**.

---

## 5. Structural Opportunity Signal

For each active/watch theme, the Structural assessment evaluates the real-world economic and adoption environment independently of short-term market analysis.

Persisted table:

`public.structural_opportunity_signals`

Core scoring dimensions are:

- demand;
- adoption;
- capital investment;
- capacity constraint;
- economics.

The canonical methodology version is:

`structural-signal-v1`

The stored `overall_score` is the average of the five component scores. Confidence is a separate judgement based on evidence quality, breadth, freshness and agreement.

Daily idempotency is enforced at the database level by the unique key:

`(theme_id, signal_date, methodology_version)`

A retry updates the same daily/methodology result rather than creating a duplicate, and `assessment_run_id` points to the most recent execution that wrote it.

At verification time, all 10 active/watch themes had a Structural Signal for 17 August 2026.

---

## 6. Technology Inflection Signal

The Technology assessment is produced independently of the Structural assessment.

Its governing question is:

> **Is an important technological bottleneck becoming materially easier to solve?**

Persisted table:

`public.technology_inflection_signals`

Core fields include:

- bottleneck;
- unlock description;
- maturity stage;
- bottleneck-unlock score;
- evidence-quality score;
- commercialisation score;
- impact score;
- overall score;
- confidence;
- signal label.

The canonical methodology version is:

`technology-inflection-v1`

Daily idempotency is enforced by the unique key:

`(theme_id, signal_date, methodology_version)`

At verification time, all 10 active/watch themes had a Technology Inflection Signal for 17 August 2026.

---

## 7. Technology Inflection Events

Material evidence supporting a Technology Inflection Signal may be persisted in:

`public.technology_inflection_events`

Examples include:

- scientific results;
- independent replication;
- engineering demonstrations;
- manufacturing breakthroughs;
- cost reductions;
- regulatory approvals;
- commercial contracts;
- first deployments;
- scaled deployments.

Each event may record the event date, event type, title, description, source, source URL and evidence strength.

The execution specification requires duplicate checking against recent theme/title/source/date combinations before insertion. Company claims must not be treated as equivalent to independent validation.

---

## 8. Opportunity Convergence

Only after the independent Structural and Technology signals are complete should the pipeline create or update:

`public.opportunity_assessments`

The canonical methodology version is:

`opportunity-convergence-v1`

When both inputs are available:

`opportunity_score = (structural_score + technology_inflection_score) / 2`

The record also retains:

- linked Structural Signal ID;
- linked Technology Inflection Signal ID;
- both component scores and confidences;
- overall Opportunity Score;
- Opportunity confidence;
- Opportunity level;
- commercial readiness;
- time horizon;
- summary;
- `assessment_run_id`.

Confidence is not a mechanical average when the two independent signals disagree. Meaningful divergence should be explained in the summary.

Database idempotency is enforced by:

`(theme_id, assessment_date, methodology_version)`

At verification time, all 10 active/watch themes had an Opportunity Assessment for 17 August 2026.

A high Opportunity Score is a long-term research conclusion, not a Buy recommendation.

---

## 9. Listed instrument exposure

The pipeline identifies credible publicly listed exposure to each Opportunity Theme without constraining the research to the existing Trading universe.

### Tracked instruments

Existing Trading-universe instruments are mapped in:

`public.opportunity_theme_instruments`

Its primary uniqueness is:

`(theme_id, instrument_id, exposure_type)`

### External listed instruments

Credible listed companies or ETFs that are not tracked by Trading are stored in:

`public.opportunity_theme_external_instruments`

Its uniqueness rule is:

`(theme_id, symbol, exchange_code, exposure_type)`

An external exposure is a research reference only. It does not automatically create a row in `public.instruments`, subscribe to market data, or enter the short-term Market Assessment universe.

### Unified read model

The canonical read/verification view is:

`public.opportunity_theme_all_exposures`

Exposure scores measure theme relevance/materiality, not expected share-price performance and not a trading recommendation.

---

## 10. Research & Evidence

Every completed Opportunity Assessment should have one associated Research & Evidence document in:

`public.assessment_research_documents`

For Opportunity documents:

- `document_scope = 'opportunity'`;
- `opportunity_assessment_id` links the assessment;
- `title = 'Research & Evidence'`;
- `content_schema_version = 'tiptap-v1'`;
- `generated_by = 'daily-opportunity-assessment'`.

The document stores valid TipTap/ProseMirror JSON plus searchable plain text.

Database uniqueness enforces one research document per Opportunity Assessment through a partial unique index on `opportunity_assessment_id`.

Rich evidence is stored in:

`public.assessment_research_embeds`

Embed records may connect articles, external links, charts, indicators, images or other evidence to Structural Signals, Technology Signals, Technology Events and Opportunity Assessments. The database prevents duplicate document-node identities through:

`(document_id, node_id)`

At verification time the live database contained **43 Opportunity Research documents** and **301 embeds** associated with Opportunity documents.

Retries should update the existing document and relevant embeds instead of generating duplicate daily research documents.

---

## 11. Retry and idempotency model

The pipeline separates **execution identity** from **daily analytical identity**.

### Execution identity

Every invocation receives a new row and new `run_id` in `opportunity_assessment_runs`.

This preserves an audit trail of attempts.

### Daily analytical identity

The theme-level daily outputs are idempotent:

- Structural Signal — unique per theme/date/methodology;
- Technology Signal — unique per theme/date/methodology;
- Opportunity Assessment — unique per theme/date/methodology;
- tracked exposure mapping — unique per theme/instrument/exposure type;
- external exposure mapping — unique per theme/symbol/exchange/exposure type;
- Research document — one per Opportunity Assessment;
- Research embed node — unique per document/node ID.

When a run is retried on the same Australia/Perth date, it should resume/update the current daily records and repoint `assessment_run_id` to the latest execution that wrote them. It must not produce duplicate daily Signal or Opportunity rows.

Technology events require explicit duplicate checks because their identity is evidence/event based rather than one-row-per-theme-per-day.

---

## 12. Failure handling

The task must fail safely.

### GitHub unavailable

If the canonical GitHub specification cannot be retrieved:

- do not use remembered methodology;
- do not write Opportunity Assessment results;
- report the failure.

### Supabase unavailable before run creation

If the run audit row cannot be created:

- stop;
- do not fabricate a `run_id`;
- report the failure.

### Partial execution

If some themes succeed and others fail:

- preserve valid completed work;
- keep `themes_completed` aligned with actual persisted results;
- terminate the run as `partial` or `failed` as appropriate;
- record useful failure detail in `notes` and/or `error_message`;
- allow the next invocation to resume idempotently.

A run should not be left indefinitely as `running` merely because some theme work failed.

---

## 13. Independence boundary

The Opportunity pipeline must not use these short-term systems as analytical inputs:

- `public.market_scores`;
- `public.technical_indicators`;
- `public.gpt_market_assessments`;
- `public.gpt_market_runs`;
- `public.market_convergence_assessments`;
- Buy/Hold/Sell ratings;
- short-term price momentum or technical signals.

It may read `public.instruments` only to determine whether an identified listed exposure is already tracked. Tracked/untracked status must not influence the exposure strength score.

The frontend may display Opportunity and Market information together after both systems have independently produced their results. Display proximity does not change the analytical independence rule.

---

## 14. Operational definition

Under `documentation/project-plan.md`, the Opportunity Assessment should be labelled **Operational** only when all applicable conditions are true:

1. required schema and implementation exist;
2. trigger/schedule ownership is explicit;
3. canonical GitHub methodology is retrieved fresh by the runner;
4. source data and research evidence are validated;
5. real Structural, Technology and Opportunity results are persisted;
6. Research & Evidence documents/embeds are persisted;
7. run lifecycle reaches a terminal state;
8. failures are recorded;
9. retries are idempotent and do not duplicate daily analytical records;
10. access policies are deliberate;
11. no privileged frontend secret is required;
12. a complete unattended end-to-end run has been independently verified;
13. documentation matches the actual flow.

### Implemented operational maturity

The pipeline has independently verified evidence for:

- complete active/watch theme coverage;
- populated Structural, Technology and final Opportunity outputs;
- Technology Inflection events, exposure mappings and Research & Evidence;
- terminal run lifecycle and recorded failures;
- idempotent same-date updates and resume behaviour;
- a thin GitHub-spec runner with explicit trigger ownership.

Dynamic row counts and task-toggle snapshots are intentionally omitted here because Supabase and the task configuration are the current production sources of truth.

---

## 15. Verification checklist

When auditing this pipeline, verify from primary evidence rather than relying on a dashboard alone:

- [ ] canonical GitHub specification is retrievable;
- [ ] current Scheduled Task state and schedule are known;
- [ ] a new execution creates an `opportunity_assessment_runs` row;
- [ ] active/watch theme count matches `themes_requested`;
- [ ] Structural Signal exists for every intended theme;
- [ ] Technology Signal exists for every intended theme;
- [ ] Opportunity Assessment links both independent Signals;
- [ ] `themes_completed` matches actual completed theme results;
- [ ] run reaches `succeeded`, `partial` or `failed` with `completed_at` set;
- [ ] same-day retry does not duplicate Signal or Opportunity rows;
- [ ] Technology Events are deduplicated;
- [ ] tracked and external exposures are economically representative;
- [ ] Research & Evidence document exists for completed Opportunity Assessments;
- [ ] embeds are linked to valid document/evidence records;
- [ ] no short-term Market/Technical result was used as an Opportunity input;
- [ ] frontend-visible results correspond to persisted Supabase records rather than fabricated fallback data.

---

## Related documentation

- `documentation/project-plan.md`
- `documentation/assessment-system-overview.md`
- `automation/daily-opportunity-assessment.md`
- `automation/project-plan-builder.md`
- `automation/project-plan-auditor.md`
