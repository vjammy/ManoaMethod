# Phase F — Comprehensive Depth (with F1 pivot)

Landed: 2026-05-02. Three-part change to lift comprehensive-depth signal in
the workspace **without** reintroducing per-domain templates. Phase F1
initially tried domain packs and was reverted; final state is F2 + F3 +
recipe rewrite + failure-mode rotation.

## Pivot summary

Initial F1 attempt added 12 domain packs (`lib/research/domain-packs/`) +
`detectCategory()` keyword router that materialized pack archetypes into the
synthesizer. **The user correctly flagged this as a return to the deprecated
archetype-detection pattern (Phase A3c).** Pre-baked per-domain templates:

- can never cover every domain (open-ended brief space)
- ossify around training-data-stale terminology
- mask the real failure mode: thin agent-recipe behavior

The pivot:

1. **F1 reverted in full** — `lib/research/domain-packs/` deleted, synth
   restored to thin pre-F state, `detectCategory` removed, no
   `--allow-templated` escape hatch reintroduced.
2. **F2 + F3 retained** — they are source-independent: F2 emit modules read
   the existing schema; F3 audit dims measure depth from any source.
3. **Production depth moved to `docs/RESEARCH_RECIPE.md`** — rewritten with
   9 mandatory passes that enforce depth through the agent's behavior, not
   through templates.

## Why this matters

Pre-F, the 50-iter Brief Sweep scored mean 99/100 across 50 briefs, all
"production-ready" / "research-grounded." But reading the actual extractions
exposed shallow content. Concrete gaps from `iter-09-sdr-sales-module`:

| Surface | Pre-F state |
|---|---|
| `actors.json` | one actor literally named **"Their Managers."** (with the trailing period from the brief audience sentence) |
| `workflows.json` | "Follow up on Sales", "Review Sales" with templated CRUD steps |
| `requirements/FUNCTIONAL_REQUIREMENTS.md` | every requirement shared the same failure case |
| Entities | `id, title, status, createdAt` only — no domain depth |

The audit didn't penalize this because each expert dim measured *structural
completeness*, not *content distinctness*. The fix is twofold:

- **For synth:** add depth dims (F3) that flag templated CRUD verbs, duplicate
  failure cases, sparse field models, and template-shaped acceptance. Synth
  is a regression harness; it's allowed to score low on these dims. That low
  score is the correct signal.
- **For production:** the agent (Claude Code / Codex / Kimi) has its own
  model context. The recipe's job is to tell the agent how deep to go and
  what to enforce. The 9-pass rewrite does this without baking domain
  knowledge into mvp-builder.

## Final landing

### F2 — Comprehensive-depth artifact emitters (KEPT)

New emit modules in `lib/generator/`:

| File | Renderer | What it contains |
|---|---|---|
| `product-strategy/USE_CASES.md` | `use-cases.ts` | One use case per workflow with main flow, alternatives, failure modes, postconditions, "Why this actor will use this" |
| `product-strategy/USER_PERSONAS.md` | `user-personas.ts` | One persona per non-external actor with motivations, pain points, adoption signals, visibility scope |
| `product-strategy/SUCCESS_METRICS.md` | `success-metrics.ts` | D1/D7/D30 outcomes, per-actor adoption signals, leading indicators (research-driven; replaces the templated emit when discovery is present) |
| `requirements/PER_SCREEN_REQUIREMENTS.md` | `per-screen-requirements.ts` | One section per screen with screen-specific acceptance + edge cases |
| `phases/<slug>/INTEGRATION_TESTS.md` | `integration-tests.ts` | Per-phase E2E with realistic fixture data |

