# Phase G — E1–E9 Implementation Report

**Date:** 2026-05-03
**Trigger:** all 9 enhancements from `docs/MVP_BUILDER_11_CRITERIA_EVALUATION.md` § "Recommended enhancements"
**Scope:** ship every E1–E9 item the evaluation report identified.

## Summary

| # | Enhancement | Status | Audit-dim impact |
|---|---|---|---|
| E1 | Wire `runBrowserLoop` into orchestrator OPTIONAL commands | ✅ shipped | none directly; lets gate engine record browser-loop output |
| E2 | Built-app fixture + `npm run test:browser-loop` | ✅ shipped + 1 real bug fix surfaced (resolveSampleValue) | regression coverage; closes silent-rot risk |
| E3 | Auto-regression emits `_uiCounterEvidence.json` + `RESEARCH_GAP_PROMPT_iteration-NN.md` | ✅ shipped | closes the missing 4 ↔ 11 closed-loop edge |
| E4 | Persona narratives differentiated per actor | ✅ shipped + reviewer-detection regex broadened | persona-depth (synth-cap held; agent-recipe lift expected) |
| E5 | Per-step failure derivation from `step.branchOn` + `step.systemResponse` | ✅ shipped | requirement-failure-variance (existing test now 5/5) |
| E6 | Domain-shaped fields per entity from entity-name templates | ✅ shipped + `inferDbType` widened for `number` types | entity-field-richness (clinic schema went from 4 to 7+ fields/entity, with FKs and ENUMs) |
| E7 | Tier-3 banner coverage expanded to agent-specific entry/handoff files | ✅ shipped (physical relocation deferred — see § "What was scoped down") | reduces builder-noise; ARCHIVE_INDEX cataloging widened |
| E8 | Lifecycle = `BuildReady` requires generator-time depth-gate proxy | ✅ shipped | tightens BuildReady label; agent-recipe with thin workflows now downgrades to ReviewReady |
| E9 | Trailing-punctuation stripped from actor names | ✅ shipped | `Practice Managers.` → `Practice Managers` across personas, requirements, schema enum, flow IDs |

## Audit deltas (3-case eval set, synth path)

Re-running the same 3 cases used for the 11-criteria evaluation:

| Case | Score (before → after) | Depth (before → after) | Files (before → after) | Persona "Why" lines |
|---|---|---|---|---|
| SDR | 96/100 → 96/100 | 23/30 (77 %) → 24/30 (80 %) | 404 → 466 | 1 templated → 4 differentiated |
| Clinic | 97/100 → 97/100 | 23/30 (77 %) → 24/30 (80 %) | ~430 → ~490 | 1 templated → 4 differentiated |
| Restaurant | 97/100 → 96/100 | 23/30 (77 %) → 24/30 (80 %) | ~390 → ~452 | 1 templated → 3 differentiated |

The headline /100 score is at the cap so it can't move; the depth grade gain (+1 on every case) and the synth-cap-aware dim breakdown is where the real lift lives. Restaurant dropping 1 point is within audit noise (rounding on one of the 12 dims).

## Per-enhancement evidence

### E1 — orchestrator OPTIONAL commands

`lib/orchestrator/commands.ts:7` now lists `loop:browser` alongside `test`, `lint`, `validate`, `regression`. The gate engine detects whether the (workspace OR built-app) `package.json` defines the script and runs it if so; result feeds `runGateChecks` and `buildScorecard` like any other command.

Limit: this only enforces UI passing if the *built app's* package.json exposes `loop:browser` (or the orchestrator runs from a workspace that does). The build recipe needs to standardize this; for now the wiring is in place.

### E2 — browser-loop fixture

New files:

- `tests/fixtures/mini-built-app/RUNTIME_TARGET.md` — declares URL, command, smoke route
- `tests/fixtures/mini-built-app/server.js` — vanilla `http` server (zero deps)
- `tests/fixtures/mini-built-app/SAMPLE_DATA.md` — one Greeting entity, one happy sample
- `tests/fixtures/mini-built-app/requirements/ACCEPTANCE_CRITERIA.md` — REQ-1
- `tests/fixtures/mini-built-app/phases/phase-01/PLAYWRIGHT_FLOWS/primary-user-greet.json` — happy + negative + rolePermission
- `tests/fixtures/mini-built-app/repo/manifest.json` — package marker
- `scripts/test-browser-loop-fixture.ts` — spawns the runner, asserts probe + flow execution + flow pass + evidence dir
- `package.json:42` — adds `"test:browser-loop": "tsx scripts/test-browser-loop-fixture.ts"`

Bug surfaced and fixed inside this enhancement:
- `scripts/mvp-builder-loop-browser.ts:resolveSampleValue` — strict `f.entityName === entityName` comparison failed because SAMPLE_DATA.md headers carry the parenthesized id suffix (`## Sales (\`entity-core\`)`) while flow `valueFromSample` references use the bare name. Fixed by also matching the bare name before ` (`.

Pass output:
```
PASS: probePassed === true (fixture server responded at /)
PASS: discoverFlows found 1 flow(s)
PASS: runner executed 1/1 flow(s)
PASS: all 1/1 flows passed (happy + negative + role-permission)
PASS: evidenceDir contains 2 entries (screenshots / report / etc.)
DONE.
```

### E3 — research-gap counter-evidence

New types and helpers in `scripts/mvp-builder-auto-regression.ts`:

- `UiCounterEvidence` and `UiCounterEvidenceRecord` types
- `writeUiCounterEvidence({ packageRoot, iteration, reasonForEmit, browserReqResults, priorRecords })` — accumulates failing REQs across iterations, persists to `research/extracted/_uiCounterEvidence.json`
- `readPriorUiCounterEvidence(packageRoot)` — re-loads prior records so a new iteration's failures are merged with history
- `buildResearchGapPrompt({ iteration, reasonForEmit, records, counterEvidencePath })` — renders the researcher-targeted markdown

Wire-in: inside the iteration loop (after `failingPhases` is computed, immediately after the existing fix-prompt write), the new helpers run when `combinedScore < target`. Output:

```
research/extracted/_uiCounterEvidence.json
research/RESEARCH_GAP_PROMPT_iteration-NN.md
```

Console adds: `Research-gap signal: <N> REQs flagged → <path>; prompt: <path>`.

This closes the criterion 4 ↔ 11 edge that the 11-criteria evaluation flagged as "missing": built-app UI failures now generate a research-side artifact (separate audience from the builder fix prompt).

### E4 — persona differentiation

`scripts/synthesize-research-ontology.ts:deriveJtbd` now takes `workflows: Workflow[]` and computes per-actor:

- `wfsAsPrimary` / `wfsAsSecondary` — workflows the actor primary-owns vs participates in
- `failuresMentioningActor` — failure modes whose trigger or effect names the actor's role
- `mustHaveForActor` — round-robins through `mustHaves` so each actor gets a different one
- type-aware motivation / outcome / workaround / hireForCriteria branches: reviewer / primary-user / external / secondary-with-ownedWorkflow / secondary-with-participation / fallback

Same file, separately: the reviewer-name regex was broadened from `/\b(review|approve|manager|coordinator|owner|admin)\b/i` to `/\b(review|approve|manager|coordinator|owner|admin|supervisor|lead)/i` (no trailing word boundary, so plurals like `Managers` match).

Verified: clinic now produces 4 distinct motivation paragraphs (clinic-schedulers vs providers vs front-desk-staff vs practice-managers) with different role framing; previously every persona had the same wording with the actor name swapped.

### E5 — per-step failure derivation

`lib/generator.ts:buildFunctionalRequirementsFromResearch` failure-note logic gained a middle branch: when a step has no greedy-assigned failure mode but DOES have a `branchOn`, derive a concrete per-step failure note from `step.branchOn` + `step.systemResponse`:

