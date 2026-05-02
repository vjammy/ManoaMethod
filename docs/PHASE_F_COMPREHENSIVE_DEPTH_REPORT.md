# Phase F — Comprehensive Depth report

Landed: 2026-05-02. Three-part change to lift content depth (per-actor distinctness, per-workflow domain realism, per-screen acceptance, per-requirement failure variance) without moving the headline /100 cap.

## Why this phase

Pre-F, the 50-iter Brief Sweep scored **mean 99/100 across 50 briefs**, all "production-ready" / "research-grounded." But reading the actual extractions exposed a different picture. Concrete gap example from `iter-09-sdr-sales-module` pre-F:

| Surface | What it said | Why it failed |
|---|---|---|
| `actors.json` | one actor named **"Their Managers."** (with the trailing period from the brief sentence "Audience: Sales development reps and their managers.") | Naive noun-phrase extraction, no domain awareness |
| `workflows.json` | "Follow up on Sales", "Review Sales" with steps like "Create a new Sales", "Edit the Sales title or status" | Templated CRUD verbs, no SDR domain |
| `requirements/FUNCTIONAL_REQUIREMENTS.md` | every requirement shared the **same** failure case ("On required field missing, validate required fields client-side before submit") | Generator pulled the first failure mode for all reqs |
| Entities | `id, title, status, createdAt` only | No domain fields like `pipeline_stage`, `lead_source`, `next_touch_at` |

The audit didn't penalize this because each expert dim measured *structural completeness*, not *content distinctness*. Synth cleared every threshold — 6 entities ✅, 2+ actors ✅, 3 workflows ✅, all 4 screen states ✅, 100% DDL ✅, all test cases grounded ✅ — without proving that any of the content was actually domain-realistic.

## Three-part landing

### F1 — Synthesizer depth via domain packs

**New:**
- `lib/research/domain-packs/types.ts` — pack archetype types (`ActorArchetype`, `EntityArchetype`, `WorkflowArchetype`, `JtbdSeed`, etc.)
- `lib/research/domain-packs/index.ts` — pack registry + `detectCategory(input)` keyword scorer
- 12 packs: `sales`, `household`, `scheduling`, `education`, `healthcare`, `ledger-finance`, `volunteer`, `inventory`, `hospitality`, `fitness`, `community`, `general`

**Modified:** `scripts/synthesize-research-ontology.ts`
- `synthesizeExtractions` detects category and loads pack at top
- `deriveActors` materializes pack actor archetypes (with proper names, no trailing periods); brief audience phrases only fill gaps
- `deriveEntities` materializes pack entity archetypes with 6-12 fields each, real samples (`lead-acme-2026-001`, `MRN-484823`, `slot-2026-05-02-1800-court-a`), enums, FKs
- `deriveWorkflows` materializes pack workflow archetypes with 5-7 specific domain steps and 2-3 specific failure modes per workflow
- `deriveJtbd` consumes pack JTBD seeds for matching actors (concrete situations, motivations, hire-for criteria)
- `deriveDiscovery` seeds `ideaCritique` and `competingAlternatives` with pack defaults (1-2 entries each); audit caps idea-clarity at 2/5 for synth regardless
- `deriveIntegrations` emits pack `integrationHints` first

### F2 — Comprehensive-depth artifacts

**New emit modules in `lib/generator/`:**
- `use-cases.ts` → `product-strategy/USE_CASES.md` (one use case per workflow with main/alternative flows, failure modes, postconditions, and "Why they will use it")
- `user-personas.ts` → `product-strategy/USER_PERSONAS.md` (one persona per non-external actor with motivations, pain points, adoption signals)
- `success-metrics.ts` → `product-strategy/SUCCESS_METRICS.md` (D1/D7/D30 outcomes, per-actor adoption signals, leading indicators)
- `per-screen-requirements.ts` → `requirements/PER_SCREEN_REQUIREMENTS.md` (one section per screen with screen-specific acceptance criterion + edge cases)
- `integration-tests.ts` → `phases/<slug>/INTEGRATION_TESTS.md` (per-phase end-to-end scenario with fixture data and step-by-step interaction)

**Wired in:** `lib/generator.ts` createGeneratedFiles emit chain. Smoke file count: **402 → 420** (+18 files: 4 root + 14 phase integration test files).

### F3 — Audit dimensions that catch shallow content

**New expert dims (`scripts/mvp-builder-quality-audit.ts`):**

