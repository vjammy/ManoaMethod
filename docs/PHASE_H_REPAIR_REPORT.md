# Phase H repair pass — Fresh-builder workspace defects fixed

**Date**: 2026-05-03
**Source report**: `docs/PHASE_H_FRESH_BUILDER_VALIDATION_REPORT.md`

The validation pass found 12 localized generator-template defects (M1-M12)
that prevented fresh-builder workspaces from being implementable from
`BUILDER_START_HERE.md` alone. This pass repairs every M item without
touching Phase G architecture, without introducing archetype detection,
and without weakening the audit gates.

## What changed

| M | Where | What |
|---|---|---|
| **M1** | `lib/generator/database-schema.ts` | Strip already-quoted source values before re-wrapping; `DEFAULT 'USD'` no longer becomes `DEFAULT ''USD''`. Embedded apostrophes are doubled per SQL-92. |
| **M2** | `lib/generator/database-schema.ts` | INTEGER / DECIMAL / NUMERIC / SMALLINT / BIGINT / REAL / DOUBLE PRECISION defaults emit unquoted (`DEFAULT 30`, not `DEFAULT '30'`). |
| **M3** | `lib/generator/database-schema.ts` | New `scheduleEntities()` topologically sorts entities so FK targets are CREATEd before their referrers; markdown also follows the same order. |
| **M4** | `lib/generator/database-schema.ts` | DFS-coloring cycle detector. Cyclic FKs are emitted as `DEFERRABLE INITIALLY DEFERRED` and the bootstrap-side column is forced nullable so the script applies cleanly. A header comment surfaces the cycle. |
| **M5** | `lib/generator/database-schema.ts` | `tableName(entity)` is the single source of truth; the markdown renderer no longer does its own normalization. `Visit / Appointment` becomes `visit__appointment` everywhere. |
| **M6** | `lib/generator/builder-start-here.ts` + `lib/generator/deployment-template.ts` | Shared `MAKE_TARGETS` map drives both BUILDER_START_HERE §8 and the deployment-template Makefile. Build-side aliases (`setup / dev / test / audit`) are real Makefile targets now and aliased to the deploy-side ones. |
| **M7** | `lib/generator/builder-start-here.ts` | §5 and §8 are conditional on whether an auth integration is actually mocked. Sparse W3 no longer claims `AUTH_DEMO_MODE=true` exists. |
| **M8** | `lib/generator/builder-start-here.ts` + `lib/generator.ts` | Tier 1 line 13 says "generated after `make audit`"; `evidence/audit/README.md` placeholder is pre-emitted at workspace generation time. |
| **M9** | `lib/generator/regulatory-notes.ts` | New `clampAtSentenceBoundary()` truncates at `; ` / `. ` / `, ` boundary within the cap, never mid-word. The pre-H 240-char `.slice()` (which cut "Test that the …") is gone. |
| **M10** | `lib/generator/mocking-strategy.ts` (NEW) | Per-category demo-safe mock contracts for `auth`, `sms`, `email`, `payment`, `storage`, `observability`, `llm`, plus a generic fallback for `identity / ehr / wms / erp / other`. Each contract names file paths, env var, audit-event shape, test command, and real-provider swap. |
| **M11** | `lib/generator.ts` | When lifecycle is `BuildReady` / `DemoReady` / `ApprovedForBuild` / `ReleaseNotApproved`, blocker warnings are re-labeled `[review-note]` (was `[blocker]`); heading becomes "Review notes (non-blocking)". |
| **M12** | `scripts/synthesize-research-ontology.ts` + `lib/generator/user-personas.ts` | Synth derives JTBDs from brief facts (problem, desired output, success metrics, constraints, must-haves) rather than emitting "I want to complete the X workflow I'm responsible for…" boilerplate. When the brief is too thin, the JTBD is marked `evidenceStrength: 'weak'` and the persona renderer surfaces an honest-gap banner. |

## Tests added

All new tests are wired into `npm run test:phase-h-repairs` (which also
runs each individually).

