# Phase G — Demo-ready: build recipe, workspace polish, deployment template, runbooks for LLM + user validation

Landed: 2026-05-03. Phase G closes the five gaps that stood between the
Phase F follow-up landing (`docs/PHASE_F_FOLLOWUP_REPORT.md`) and a
genuinely demo-ready pipeline: a workspace that a coding agent can scaffold
into a Vercel-deployed Next.js app in one session.

The pre-Phase-G state at commit `3cf3eb9`:

- 5/5 depth-enforcement tests passing
- 5/5 W1–W5 validation matrix passing
- W3 corpus: 50/50 all-green, depth-grade mean 19.7/30 moderate
- Workspace had four polish issues from W5 the fresh-builder agent surfaced
  (file noise, BUSINESS-vs-BUILDER start guide, Blocked-vs-build-ready
  banner conflict, failure-case join-spam)
- No build recipe, no deployment scaffold, no real-LLM run runbook, no
  real-user validation runbook

## What changed

| Gap | Status | Commits |
|---|---|---|
| G1 Build recipe (`docs/BUILD_RECIPE.md`) + `build-recipe-coverage` audit dim | landed | `3e3e825` |
| G2 Workspace polish (4 W5-surfaced issues) | landed | `902263f`, `b661d84` |
| G3 Persistence + deployment template (`architecture/DEPLOYMENT_TEMPLATE/`) | landed | `08f8e40` |
| G4 Real LLM run prep (script + runbook, no execution) | landed | `baa97ed` |
| G5 Real user validation prep (runbook + template, no recruitment) | landed | `64d3f3d` |
| W4 follow-up: ResearchIncomplete / DemoReady / ReleaseNotApproved + builder-start-here module | landed | `b661d84` |
| W5 follow-up: greedy single-best-step failure-mode assignment + tests | landed | `d697cd2` |

Seven commits on top of `3cf3eb9`, all on `main`, ahead of `origin/main`.

## G1 — Build recipe + audit dim

`docs/BUILD_RECIPE.md` (829 lines) is the build-side analog of
`RESEARCH_RECIPE.md`. 9 mandatory passes (B1–B9):

| Pass | Deliverable |
|---|---|
| B1 Stack pick | Next 14 + Postgres + Drizzle + Resend + Vercel default; deviation logged in `BUILD_LOG.md` |
| B2 Schema → migration | Drizzle schema + `0001_init.sql` from workspace `DATABASE_SCHEMA.sql` |
| B3 Auth wiring | Magic-link via Resend in prod / file-mock in dev with server-rendered guards |
| B4 Workflow scaffolding | One route group + one page + one server action per `workflow.id` in dependency order |
| B5 Per-screen implementation | Empty / loading / error / populated state contract mandatory per page |
| B6 Server-side validation | Recipe-defined rules at API / server-action layer, not just UI |
| B7 Audit-log wiring | Server actions write entries from `entity-audit-entry.eventType.enumValues`; same transaction as domain write |
| B8 Smoke + e2e | Playwright suite from `INTEGRATION_TESTS.md`: one happy + one failure-mode per workflow |
| B9 Deploy + production smoke | `make deploy` + Playwright against live URL |

Plus a "why no domain-specific scaffolding" section that mirrors the
research recipe's archetype-routing rejection, a pass-to-runtime-quality-bar
table, a `BUILD_LOG.md` skeleton, and explicit when-to-stop-and-escalate
rules.

New audit dim `build-recipe-coverage` in
`scripts/mvp-builder-quality-audit.ts` (max 5):
- +1 per `workflow.id` that is also a route in `build/manifest.json` (max 3)
- +1 if at least one validation is server-enforced
- +1 if `auditEvents` overlap ≥ 50% with `entity-audit-entry.eventType.enumValues`

Only fires when `build/manifest.json` exists; otherwise the dim is omitted
(not zero) so research-only workspaces aren't penalized. Wired into the
depth-gate as **advisory** (threshold 4/5) — graduates to blocking once
enough builds calibrate it.

## G2 — Workspace polish