| Dim | Max | What it measures |
|---|---:|---|
| `workflow-step-realism` | 5 | % of workflow steps NOT using templated CRUD verbs ("Create a new X", "Edit the X title or status", "View status") |
| `requirement-failure-variance` | 5 | Pairwise text uniqueness across all "Failure case:" lines in FUNCTIONAL_REQUIREMENTS.md |
| `entity-field-richness` | 5 | Mean fields/entity (target ≥6) AND fraction of entities with enum/fk/indexed/pii flags |
| `per-screen-acceptance-uniqueness` | 5 | Fraction of screen purposes that are unique strings |
| `use-case-depth` | 5 | USE_CASES.md present + ≥1 use case per workflow + main flow + alternatives + failure modes + "Why" section (synth-capped at 3/5) |
| `persona-depth` | 5 | USER_PERSONAS.md present + ≥1 persona per primary actor + motivation + pain points + adoption signals + visibility (synth-capped at 3/5) |

**Per Phase E5 decision, none of the F3 dims fire blocker caps.** Headline stays /100. Real signal lives in per-dim scores; the dim total grew from 90 (10 dims) to 120 (16 dims). Bonus calc denominator shifted from 90 → 110 (idea-clarity stays 5/5 max).

**Modified:** RC2 readiness rule (`computeReadiness`) and the `expertIdeaClarity` cap — synth's idea-clarity is now hard-capped at 2/5 even with pack-seeded critique, preserving the demo-ready=false rule.

**Modified test:** `scripts/test-quality-regression.ts` — assertion changed from "synth ideaCritique must be empty" to "synth ideaCritique ≤ 2 entries" to reflect pack seeding.

## Pre-F vs post-F deltas (50-iter Brief Sweep)

Pre-F numbers from `.tmp/loop-50/REPORT.md` baseline (mean 99/100). Post-F numbers from the clean 50-iter run after Phase F landed:

| Metric | Pre-F | Post-F |
|---|---:|---:|
| Headline score | min 97 / median 99 / mean 99 / max 100 | min 98 / median 100 / mean 100 / max 100 |
| All 600 step assertions pass | 600/600 | 600/600 |
| All-green iterations | 50/50 | 50/50 |
| Production-ready | 50/50 | 50/50 |
| Demo / client-ready | 0/50 (synth) | 0/50 (synth) — RC2 rule preserved |
| Synth research-source | 50/50 `synthesized` | 50/50 `synthesized` |
| File count (smoke) | 402 / 14 phases | 420 / 14 phases (+18) |
| Raw expert total | ~64/90 (71%) | 92/110 (84%) |
| Mean bonus applied | +6 | +7 |
| Audit dim count | 7 base + 10 expert = 17 | 7 base + 16 expert = 23 |

A flaky run on the harness's port-3000 placeholder server caused 28/50 iterations to fail `probe-skip-start` and `loop-dry` on a first attempt. Those failures were unrelated to Phase F (probe.ts and the harness HTTP server are untouched). The clean re-run with port 3000 free returned 50/50 all-green.

### Per-dim deltas (50-iter aggregate means)

| Dimension | Pre-F mean | Post-F mean | Delta |
|---|---:|---:|---:|
| research-depth | ~6 | 6.0 | — |
| edge-case-coverage | ~7 | 7.0 | — |
| role-permission-matrix | ~8 | 10.0 | +2 |
| regulatory-mapping | ~5 | 5.0 | — |
| realistic-sample-data | ~5 | 5.0 | — |
| screen-depth | 7.48 | 8.0 | +0.5 |
| schema-realism | 8.58 | 10.0 | +1.4 |
| test-case-grounding | 10.0 | 10.0 | — |
| jtbd-coverage | 5.0 | 5.0 | — |
| idea-clarity | 2.0 | 2.0 (cap held) | — |
| **workflow-step-realism (F3)** | — | 5.0 | new |
| **requirement-failure-variance (F3)** | — | 3.0 | new (rotation in generator lifted from 1.0 → 3.0) |
| **entity-field-richness (F3)** | — | 5.0 | new |
| **per-screen-acceptance-uniqueness (F3)** | — | 5.0 | new |
| **use-case-depth (F3)** | — | 3.0 (synth cap) | new |
| **persona-depth (F3)** | — | 3.0 (synth cap) | new |
| **Raw expert total** | ~64/90 | **92/110** | +28 raw, +13pp |
| **Bonus** | +6 | +7 | +1 |
| Headline | 99/100 | 100/100 | +1 |

### Content-quality wins (qualitative)

| Surface | Pre-F | Post-F |
|---|---|---|
| Actor names | "Their Managers." | "Sales Manager", "Account Executive" |
| Workflow steps | "Create a new Sales", "Edit the Sales title or status" | "Import a lead list from a conference event", "Resolve any conflict-flagged leads (skip vs. reassign)", "Apply a cadence (cold / warm / event-follow-up) to the imported leads" |
| Failure modes | "Required field missing" (× every workflow) | "Lead opts out via reply (CAN-SPAM exposure if we keep emailing)", "Imported list overlaps with existing AE-owned accounts (territory conflict)", "Bounce volume spikes above 5% on a cadence" |
| Entity fields | `id, title, status, createdAt` | `leadId, firstName, lastName, email, company, fitScore, stage(enum), assignedActorId(fk), optedOut, nextTouchAt, createdAt` |
| Sample IDs | `sdr-sales-mod-sa-001` | `lead-acme-2026-001`, `cad-cold-v3`, `acct-acme-001` |
| Industry vocabulary tokens | 92 | 131 (+39) |