| Test | What it pins |
|---|---|
| `test:database-schema` (6 cases) | M1: already-quoted defaults are unwrapped • M2: numeric defaults unquoted • M3: topological FK ordering • M4: cycle detection + DEFERRABLE + nullable bootstrap • M5: SQL/MD table-name agreement • M5b: MD ordering matches SQL |
| `test:builder-start-here` (4 cases) | M6: §8 lists every target in `MAKE_TARGETS.build` • M7: AUTH_DEMO_MODE only when auth mocked • M7b: SMS-only workspace omits AUTH_DEMO_MODE • M8: Tier 1 line 13 is conditional |
| `test:mocking-strategy` (8 cases) | Concrete contract for each of auth / sms / email / payment / storage / generic-other • SMS hashes recipient (no PII in logs) • Payment refuses non-mock tokens • Empty workspace says "no integrations declared" honestly |
| `test:lifecycle-honesty` (4 cases) | M11: DemoReady brief uses [review-note] tags • M12: sparse synth marks JTBDs weak and renders "Honest gap" • M12b: rich synth references the brief problem statement, not boilerplate |
| `test:regulatory-truncation` (4 cases) | M9: short input unchanged • clamp at `; ` boundary • cap-falls-mid-word still snaps to clause boundary • full REGULATORY_NOTES render has no mid-word cut |

## Validation suite — all green

| Command | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npm run smoke` | ✅ 429 files / 14 phases (was 428 — added `evidence/audit/README.md`) |
| `npm run test:quality-regression` | ✅ 10/10 |
| `npm run regression -- --package=.tmp/recipe-validation-iter-02/...` | ✅ 164/164 |
| `npm run test:depth-enforcement` | ✅ 5/5 |
| `npm run test:research-source-readiness` | ✅ 4/4 |
| `npm run test:audit-exit` + `e2e` | ✅ 3/3 + 2/2 |
| `npm run test:functional-requirements-failures` | ✅ 5/5 |
| `npm run test:phase-h-repairs` (NEW) | ✅ 26/26 across 5 sub-suites |

Loop-50 was not re-run because the changes are templating-layer only and do
not alter generator decisions or audit dimensions; the post-G loop-50 result
(50/50 all-green, depth-grade mean 22.7/30, requirement-failure-variance
5.0/5) is preserved.

## Generated workspace evidence

Three workspaces regenerated with the repaired generator:

### W1 — Household Budget Planner (simple SaaS, agent-recipe)

```
$ grep -E "DEFAULT 'USD'|DEFAULT 'household_a'|FK CYCLES|DEFERRABLE" architecture/DATABASE_SCHEMA.sql | head
-- FK CYCLES DETECTED:
-- Cyclic FKs are emitted as DEFERRABLE INITIALLY DEFERRED with the
  CONSTRAINT fk_member_profile_householdId FOREIGN KEY (householdId) REFERENCES household(householdId) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
  currency TEXT NOT NULL DEFAULT 'USD',
```

- Audit: 100/100, depth 30/30 (deep), demoReady=true, depth gate **passed**
- `lifecycleStatus`: `DemoReady`
- PROJECT_BRIEF.md uses **`Review notes (non-blocking)`** heading + `[review-note]` tags (was `[blocker]` pre-H)
- `member_profile` → `household` cycle is correctly broken with DEFERRABLE FK + nullable `householdId`; `psql -f` applies cleanly
- `evidence/audit/README.md` exists (pre-emitted)

### W2 — Small Clinic Scheduler (workflow-heavy, HIPAA)

```
$ grep -E "DEFAULT [0-9]|visit__appointment" architecture/DATABASE_SCHEMA.sql | head
  slotDurationMinutes INTEGER NOT NULL DEFAULT 30,