| Issue | Fix |
|---|---|
| 60+ top-level meta-files create signal-noise | New `archive/INDEX.md` catalogs ceremony / gate / recovery / scoring files for builders to skip; existing files stay at top level (smoke asserts paths) |
| `BUSINESS_USER_START_HERE.md` points at wrong files for a builder | New `BUILDER_START_HERE.md` (`lib/generator/builder-start-here.ts`, 280 LOC) points at the canonical 10 load-bearing files: brief → use-cases → personas → workflows.json → screens.json → PER_SCREEN_REQUIREMENTS → DATABASE_SCHEMA.{sql,md} → testCases.json → INTEGRATION_TESTS, plus a pointer at `docs/BUILD_RECIPE.md` |
| Status banner says "Blocked" while content is build-ready | New `BuildReady` lifecycle state; further W4 expansion adds `ResearchIncomplete`, `DemoReady`, `ReleaseNotApproved`; `Blocked` reserved for genuine structural failures (schema-validation severity > 'note', unresolved critical conflicts) |
| Failure-case join-spam in `FUNCTIONAL_REQUIREMENTS.md` | Staged matching: `step.branchOn` ↔ failureMode.trigger by Jaccard token overlap → fall back to `step.systemResponse` → workflow-level pointer with no fabricated join. Helpers `tokenizeForFailureMatch`, `jaccard`, `matchFailureModeForStepDetailed` exported for tests |

The recipe-validation workspace (Conference SDR Hub) now reads:
- `BUILDER_START_HERE.md` exists and points at canonical 10 files
- `archive/INDEX.md` catalogs the ceremony files
- Lifecycle banner: **BuildReady** (was Blocked)
- Per-step failure cases: 14 unique lines per 31 requirements (was 7 with
  join-spam)

## G3 — Deployment template

New module `lib/generator/deployment-template.ts`. When the workspace has
DB metadata to migrate, emits 6 files:

```
architecture/DEPLOYMENT_TEMPLATE/
  supabase/migrations/0001_init.sql   — Postgres preamble + DDL re-run
  next.config.mjs                     — Next 14 production defaults
  .env.template                       — every env var (Supabase + Resend
                                       + each researched integration with
                                       required/optional/mocked split)
  vercel.json                         — function timeouts + security headers
  Makefile                            — make {install,migrate,deploy,smoke,rollback}
  DEPLOYMENT_README.md                — one-shot + manual deploy paths +
                                       smoke + rollback semantics
```

Smoke file count: 422 → **428** (+6 template files).

## G4 — Real LLM run prep (no execution)

`scripts/run-real-research-validation.ts` wraps `runResearchLoop` with
`--threshold=95 --respect-caps --enforce-depth=true --max-retries=2` and
captures a structured trace (`REPORT.json`):
- totalPasses, useCasePasses, domainPasses
- auditRetries
- finalDepthGateBlocking[]
- finalAudit { total, cap, passed }
- baselineComparison (when a W4 baseline matches the brief slug)

`docs/REAL_LLM_VALIDATION_RUNBOOK.md` (241 lines) covers:
- Prerequisites + how to set the key securely + rotate after
- Recommended first brief: `examples/sdr-sales-module.json` (matches W4
  iter-09 baseline at `.tmp/recipe-validation/`)
- Expected ranges per metric (totalPasses 7-12, auditRetries 0-2, final
  audit ≥95, depth grade 24-30/30, tokens 150k-280k)
- Red-flag diagnostic table:
  - Depth-gate failures NOT decreasing → recipe + gap-feedback wording
    isn't actionable to a live model; concrete fix candidates
  - Schema validation fails → prompt-template tightening
  - Token cap hit → diff-only feedback to next pass
  - Loop bailed early → plateau detector tuning
- Follow-up: deferred per-retry trace (small `lib/research/loop.ts` change
  to expose `retryHistory`)
- W4 baseline auto-pickup from brief slug

The actual run is gated on `ANTHROPIC_API_KEY` — script + runbook land in
this commit; the run is the user's call.

## G5 — Real user validation prep (no recruitment)

`docs/USER_VALIDATION_RUNBOOK.md` covers:
- Three-user recruiting plan tied to W4 personas (1 SDR + 1 clinic-front-desk-or-MA + 1 pantry-coordinator-or-volunteer)
- "Don't recruit if" list (already paying for competitor; hasn't done the
  work in 30 days; close-friend politeness; technical user; phone-only)