```
On "Validation failure" the system does not "update the record, write audit entry, and surface change to allowed actors";
surface the branch to the actor and require an explicit recovery (retry, escalate, or revise).
```

Previously: same step printed `"On 'Validation failure' path, no dedicated researched failure mode applies; route to the workflow-level mitigations …"` — pointer text, not actionable.

`npm run test:functional-requirements-failures` continues to pass 5/5 (T5 = 5/5 requirement-failure-variance, 31 failure lines, 0 duplicates).

### E6 — domain entity fields

`scripts/synthesize-research-ontology.ts:deriveDomainFieldsForEntity` (new helper) pattern-matches the entity name against 11 domain templates:

- `schedule|appointment|booking|reservation` → `scheduledFor`, `durationMinutes`
- `availability|slot|window|opening` → `startsAt`, `endsAt`
- `lead|contact|customer|patient|client|guest` → `email` (pii), `phone` (pii+sensitive)
- `order|cart|ticket|invoice|payment|checkout` → `totalCents`, `placedAt`
- `sequence|pipeline|stage|cadence|funnel` → `currentStep`, `totalSteps`
- `outreach|activity|message|note|interaction|touch` → `channel` (ENUM), `occurredAt`
- `qualif|criteri|score|rubric|rating` → `score`, `evaluatedAt`
- `handoff|hand-off|assign|transfer|dispatch|route` → `fromActorId` / `toActorId` (FK to member_profile)
- `reminder|notification|alert` → `sendAt`, `recipientMemberId` (FK)
- `menu|product|item|inventory|sku|catalog` → `priceCents`, `isAvailable`
- `conflict|dispute|exception|escalation` → `resolutionState` (ENUM), `detectedAt`
- `privacy|boundar|policy|consent|disclosure` → `policyVersion`, `lastReviewedAt`

Plus an unconditional `ownerMemberId` reference (FK) on the seed entity.

Bug fix shipped alongside: `inferDbType` had no branch for `field.type === 'number'`, so `durationMinutes` and `score` rendered as `TEXT`. Added a fallback so number-typed fields default to `INTEGER`. Also broadened keyword lists to recognize `cents`, `minutes`, `seconds`, `hours`, `days`, `step`, `score`, and `available`.

Concrete clinic delta:

| Entity | Before fields | After fields | Index changes |
|---|---|---|---|
| `provider_availability` | id, title, status, createdAt | + `startsAt` (index), `endsAt` | +1 index |
| `appointment_requests` | id, title, status, createdAt | + `scheduledFor` (index), `durationMinutes` | +1 index |
| `conflict_handling` | id, title, status, createdAt | + `resolutionState` ENUM, `detectedAt` (index) | +1 ENUM, +1 index |
| `privacy_safe_communication_boundaries` | id, title, status, createdAt | + `policyVersion`, `lastReviewedAt` | — |
| `scheduler` (seed) | id, title, status, createdAt | + `scheduledFor` (index), `durationMinutes`, `ownerMemberId` (FK to member_profile) | +1 index, +1 FK |

DDL line count: 70 → 87. The clinic schema now reads as a clinic schema, not a generic stub.

### E7 — tier-3 banner expansion

`lib/generator.ts:TIER_3_FILES` expanded by 12 entries: the 3 agent START_HERE files (CODEX / CLAUDE / OPENCODE), the 3 HANDOFF_PROMPT files, BUSINESS_USER_START_HERE, CLAUDE_HANDOFF, AGENTS, PLAN_CRITIQUE, SCORECARD, QUESTIONNAIRE.

Effect: each of those files now carries the Tier-3 banner pointing builders at `BUILDER_START_HERE.md` and `ARCHIVE_INDEX.md`. ARCHIVE_INDEX automatically reflects the expanded list.

### E8 — generator-time depth-gate proxy

`lib/generator.ts:passesGeneratorTimeDepthProxy` (new) ports the audit's blocking depth-gate rules:

- workflow-step-realism proxy: < 20 % templated CRUD steps
- entity-field-richness proxy: mean ≥ 4 fields/entity AND ≥ 60 % of entities carry an `enum / fk / indexed / pii / sensitive` flag