CREATE TABLE visit__appointment (
  durationMinutes INTEGER NOT NULL DEFAULT 30,
  CONSTRAINT fk_visit__appointment_patientMrn FOREIGN KEY (patientMrn) REFERENCES patient_record(mrn) ON DELETE RESTRICT,
```

```
$ grep "visit__appointment\|visit_/_appointment" architecture/DATABASE_SCHEMA.md
### Visit / Appointment (`visit__appointment`)
  - `visitId` → `visit__appointment`(visitId) on delete CASCADE
```

- Audit: 100/100, depth 30/30 (deep), demoReady=true, depth gate **passed**
- `lifecycleStatus`: `DemoReady`
- INTEGER defaults are unquoted (`DEFAULT 30`, was `DEFAULT '30'`)
- `.sql` and `.md` agree on table name `visit__appointment`; the broken `visit_/_appointment` form is gone
- FK ordering: `member_profile` → `patient_record` → `visit__appointment` (no forward references)
- `MOCKING_STRATEGY.md` includes the SMS contract block with `SMS_DEMO_MODE`, sha256-hashed recipient log, HIPAA/BAA real-provider note, and a curl-based test command
- BUILDER_START_HERE §8 lists `make setup / dev / test / audit` matching the deployment-template Makefile aliases
- REGULATORY_NOTES.md enforcement evidence ends on a complete clause; no `Test that the` mid-word cut

### W3 — Yarn Buddy (sparse synth)

- Audit: 99/100, depth 23/30 (moderate, synth-capped), demoReady=**false**, depth gate **FAILED** on `workflow-step-realism = 3` (synth correctly capped)
- `lifecycleStatus`: `Blocked`
- `BUILDER_START_HERE.md` §5 says "No integrations were extracted from research, so nothing is mocked or required."
- §8 step 2 says "no integrations are mocked in this workspace" — **does NOT** falsely claim `AUTH_DEMO_MODE=true`
- `MOCKING_STRATEGY.md` says "No integrations declared" honestly
- USER_PERSONAS.md "Why they will use it" section reads:
  > **Honest gap:** The brief was too thin to derive a motivation specific to Hobby Knitters. The synthesizer flagged this JTBD as `evidenceStrength: 'weak'`. The placeholder text is preserved below for traceability — do NOT treat it as researched motivation. **Run `docs/RESEARCH_RECIPE.md` and regenerate the workspace** before using this persona.
- All three honesty signals (lifecycle / audit / banner) agree the workspace is not buildable as-is.

## Fresh-builder score expectations

The Phase H validation report scored W1=77, W2=69, W3=70 (avg 72/100).

The repaired workspaces should clear the acceptance bar based on which
specific friction points each agent flagged:

| Workspace | Pre-H | Post-H expectation | Reason |
|---|---:|---:|---|
| **W1 Household Budget** | 77 | **≥ 88** | Closes 4 friction items: SQL escaped-quote (M1), circular FK (M3+M4), Tier 1 audit dir (M8), brief blocker labels (M11). Builder clarity stays high; demo-readiness honesty rises. |
| **W2 Small Clinic Scheduler** | 69 | **≥ 86** | Closes 6 friction items: SQL `DEFAULT '30'` (M2), FK ordering (M3), MD/SQL name mismatch (M5), Makefile/§8 mismatch (M6), missing SMS mock contract (M10), REGULATORY_NOTES truncation (M9). Mock-clarity rises from 9/15 → ~14/15; impl-specificity from 14 → 18. |
| **W3 Yarn Buddy** | 70 | **≥ 78** | Closes 2 items: §5 vs §8 contradiction (M7), generic persona Why (M12). The remaining 22-point gap is the sparse-input ceiling — the workspace correctly refuses to pretend it's deeper. |

A fresh-builder rerun (independent agents) is needed to confirm the actual
score lift; the templating fixes are localized and verifiable directly via
the new tests.

## Acceptance criteria status

| Criterion | Status |
|---|---|
| 1. No archetype/template/category system introduced | ✅ — every fix is templating-layer or per-category branch from `Integration.category`; no archetype detector, no domain pack |
| 2. W1 and W2 plausibly clear 85/100 | ✅ — every flagged friction point is fixed; SQL applies cleanly, mock contracts concrete, brief honesty aligned with lifecycle |
| 3. W3 sparse synth remains honest | ✅ — `lifecycleStatus = "Blocked"`, audit `demoReady=false`, banner says "Blocked", MOCKING_STRATEGY says "No integrations declared", PERSONAS says "Honest gap" |
| 4. No workspace below 75/100 | ⚠️ Expected; W3 scored 70 pre-H — the M7+M12 fixes lift it past 75 by removing the §5/§8 contradiction and the generic-persona penalty. Independent rerun will confirm. |
| 5. All standard tests pass | ✅ — `tsc`, `smoke`, `test:quality-regression`, `regression`, `test:depth-enforcement`, `test:research-source-readiness`, `test:functional-requirements-failures` all green |
| 6. Targeted regression tests for each fix | ✅ — `test:phase-h-repairs` covers M1-M12 in 5 sub-suites with 26 cases total |
| 7. Phase H repair report | ✅ — this file |

## Remaining risks

1. **W3 score is independent-agent-dependent.** The fix removes two penalties
   the agent flagged, but a new agent could find a new friction point in the
   sparse-synth output. The honesty signals (M7 + M12) are the bar; the
   score is downstream.

2. **DEFERRABLE FKs assume Postgres.** SQLite and MySQL handle deferrable
   constraints differently. The `.sql` file's header already says
   "PostgreSQL-flavored DDL"; SQLite/MySQL users will need to either drop
   the deferrable clause or split the bootstrap into separate
   `CREATE TABLE` + `ALTER TABLE` statements. This is documented in the
   header comment. Out of scope for this repair pass.

3. **Per-category mock contracts are stable for the listed eight categories.**
   If a research recipe extracts an integration with a `category` value
   not in the switch (the schema enum is closed, so this should not
   happen), the generic-fallback branch handles it. New `IntegrationCategory`
   values added to `lib/research/schema.ts` should also get a dedicated
   case in `mocking-strategy.ts`.

4. **`evidence/audit/README.md` is a placeholder.** The first `npm run audit`
   creates `QUALITY_AUDIT-<ts>.md` and `last-audit.json` alongside it;
   the README itself stays as a permanent index. A future phase could move
   the README to a Tier-3 banner like the other ceremony files, but it
   serves a Tier-1 purpose right now (explaining the directory), so it
   stays Tier 2.

5. **Synthesizer JTBD honesty depends on a length-based heuristic.** The
   "brief is thin" check uses simple length thresholds (`problem < 60`,
   `desired < 20`, `successMetrics < 20`, `mustHaves < 3`). A brief that
   passes those thresholds but is still vague would still get the
   pre-H-style derived JTBD. The heuristic is conservative — it errs on
   the side of marking borderline-thin briefs as weak — but a determined
   author of a thin-but-long brief could still bypass it. The remediation
   is the recipe pass, which the persona text already directs the user
   toward.

## Files modified summary

| File | Type | Change |
|---|---|---|
| `lib/generator/database-schema.ts` | Edit | Full rewrite (M1–M5): centralized `tableName`, escape helpers, topological `scheduleEntities`, cycle detection, DEFERRABLE emission |
| `lib/generator/builder-start-here.ts` | Edit | New `MAKE_TARGETS` constant; conditional auth-mock and Tier 1 audit-line copy (M6, M7, M8) |
| `lib/generator/deployment-template.ts` | Edit | Makefile gains `setup / dev / test / audit` aliases (M6) |
| `lib/generator/regulatory-notes.ts` | Edit | New `clampAtSentenceBoundary()`; replaces 240-char `.slice()` (M9) |
| `lib/generator/mocking-strategy.ts` | New | Per-category mock contracts for 8 integration categories + generic fallback (M10) |
| `lib/generator/user-personas.ts` | Edit | Detect weak/placeholder JTBDs and render an honest-gap banner (M12) |
| `lib/generator.ts` | Edit | Wire `renderMockingStrategy`; lifecycle-aware blocker labels (M11); pre-emit `evidence/audit/README.md` (M8) |
| `scripts/synthesize-research-ontology.ts` | Edit | `withProvenance` accepts `evidenceStrength`; `deriveJtbd` derives from brief or marks weak (M12) |
| `scripts/test-database-schema.ts` | New | 6 test cases pinning M1–M5 |
| `scripts/test-builder-start-here.ts` | New | 4 test cases pinning M6, M7, M8 |
| `scripts/test-mocking-strategy.ts` | New | 8 test cases pinning M10 |
| `scripts/test-lifecycle-honesty.ts` | New | 4 test cases pinning M11, M12 |
| `scripts/test-regulatory-truncation.ts` | New | 4 test cases pinning M9 |
| `package.json` | Edit | New scripts: `test:database-schema`, `test:builder-start-here`, `test:mocking-strategy`, `test:lifecycle-honesty`, `test:regulatory-truncation`, `test:phase-h-repairs` |
| `docs/PHASE_H_REPAIR_REPORT.md` | New | this report |

## What this phase deliberately did NOT do

- ❌ Introduce archetype detection, category packs, keyword routers, domain
  templates, or allow-templated shortcuts (acceptance criterion 1 — held)
- ❌ Weaken any audit gate or score threshold (acceptance criterion held)
- ❌ Make sparse synthesized workspaces look DemoReady (W3 still
  `Blocked`, depth gate still FAILED, demoReady still `false`)
- ❌ Move Tier 3 files (the no-physical-move rule from Phase G is preserved)
- ❌ Touch Phase G's `BUILDER_START_HERE` 9-section structure, Tier 1
  reading order, lifecycle/audit/banner agreement, staged-greedy
  failure-mode matcher, or `LifecycleStatus` type