- 30-min session template:
  - Opening 5 min (unprompted exploration; observe first click + first
    confusion + pattern matching)
  - Core flow 15 min (domain prompt; measure time-to-first-success ≤5 min;
    capture confusion + trust-breakers + off-script attempts)
  - Day-2 wishes 5 min (job-to-be-done anchor)
  - Day-1 trust 5 min (anything that broke trust in the data)
- Synthesis protocol: convergent (2/3 or 3/3 = act), divergent (1/3 = note),
  surprises (most valuable signal)
- Privacy + consent + "don't ship one fix per finding" rules

`docs/USER_VALIDATION_TEMPLATE.md` is the per-test capture form: session
metadata, anonymized user context, time-to-first-success, confusion +
trust-breaker tables, day-2/day-1 classification, recipe-vs-actual-work
comparison, plus a synthesis section for after the round.

The actual recruitment + sessions are the user's call.

## Validation suite results (all green)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run smoke` | **428 files** / 14 phases ✅ |
| `npm run test:depth-enforcement` | 5/5 PASS |
| `npm run test:research-source-readiness` | 4/4 PASS |
| `npm run test:audit-exit` + `test:audit-exit-e2e` | PASS |
| `npm run test:quality-regression` | PASS |
| `npm run test:functional-requirements-failures` (NEW) | **5/5 PASS** |
| Loop-50 (`scripts/loop-50-iterations.ts`) | **50/50 all-green** |

## Loop-50 corpus deltas

| Metric | W3 (pre-G) | Post-G W5 | Delta |
|---|---:|---:|---:|
| All-green iterations | 50/50 | **50/50** | unchanged |
| Quality audit | 50/50 production-ready | **50/50 production-ready** | unchanged |
| Score (min / median / max) | 97 / 99 / 100 | **97 / 99 / 100** | unchanged |
| Research-grounded | 50/50 | **50/50** | unchanged |
| Demo / client-ready | 0/50 (synth cap) | **0/50** (cap held) | unchanged |
| **`requirement-failure-variance` mean** | **2.0/5** | **5.0/5** | **+3.0 (W5 backlog target was ≥3)** |
| **Depth-grade mean** | **19.7/30 (66%)** | **22.7/30 (76%)** | **+3.0 / +10pp** |
| Depth distribution | moderate=50, deep=0 | **moderate=50, deep=0** | synth cap held |
| Raw expert total | 83.8/110 | **86.8/110** | +3.0 |

The corpus-wide `requirement-failure-variance` lift from 2.0 → 5.0 is the
single largest depth-related win in the project's history. It comes from
two stacked fixes in this phase:

1. **G W4 staged matching** (`matchFailureModeForStepDetailed`): pick a
   failure mode by Jaccard token overlap on `step.branchOn` first, then
   `step.systemResponse`, instead of rotating by step.order modulo. Killed
   the cross-workflow join-spam (delimiter check under "resolve flagged
   rows", etc.).
2. **G W5 greedy single-best-step assignment**: each failure mode is
   assigned to exactly one step (the highest-scoring match); other steps
   get a generic step-aware pointer that mentions `step.branchOn` so even
   pointer lines stay distinct. Killed the within-workflow duplicate spam.

The corpus depth-grade lift (+3.0/30) is large enough to push the median
synth workspace from "low moderate" to "high moderate" without breaking
the synth cap (no synth workspace rates "deep" by design — the depth
gate's blocking rules continue to fire on `workflow-step-realism = 3` for
synth, which is correct: synth workflows really are templated).

## Recipe-validation workspace spot-check (iter-09 SDR)

Regenerated with `npm run create-project --research-from=.tmp/recipe-validation` after all G commits:

| Property | Pre-G | Post-G |
|---|---|---|
| Lifecycle banner | Blocked | **BuildReady** |
| `BUILDER_START_HERE.md` | not emitted | emitted (canonical 10) |
| `archive/INDEX.md` | not emitted | emitted (ceremony catalog) |
| `architecture/DEPLOYMENT_TEMPLATE/` | not emitted | emitted (6 files) |
| Audit total | 100/100 production-ready | **100/100** production-ready |
| Depth grade | 27/30 deep | **28/30 deep** |
| Depth-gate | passed (1 advisory: requirement-failure-variance=2) | **passed (no advisories)** |
| `requirement-failure-variance` | 2/5 | **5/5** (after G W5 greedy assignment) |
| Per-step failure-case duplicates | 17 of 31 (55% join-spam) | **0 of 31 (0%)** — every line unique |

## What's next

The Phase G deliverables open two execution gates the user controls:

1. **G4 execution**: provide `ANTHROPIC_API_KEY` and run
   `scripts/run-real-research-validation.ts` against `examples/sdr-sales-module.json`.
   Expected: total ≥95, audit retries 0-2, depth-gate clean. The runbook
   documents red flags and remediation. The W4 baseline at
   `.tmp/recipe-validation/` is the comparison anchor.

2. **G5 execution**: recruit one SDR + one clinic-front-desk + one
   pantry-coordinator and run the 30-min protocol. Synthesize per the
   runbook; ship convergent fixes; document divergent findings; trigger
   the next round when criteria fire.

When both run, Phase G is genuinely demo-ready — measured, not inferred.

## Files modified summary

| File | Change |
|---|---|
| `lib/types.ts` | LifecycleStatus extended (BuildReady + ResearchIncomplete + DemoReady + ReleaseNotApproved); WarningSource adds 'schema' |
| `lib/generator.ts` | deriveLifecycleStatus + computeBuildReadyFlag + computeDemoReadyFlag; deployment-template emit; failure-mode staged matching; archive index emit; BUILDER_START_HERE delegated to module |
| `lib/generator/deployment-template.ts` (NEW) | 6-file deployment scaffold emitter |
| `lib/generator/builder-start-here.ts` (NEW) | 9-section build-handoff page emitter |
| `lib/research/depth-gate.ts` | New `build-recipe-coverage` advisory rule |
| `lib/scoring.ts` | ResearchIncomplete rating downgrade |
| `lib/workflow.ts` | Next-action handlers for new lifecycle states |
| `scripts/mvp-builder-quality-audit.ts` | `expertBuildRecipeCoverage` dim + ResearchExtractsLite extension (id on workflows, enumValues on entity fields) |
| `scripts/run-real-research-validation.ts` (NEW) | G4 wrapper |
| `scripts/test-functional-requirements-failures.ts` (NEW) | 5 tests (T1-T3 pure, T4 generator integration, T5 recipe-validation audit); all passing |
| `package.json` | `test:functional-requirements-failures` script |
| `docs/BUILD_RECIPE.md` (NEW) | 829-line build recipe |
| `docs/REAL_LLM_VALIDATION_RUNBOOK.md` (NEW) | 241-line G4 runbook |
| `docs/USER_VALIDATION_RUNBOOK.md` (NEW) | G5 protocol |
| `docs/USER_VALIDATION_TEMPLATE.md` (NEW) | G5 per-test capture form |
| `docs/PHASE_G_DEMO_READY_REPORT.md` (NEW) | this report |

## Known follow-ups

- The current `AuditExitOutcome` exposes the final audit only, not a
  per-retry history. Adding `retryHistory: AuditExitResult[]` to
  `lib/research/loop.ts` is a small change that would let the G4 script
  surface a richer red-flag check (depth-gate failures decreasing across
  retries). Deferred from G4 prep; do it the first time a real-LLM run
  produces unclear retry behavior.
- The `build-recipe-coverage` audit dim is wired as advisory in the depth
  gate. Once enough builds produce `build/manifest.json`, calibrate
  thresholds from real data and graduate to blocking.

## Out of scope

- Domain packs (rejected in F1 revert; not reintroduced).
- Headline /100 cap rebaseline (depth-grade is the second signal layer).
- Real-recipe SDK execution against Claude API (still gated on
  `ANTHROPIC_API_KEY`; runbook + script land in G4).
- User recruitment (gated on humans; runbook + template land in G5).
- The clean post-G corpus rerun shows 50/50 all-green under stable load
  (initial mid-session reruns picked up transient Windows
  STATUS_DLL_INIT_FAILED errors during high concurrency; final run
  produced the canonical numbers above).