These read from existing extractions only. They produce thin output for
synth (because synth's extractions are thin) and rich output for agent-recipe
(because the agent fills the extractions deeply per the new recipe). Smoke
file count: **402 → 420** (+18 files: 4 root + 14 per-phase).

### F3 — Audit dimensions that flag shallow content (KEPT)

Six new expert dims in `scripts/mvp-builder-quality-audit.ts`:

| Dim | Max | What it measures |
|---|---:|---|
| `workflow-step-realism` | 5 | % of workflow steps NOT using templated CRUD verbs ("Create a new X", "Edit the X title or status", "View status") |
| `requirement-failure-variance` | 5 | Pairwise text uniqueness across all "Failure case:" lines in FUNCTIONAL_REQUIREMENTS.md |
| `entity-field-richness` | 5 | Mean fields/entity (target ≥6) AND fraction of entities with enum/fk/indexed/pii flags |
| `per-screen-acceptance-uniqueness` | 5 | Fraction of screen purposes that are unique strings |
| `use-case-depth` | 5 | USE_CASES.md present + ≥1 case per workflow + main flow + alternatives + failure modes + "Why" section (synth-capped at 3/5) |
| `persona-depth` | 5 | USER_PERSONAS.md present + ≥1 persona per primary actor + motivation + pain points + adoption signals + visibility (synth-capped at 3/5) |

Per Phase E5 decision, none of the F3 dims fire blocker caps. Headline /100
held. Real signal lives in per-dim scores; the dim total grew from 90 (10
dims) to 110 (16 dims). Synth scores 18-20/30 on these dims (correctly low);
agent-recipe should score 25-30/30.

### Generator failure-mode rotation (KEPT)

`buildFunctionalRequirementsFromResearch` now rotates `failureModes` by step
index so requirements from the same workflow surface DIFFERENT failure
cases. Lifts `requirement-failure-variance` from 1/5 to 2-3/5 on synth
output without depending on packs.

### F1 — Domain packs (REVERTED)

`lib/research/domain-packs/` deleted. `detectCategory()` removed. Synth's
`deriveActors`, `deriveEntities`, `deriveWorkflows`, `deriveJtbd`,
`deriveDiscovery`, `deriveIntegrations` restored to brief-derived only. No
keyword routing, no archetype detection, no `--allow-templated` escape
hatch.

The synth path is now explicitly regression-grade: it produces obviously-
shallow output that the F3 dims correctly flag. The audit's `idea-clarity`
dim returns to its pre-F state (no synth hard-cap; synth scores 2/5
naturally because brief-derived `topThreeOutcomes.length === 2`, not 3).

### RESEARCH_RECIPE.md (REWRITTEN)

The recipe now enforces depth through 9 mandatory passes the agent must
execute in its own context:

| Pass | Purpose | Schema target |
|---|---|---|
| 0 | Discovery + back-and-forth | `meta.discovery` (valueProposition, whyNow, ideaCritique 3-5 entries, competingAlternatives, industry framing) |
| 1 | Actor + persona research (3-5 personas, role/motivation/pain/trust/return/abandon) | `actors.json` + `jobsToBeDone.json` |
| 2 | Use-case exploration (multiple per persona, happy/edge/failure/recovery) | drives Pass 3 |
| 3 | Workflow mapping (≥5 steps, ≥2 failure modes, ≥1 branchOn) | `workflows.json` |
| 4 | Screen requirements (full state contract, screen-specific acceptance) | `screens.json` + `uxFlow.json` |
| 5 | Success metrics + quality bar (D1/D7/D30 + per-persona signals + leading indicators + anti-metrics) | extends `meta.discovery` + drives `SUCCESS_METRICS.md` |
| 6 | Test data + regression suite (per persona × workflow × screen) | `testCases.json` + regression-suite expansion |
| 7 | Integration + test plan (E2E with persona-specific tests + recovery scenarios) | `INTEGRATION_TESTS.md` per phase |
| 8 | DB schema alignment (dbType, fk, pii on every field; cross-pass consistency check) | `entities.json` field metadata |
| 9 | Quality gate (autoresearch exit) — total ≥95, F3 dims ≥3/5, regression 100% | `gates.json` `gate-mvp-quality` |

Each pass has explicit deliverables, validation rules, and a mapping from
audit dim back to the upstream pass that owns the fix. Retry budget capped
at 2 (same as pre-F).

## Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run smoke` | 420 files / 14 phases ✅ |
| `npm run test:research-source-readiness` | 4/4 PASS |
| `npm run test:audit-exit` | PASS |
| `npm run test:audit-exit-e2e` | PASS (E2 retries=2 expected) |
| `npm run test:quality-regression` | PASS (synth ideaCritique == empty restored) |
| iter-09 SDR spot-check | 99/100, all 16 expert dims report; F3 dims correctly flag synth shallowness |

### iter-09 SDR (post-revert, post-F2/F3)

| Dimension | Score | Note |
|---|---:|---|
| domain-vocabulary | 20/20 | structural |
| anti-generic | 14/15 | structural |
| sample-data | 15/15 | structural |
| requirement-specificity | 15/15 | structural |
| phase-distinctness | 10/10 | structural |
| test-script-substance | 10/10 | structural |
| consistency | 9/10 | structural |
| research-depth | 6/10 | synth cap 6/10 |
| edge-case-coverage | 7/10 | synth cap 7/10 |
| role-permission-matrix | 8/10 | structural |
| regulatory-mapping | 5/5 | structural |
| realistic-sample-data | 5/5 | structural |
| screen-depth | 8/10 | structural |
| schema-realism | 8/10 | structural |
| test-case-grounding | 10/10 | structural |
| jtbd-coverage | 5/5 | structural |
| idea-clarity | 2/5 | synth (no critique credit) |
| **workflow-step-realism (F3)** | **3/5** | flags templated CRUD on synth — correct |
| **requirement-failure-variance (F3)** | **2/5** | flags duplicate failures on synth — correct |
| **entity-field-richness (F3)** | **4/5** | flags 4-field synth entities — correct |
| **per-screen-acceptance-uniqueness (F3)** | 5/5 | screens are distinct because purpose strings vary by workflow name |
| **use-case-depth (F3)** | 3/5 | synth cap |
| **persona-depth (F3)** | 3/5 | synth cap |
| **Headline** | **99/100** | structural threshold met |

The F3 dims correctly report **synth is shallow** (workflow-step-realism 3/5,
failure-variance 2/5, field-richness 4/5). Agent-recipe runs that follow
RESEARCH_RECIPE.md should lift these to 5/5 each.

### RC2 source distinction — INTACT

- `meta.researchSource` field still on schema (`'synthesized' | 'agent-recipe'
  | 'imported-real' | 'manual'`).
- Synth still stamps `researchSource: 'synthesized'`.
- `computeReadiness` still rejects synth as `demoReady`. The audit's "synth
  proves the generator is structurally sound but cannot supply real product
  judgment" banner still surfaces.
- Real-recipe path (`scripts/run-real-research-on-brief.ts`) unchanged.
- `npm run test:research-source-readiness` 4/4 pass.

## Files changed in the pivot (vs commit a63cb8b — initial Phase F)

| File | Change |
|---|---|
| `lib/research/domain-packs/` (12 packs + types + index) | **DELETED** |
| `scripts/synthesize-research-ontology.ts` | **REVERTED** to pre-F state (`78a881c` baseline) |
| `scripts/mvp-builder-quality-audit.ts` | F3 dims kept; idea-clarity hard-cap removed (was added defensively for pack seeding; no longer needed) |
| `scripts/test-quality-regression.ts` | Restored synth ideaCritique == empty assertion (the relaxed ≤2 was added for pack seeding) |
| `scripts/loop-50-iterations.ts` | Expert dim aggregator KEPT (independent of packs) |
| `lib/generator.ts` | Failure-mode rotation KEPT; F2 emit wiring KEPT |
| `lib/generator/{use-cases,user-personas,success-metrics,per-screen-requirements,integration-tests}.ts` | KEPT — source-independent |
| `docs/RESEARCH_RECIPE.md` | **REWRITTEN** with 9 mandatory passes |
| `docs/PHASE_F_COMPREHENSIVE_DEPTH_REPORT.md` | **AMENDED** (this file) |

## Pass criteria check

| Criterion | Status |
|---|---|
| `lib/research/domain-packs/` deleted | ✅ |
| All domain-pack imports/usages removed | ✅ (only doc references remain) |
| `detectCategory` / keyword-router removed | ✅ |
| Synth restored to thin generic regression fixture | ✅ |
| No `--allow-templated` reintroduced | ✅ (Phase A3c removal preserved) |
| F2 emit modules retained | ✅ (5 files, all source-independent) |
| F3 audit dims retained | ✅ (6 new dims, no caps, synth-capped where appropriate) |
| Failure-mode rotation in generator retained | ✅ |
| `RESEARCH_RECIPE.md` rewritten with 9 mandatory passes | ✅ |
| Doc explains synth = regression-grade only | ✅ (recipe header + this report) |
| Doc explains production depth comes from recipe | ✅ |
| Doc explains why packs were removed | ✅ ("Why no domain packs / archetype routing" section) |
| `npx tsc --noEmit` clean | ✅ |
| `npm run smoke` passes (420 files) | ✅ |
| `npm run test:quality-regression` passes | ✅ |
| `npm run test:research-source-readiness` passes | ✅ |
| `npm run test:audit-exit` + `test:audit-exit-e2e` pass | ✅ |
| RC2 source distinction intact | ✅ |
| Synth still scores 50/50 production-ready in 50-iter | (validated post-revert with iter-09 spot-check; full 50-iter to follow if requested) |
| F3 dims flag synth shallowness correctly | ✅ (workflow-step-realism 3/5, failure-variance 2/5, field-richness 4/5 on synth) |

## Out of scope (explicitly deferred)

- Lifting synth `use-case-depth` and `persona-depth` above 3/5. These caps
  are the point: synth doesn't have real product judgment.
- Adding domain packs back in any form (architectural decision).
- Headline /100 cap rebaseline (Phase E5 decision).
- Real-recipe / SDK path mechanics (unchanged).

## Important architectural constraints (going forward)

- **No domain-specific templates.** Adding per-domain content is the wrong
  fix; the right fix is enforcing recipe behavior.
- **No keyword routers.** `detectCategory`, archetype-detection, or any
  brief→template mapping is forbidden.
- **No archetype detection.** Phase A3c removal is permanent.
- **Synth is allowed to look thin.** Synth's role is to validate the
  generator works structurally with valid extractions. The depth dims that
  flag synth shallowness are doing their job.
- **Production quality lives in the recipe.** The agent (Claude Code /
  Codex / Kimi) has its own model context. mvp-builder doesn't bundle a
  domain LLM. Depth comes from how the agent thinks, not from pre-baked
  content.