Wire-in: `computeBuildReadyFlag` returns `false` when the proxy fails, so a thin agent-recipe extraction can no longer claim BuildReady at write time. Synth was already excluded by source check; this tightens the gate for agent-recipe.

### E9 — actor-name normalization

`scripts/synthesize-research-ontology.ts:140` adds `.replace(/[.,;:!?]+$/g, '')` before `titleCase`. Effect: `practice managers.` → `Practice Managers` (period stripped). The trailing-punctuation strip is now reflected across personas, requirements, schema enum, and flow IDs.

## What was scoped down

**E7 physical relocation**: my E7 description in the evaluation report proposed moving Tier 3 files into an `archive/` subdirectory. The implementation that shipped only expands the *banner-coverage* list. Why: the validator (`scripts/mvp-builder-validate.ts:requiredRootFiles`) hard-codes 30+ tier-3 paths at the workspace root, and `lib/generator.ts` carries 208 references to those files in markdown links. A physical relocation would require updating all of those plus the smoke test path assertions; that's a Phase H effort, not Phase G. The expanded TIER_3_FILES list + ARCHIVE_INDEX is the tractable Phase G subset.

## Validation matrix

| Suite | Status | Notes |
|---|---|---|
| `npm run typecheck` | ✅ | clean |
| `npm run smoke` | ✅ | 466 files in 14 phases (was 404), all packets, parsers, lifecycle, validate/status/CLI, orchestrator round |
| `npm run regression` | ✅ | 164/164 |
| `npm run test:depth-enforcement` | ✅ | 5/5 (T1, T2, T3, T4, E1) |
| `npm run test:functional-requirements-failures` | ✅ | 5/5; requirement-failure-variance = 5/5 |
| `npm run test:database-schema` | ✅ | M3, M4, M5, M5b |
| `npm run test:research-source-readiness` | ✅ | T1–T4 |
| `npm run test:audit-exit` | ✅ | T1, T2, T3 |
| `npm run test:phase-h-repairs` | ✅ | database-schema + builder-start-here + mocking-strategy + lifecycle-honesty + regulatory-truncation |
| `npm run test:browser-loop` | ✅ | NEW; probe + 1 flow × 3 paths (happy/negative/rolePermission) + evidence dir |

## Files changed

| File | Reason | Δ |
|---|---|---|
| `scripts/synthesize-research-ontology.ts` | E9 (actor names), E4 (jobsToBeDone differentiation + reviewer-regex broadened), E6 (`deriveDomainFieldsForEntity`), inferDbType (number-fallback + widened keywords) | substantive |
| `lib/generator.ts` | E5 (per-step failure derivation), E7 (TIER_3 list expansion), E8 (depth-proxy + BuildReady tightening) | substantive |
| `lib/orchestrator/commands.ts` | E1 (loop:browser in OPTIONAL) | small |
| `scripts/mvp-builder-auto-regression.ts` | E3 (UiCounterEvidence types + writers + research-gap prompt) | substantive |
| `scripts/mvp-builder-loop-browser.ts` | resolveSampleValue bare-name fallback (bug fix surfaced by E2) | small |
| `scripts/test-browser-loop-fixture.ts` | E2 (new) | new |
| `tests/fixtures/mini-built-app/...` | E2 (new) | new |
| `package.json` | E2 (`test:browser-loop` script) | small |
| `docs/PHASE_G_E1_E9_REPORT.md` | this report | new |

## Pass criteria check

| Criterion | Pass? |
|---|---|
| All 9 enhancements implemented | ✅ |
| typecheck clean | ✅ |
| smoke clean | ✅ |
| regression suite 164/164 | ✅ |
| existing tests still pass | ✅ |
| new test (test:browser-loop) passes end-to-end against built fixture | ✅ |
| audit deltas show real lift on synth (depth +1 on all 3 cases) | ✅ |
| no commits made until user approves | ✅ |