### Known follow-up signal: `requirement-failure-variance` 3/5 on synth

The fix landed in F3 (`buildFunctionalRequirementsFromResearch` now rotates `failureModes` by step index in `lib/generator.ts`), lifting the dim from 1/5 to 3/5. Remaining gap: pack workflows carry 2-3 distinct failure modes but workflows often have 5-7 steps, so the modulo-rotation cycles through. To reach 5/5, packs would need ≥1 failure mode per step, or the generator would need per-step failure derivation (e.g., from `step.branchOn` or `step.systemResponse`). Deferred.

## Pass criteria check

| Criterion | Status |
|---|---|
| Per-iteration `audit.total ≥ 98` (no regression on /100 headline) | ✅ (mean 100, min 98 on 50-iter) |
| Per-iteration raw expert total rises (synth target ~85+/120) | ✅ (~92/120 mean) |
| All 600 step assertions in 50-iter remain green | ✅ |
| Synth `meta.researchSource: 'synthesized'` unchanged | ✅ |
| `demoReady: false` preserved for synth | ✅ (idea-clarity hard-capped at 2/5) |
| iter-09 actors no longer contain "Their Managers." or trailing-punctuation names | ✅ ("Sales Development Rep", "Sales Manager", "Account Executive") |
| iter-09 workflows have ≥5 domain-specific steps and ≥2 specific failure modes per workflow | ✅ (6 steps × 3 specific failures on cadence-execution) |
| iter-09 has 5 new artifact files | ✅ (USE_CASES.md, USER_PERSONAS.md, SUCCESS_METRICS.md, PER_SCREEN_REQUIREMENTS.md, phases/phase-XX/INTEGRATION_TESTS.md) |
| Smoke produces 420 files / 14 phases | ✅ |
| `npm run test:research-source-readiness` (4 tests) | ✅ |
| `npm run test:audit-exit && npm run test:audit-exit-e2e` | ✅ |
| `npm run test:quality-regression` | ✅ (1 assertion updated for pack seeding) |
| `npx tsc --noEmit` clean | ✅ |

## Files modified summary

| File | Change |
|---|---|
| `lib/research/domain-packs/types.ts` (NEW) | pack archetype types |
| `lib/research/domain-packs/index.ts` (NEW) | pack registry + `detectCategory` |
| `lib/research/domain-packs/{sales,household,scheduling,education,healthcare,ledger-finance,volunteer,inventory,hospitality,fitness,community,general}.ts` (NEW) | 12 packs |
| `scripts/synthesize-research-ontology.ts` | thread packs into derive functions; clean actor names; drop legacy 4-field entity helper |
| `lib/generator/use-cases.ts` (NEW) | renderUseCasesMarkdown |
| `lib/generator/user-personas.ts` (NEW) | renderUserPersonasMarkdown |
| `lib/generator/success-metrics.ts` (NEW) | renderSuccessMetricsMarkdown (research-driven) |
| `lib/generator/per-screen-requirements.ts` (NEW) | renderPerScreenRequirementsMarkdown |
| `lib/generator/integration-tests.ts` (NEW) | renderPhaseIntegrationTestsMarkdown |
| `lib/generator.ts` | wire 5 new emit calls |
| `scripts/mvp-builder-quality-audit.ts` | add E11–E16 expert dims; hard-cap synth idea-clarity at 2/5 with pack seeding allowed |
| `scripts/test-quality-regression.ts` | update synth ideaCritique/competingAlternatives assertion to ≤2 |
| `scripts/loop-50-iterations.ts` | aggregate expert dim averages + raw expert total + mean bonus into REPORT.md |
| `lib/generator.ts` (additional) | rotate workflow failure modes by step index in functional-requirements emit |
| `docs/RESEARCH_RECIPE.md` | addendum noting the 5 new artifacts the generator emits |
| `docs/PHASE_F_COMPREHENSIVE_DEPTH_REPORT.md` (NEW) | this report |

## Out of scope (explicitly deferred)

- Updating the generator's `FUNCTIONAL_REQUIREMENTS.md` emission to rotate workflow failure modes by step index (current `requirement-failure-variance` 1/5 reflects this).
- Lifting synth `use-case-depth` and `persona-depth` above 3/5 — that requires real agent-recipe judgment, not pack templates.
- Schema (`lib/research/schema.ts`) — unchanged. F1 fits in the existing v0.2 contract.
- Real-recipe / SDK path — unchanged. Same JSON shape, same auditExit gate.
- Headline /100 cap — held per Phase E5 decision.
