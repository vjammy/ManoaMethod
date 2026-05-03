# Phase G — Builder handoff simplification

Landed: 2026-05-03. Phase G closes the four workspace-usability gaps the
fresh-builder validation surfaced in Phase F follow-up (W5):

1. ~60 top-level markdown files mixing build-critical and audit-evidence files
2. `00_PROJECT_CONTEXT.md` saying "Blocked" for workspaces that were actually
   build-ready — the lifecycle banner conflated structural blockers,
   missing release approval, and incomplete research
3. `FUNCTIONAL_REQUIREMENTS.md` repeating identical Failure-case lines across
   unrelated requirements (the "join-spam" generator artifact)
4. `MOCKING_STRATEGY.md` saying "magic-link is mocked" without specifying how

All four gaps were called out in `docs/PHASE_F_FOLLOWUP_REPORT.md` as
actionable follow-ups. Phase G implements them as code, with tests pinning
the new behavior, while preserving every architectural constraint from the
Phase F pivot (no domain packs, no archetype routing, no keyword templates).

## Summary of changes

| Work item | Deliverable |
|---|---|
| **W1** Builder file contract | Tier 1 / Tier 2 / Tier 3 catalog defined and rendered |
| **W2** `BUILDER_START_HERE.md` | New 9-section file rendered by `lib/generator/builder-start-here.ts`; replaces the thin pre-G stub |
| **W3** `ARCHIVE_INDEX.md` + Tier 3 banners | Index emitted at workspace root; banner prepended automatically to every Tier 3 file at emit time |
| **W4** Lifecycle semantics | Added `DemoReady`, `ResearchIncomplete`, `ReleaseNotApproved` to `LifecycleStatus`; updated `deriveLifecycleStatus` so `Blocked` only fires on real structural failures |
| **W5** Failure-case join-spam | Staged matcher (branchOn → systemResponse → fallback) + greedy single-step assignment so each failure mode appears at most once per workflow; `tokenizeForFailureMatch` and `jaccard` exposed; `test:functional-requirements-failures` pins the behavior |
| **W6** Magic-link demo auth | When auth integration is `mockedByDefault: true`, `MOCKING_STRATEGY.md` emits a concrete demo-safe contract (role-switcher, file-system magic-link mock, token verify route, `AUTH_DEMO_MODE` shortcut) |
| **W7** Validation | Recipe-validation workspace regenerated and audited; full test matrix re-run; loop-50 re-run (results in [Loop-50 results](#loop-50-results) below) |

## Before/after workspace structure

### Before (post-Phase F)

```
mvp-builder-workspace/
├── 00_APPROVAL_GATE.md          ← review evidence
├── 00_PROJECT_CONTEXT.md         ← can say "Blocked" even when build-ready
├── BUSINESS_USER_START_HERE.md   ← review-side entry
├── BUILDER_START_HERE.md         ← thin stub (G2 era)
├── CURRENT_STATUS.md, COPY_PASTE_PROMPTS.md, MODULE_MAP.md, …
├── DEPLOYMENT_PLAN.md, OPERATIONS_RUNBOOK.md, ROLLBACK_PLAN.md, …
├── FINAL_RELEASE_REPORT.md, FINAL_HANDOFF.md, FINAL_GATE_REPORT.md, …
├── HANDOFF.md, PRODUCTION_GATE.md, RELEASE_CHECKLIST.md, …
├── archive/INDEX.md              ← indexed but at a path the builder won't see
└── (~50 more top-level files)
```

A fresh build agent had no way to tell which 10 files mattered. The W5 agent
opened the workspace and noted: "60+ meta files with overlapping/contradictory
status; the actually load-bearing files for a builder are <10."

### After (post-Phase G)

```
mvp-builder-workspace/
├── BUILDER_START_HERE.md         ← Tier 1: the canonical 9-section build entry
├── ARCHIVE_INDEX.md              ← Tier 3 catalog at workspace root
├── 00_PROJECT_CONTEXT.md         ← human-readable status ("Demo-ready", "Build-ready"); never falsely says "Blocked"
├── BUSINESS_USER_START_HERE.md   ← review-side entry, unchanged
├── PROJECT_BRIEF.md              ← Tier 1
├── product-strategy/USE_CASES.md, USER_PERSONAS.md, SUCCESS_METRICS.md   ← Tier 1
├── requirements/PER_SCREEN_REQUIREMENTS.md, FUNCTIONAL_REQUIREMENTS.md   ← Tier 1
├── architecture/DATABASE_SCHEMA.md, .sql                                 ← Tier 1
├── research/extracted/{workflows,screens,testCases}.json                 ← Tier 1
├── phases/<slug>/INTEGRATION_TESTS.md, TEST_CASES.md                     ← Tier 1
├── evidence/audit/QUALITY_AUDIT-*.md                                     ← Tier 1
├── FINAL_*.md, HANDOFF.md, PRODUCTION_GATE.md, …                         ← Tier 3 (each carries banner)
├── OPERATIONS_RUNBOOK.md, ROLLBACK_PLAN.md, DEPLOYMENT_PLAN.md, …        ← Tier 3 (each carries banner)
├── CURRENT_STATUS.md, COPY_PASTE_PROMPTS.md, MODULE_MAP.md, …            ← Tier 3 (each carries banner)
└── (Tier 3 paths unchanged so validators / smoke test still pass)
```

No files moved on disk. The signal lives in two new files
(`BUILDER_START_HERE.md`, `ARCHIVE_INDEX.md`) plus a banner injected at the
top of every Tier 3 file. A build agent that opens any Tier 3 file by accident
sees within the first line that it's not load-bearing.

## Tier 1 / Tier 2 / Tier 3 file contract

### Tier 1 — required reading for an implementing agent
The canonical build-side reading list. Listed in `BUILDER_START_HERE.md`
section 6.

| File | Why |
|---|---|
| `BUILDER_START_HERE.md` | Single entry point; section 1-9 cover scope, validation, mocking, run, done |
| `PROJECT_BRIEF.md` | Product brief + must-have scope |
| `requirements/PER_SCREEN_REQUIREMENTS.md` | Empty / loading / error / populated state contract per screen |
| `requirements/FUNCTIONAL_REQUIREMENTS.md` | Per-step requirements with actor, action, system response, failure case |
| `architecture/DATABASE_SCHEMA.md` + `.sql` | Postgres-correct DDL (when entity fields carry dbType) |
| `product-strategy/USE_CASES.md` | Use cases per persona with happy / edge / failure / recovery paths |
| `product-strategy/USER_PERSONAS.md` | Actor-level personas with JTBDs |
| `product-strategy/SUCCESS_METRICS.md` | D1/D7/D30 signals that prove the demo worked |
| `research/extracted/workflows.json` | Workflows in dependency order (one route group per workflow.id) |
| `research/extracted/screens.json` | Machine-readable screen state |
| `research/extracted/testCases.json` | Test cases per persona × workflow × screen |
| `phases/<slug>/INTEGRATION_TESTS.md`, `TEST_CASES.md` | Integration tests for the first phase |
| `evidence/audit/QUALITY_AUDIT-*.md` | Audit verdict with depth-grade |

### Tier 2 — secondary reference

`research/USE_CASE_RESEARCH.md`, `research/DOMAIN_RESEARCH.md`,
`product-strategy/IDEA_CRITIQUE.md`, `product-strategy/JOBS_TO_BE_DONE.md`,
`product-strategy/VALUE_PROPOSITION.md`, `ui-ux/UX_FLOW.md`,
`ui-ux/screens/*.md`, `requirements/PERMISSION_MATRIX.md`,
`requirements/REGULATORY_NOTES.md`, `integrations/MOCKING_STRATEGY.md`,
`security-risk/PRIVACY_RISK_REVIEW.md`. Open these when the Tier 1 file
points at them or when the build agent needs deeper context on a specific
behavior.

### Tier 3 — audit / handoff / release evidence

Catalogued in `ARCHIVE_INDEX.md`. Each file carries the Tier 3 banner. Files
emit at their existing paths; nothing moves on disk so validators continue
to pass.

The `TIER_3_FILES` constant in `lib/generator.ts` enumerates the explicit
list:

- `FINAL_*.md` (release/handoff snapshots) — 7 files
- `00_APPROVAL_GATE.md`, `HANDOFF.md`, `PRODUCTION_GATE.md`,
  `RELEASE_CHECKLIST.md`, `PRODUCTION_READINESS_CHECKLIST.md` — approval/gating
- `OPERATIONS_RUNBOOK.md`, `INCIDENT_RESPONSE_GUIDE.md`, `ROLLBACK_PLAN.md`,
  `DEPLOYMENT_PLAN.md`, `ENVIRONMENT_SETUP.md` — operational runbooks
- `CURRENT_STATUS.md`, `COPY_PASTE_PROMPTS.md`, `MODULE_MAP.md`,
  `WHAT_TO_IGNORE_FOR_NOW.md`, `STEP_BY_STEP_BUILD_GUIDE.md`,
  `ORCHESTRATOR_GUIDE.md`, `TROUBLESHOOTING.md` — beginner-business companion
- `recursive-test/*`, `auto-improve/*` — improvement-loop ceremony

## Examples

### `BUILDER_START_HERE.md` — first 90 lines (recipe-validation workspace)

```
# BUILDER_START_HERE

> This is the entry point for an implementing coding agent. Read this file end-to-end before opening anything else. The 9 sections below carry the only context you need to build, validate, and stop.

Status: **Demo-ready** — research-grounded, depth gate passed, all demo artifacts present. The 10-file Tier 1 reading list below is sufficient to scaffold and deploy a runnable demo.

---

## 1. What you are building

Conference SDR Hub — After conferences, attendee lists turn into a backlog of cold names. SDRs lose track of who's worth contacting, what to say, and who's already been worked.

Must-have scope:
- Import attendee list
- research per attendee
- prioritize
- draft outreach angles
- log follow-ups.

## 2. Who uses it

Primary audience: SDRs

Researched personas:
- Conference SDR (primary-user)
- Sales Manager (reviewer)
- Account Executive (external)
- Sales Operations Analyst (operator)

## 3. Day-1 behaviors that must work

A real user opening the demo on day 1 must be able to complete each of these flows without hitting a dead-end:

- **Post-conference list intake and territory triage** — actor Upload the conference attendee CSV…
- **Per-attendee structured research and angle drafting** — actor Open the next unresearched attendee…
- **Prioritize researched attendees and freeze the prep queue** — …
- (3 more)

## 4. Validation behaviors that must be implemented (server-side)

These are the failure-mode rules a real builder must enforce at the API / server-action layer. The UI alone is not enough — a malicious or buggy client can bypass form-only validation.

- On **csv file uses a non-comma delimiter (semicolon or tab) without a recognizable header** — detect delimiter via the header line; refuse import…
- On **imported list overlaps with existing ae-owned accounts** — on import, dedupe each row's email-domain…
- On **sdr submits a research note with all three structured fields blank** — server-side validation: refuse save if companyanchor, fitsignal, or anglehook is empty or under 20 characters…
- (9 more)

## 5. What is intentionally mocked

- **Magic-link sign-in** (auth) — Send a magic-link email to authenticate a member… See `integrations/MOCKING_STRATEGY.md` for the demo-safe mock contract; swap to a real provider (`AUTH_MAGIC_LINK_PROVIDER`) before promoting.
- **Source URL reachability check** (other) — Background HEAD request on Research Note sourceUrl…

### Real credentials required for these (no demo-safe mock):
- **Attendee CSV import** (other) — real credential required (`ATTENDEE_CSV_MAX_BYTES`).
- **Audit log CSV export** (other) — real credential required (`AUDIT_EXPORT_CHUNK_SIZE`).
```

The full file continues with sections 6 (Tier 1 reading list with file
caveats), 7 (Tier 3 patterns), 8 (`make setup / dev / test / audit`), and 9
(7-criterion done check).

### Tier 3 demotion banner — example on `FINAL_CHECKLIST.md`

```
# FINAL_CHECKLIST

> **Tier 3 (audit/handoff trail).** This file is part of the review/release evidence; it is NOT load-bearing for an implementing agent. See [BUILDER_START_HERE.md](BUILDER_START_HERE.md) for the build path. See [ARCHIVE_INDEX.md](ARCHIVE_INDEX.md) for the full Tier 3 catalog.

## Before you call this project done
- [ ] I know what the app is supposed to do.
- [ ] Product Goal and Scope and What the App Must Do are still consistent with the final result.
…
```

The banner sits below the H1 (so anchor / TOC tools that infer titles still
work) and is idempotent — `prependTier3Banner` no-ops if the banner is
already present.

## Lifecycle semantics — before/after

### Before
The lifecycle had four states that mattered: `Draft`, `Blocked`,
`ReviewReady`, `BuildReady`/`ApprovedForBuild`. `Blocked` covered three
unrelated problems:

- structural research conflict (the actual blocker)
- missing release approval (the workspace was build-ready)
- thin / no research extractions (the recipe just hadn't run)

The recipe-validation workspace pre-G said "Status: Blocked" with five
"Critical answer missing" review notes — even though every workflow,
screen, and entity was researched and the workspace was buildable. The
fresh-builder agent flagged this as a top-3 confusion source.

### After
Eight lifecycle states with disjoint meanings:

| State | Meaning | When |
|---|---|---|
| `Blocked` | Real structural failure | schema-validation severity > 'note' OR unresolved critical conflict |
| `ResearchIncomplete` | No extractions | `context.extractions == null` |
| `Draft` | Early planning | low score + warnings |
| `ReviewReady` | Human review possible | score ≥ 88, no warnings, not approved |
| `BuildReady` | Coding agent can build | research grounded + workflows/screens/entities present + no critical conflicts |
| `DemoReady` | Build + demo artifacts complete | BuildReady + ideaCritique + competingAlternatives + screens + testCases + DDL + JTBDs |
| `ApprovedForBuild` | Explicit human approval | ReviewReady + approval metadata |
| `ReleaseNotApproved` | Buildable but release evidence absent | BuildReady/DemoReady + release evidence missing (set externally) |
| `InRework` | Phase reopened | Existing — unchanged |

`deriveLifecycleStatus` short-circuits in this order: structural-blocker →
research-incomplete → approved-for-build → demo-ready → build-ready →
warning-blocker → review-ready → draft.

### Examples

| Workspace | Pre-G status | Post-G status |
|---|---|---|
| Recipe-validation (full) | Blocked (with 5 review notes) | DemoReady |
| Synth iter-09 | ReviewReady | ReviewReady (unchanged — synth never reaches BuildReady/DemoReady by design) |
| Empty / templated baseline | Draft | ResearchIncomplete |
| Schema-conflict workspace | Blocked | Blocked (genuine structural blocker — semantics preserved) |

`00_PROJECT_CONTEXT.md` now renders the human-readable status:

```
## Current package status
Status: Demo-ready

(machine-readable lifecycle: `DemoReady`)
```

…instead of the bare `Blocked` token. The "Review notes (non-blocking)"
heading in the same file replaces the pre-G "Current blockers" header when
the workspace is buildable, which is exactly the signal a builder needs.

## Failure-case before/after (W5)

### Before
`buildFunctionalRequirementsFromResearch` rotated `failureModes[i %
failureModes.length]` per step, so a workflow with 5 steps and 2 failure
modes would attach the same Failure-case line to 2-3 unrelated requirements.
The W5 agent flagged this verbatim:

> "Failure-case join-spam. FUNCTIONAL_REQUIREMENTS.md repeats failure-case
> lines across requirements that don't logically map (e.g. delimiter check
> listed under 'resolve flagged rows' requirement). Generator artifact, not
> research artifact."

The `requirement-failure-variance` audit dim measured this:
post-pivot synth corpus mean = 2.0/5; recipe-validation = 3/5 (35%
duplicate failure-case lines).

### After
Three-stage matcher (`matchFailureModeForStepDetailed`):

1. Match `step.branchOn` ↔ `failureMode.trigger` by Jaccard token overlap
2. If no branchOn match, match `step.systemResponse` ↔ `failureMode.trigger`
3. If neither yields meaningful overlap, return `undefined`

Plus **greedy single-step assignment** per workflow: every failure mode is
attached to the ONE step that scored it highest; remaining steps get a
step-aware fallback that mentions their own `branchOn`. Result: each
failure mode appears at most once per workflow, every Failure-case line is
unique, and no requirement carries an unrelated failure.

Pinned by `npm run test:functional-requirements-failures`:

| Test | Behavior pinned |
|---|---|
| T1 | branchOn match wins over systemResponse match |
| T2 | systemResponse used when branchOn is empty |
| T3 | No keyword overlap → undefined (caller emits generic fallback) |
| T4a | No two requirements from different workflows share the same Failure-case line |
| T4b | Every non-fallback Failure-case shares ≥ 1 keyword with its step |
| T5 | `requirement-failure-variance` ≥ 4/5 on the recipe-validation workspace |

Recipe-validation result: 31 failure-case lines, **0 duplicates (0%)**,
`requirement-failure-variance = 5/5`.

## Magic-link mock behavior (W6)

When `research/extracted/integrations.json` declares an `auth` integration
with `mockedByDefault: true`, `MOCKING_STRATEGY.md` now emits the explicit
contract a builder must implement:

1. **Direct role-switcher** at `/dev/sign-in` (only when
   `AUTH_DEMO_MODE=true`): pick a researched actor role and sign in directly.
2. **Magic-link path that preserves real UX** at `/auth/sign-in`: form
   accepts any email, generates a token, writes
   `.tmp/magic-links/<sha256(email)>.txt` containing the verify URL, logs
   the same link to `console.log` with a `[magic-link mock]` prefix, and
   shows a "Check your email" success screen with a dev-only "Open last
   magic link" button.
3. **Token verify route** at `GET /auth/verify?token=…&email=…`: validates
   token freshness (≤15 min), signs the user in, deletes the token file.
   Returns 429 after 3 failed attempts on the same email (mirrors the
   rate-limit failure mode in research).
4. **Role inference from email local-part**: `sdr+anything@x` → SDR,
   `mgr+anything@x` → manager. Lets the demo exercise role-specific screens
   without a user-table seed.
5. **Demo shortcut**: `AUTH_DEMO_MODE=true` skips the send step entirely
   and submits straight to verify with a freshly-minted token. Token file
   still gets written so the audit log shape stays consistent.

The contract also names the swap point: replace the body of
`sendMagicLink(email)` with Resend / Postmark / SES; everything else stays
identical. The mock is what the build recipe (`docs/BUILD_RECIPE.md` pass
B3) calls "auth wiring with a clear demo path", made concrete.

When `mockedByDefault: false` and the integration is `required: true`,
`MOCKING_STRATEGY.md` emits the alternative section ("real provider
required, set $envVar in .env.local; do not stub auth without first
surfacing a blocker").

## Validation command results

All commands run on the recipe-validation workspace generated post-Phase G.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run smoke` | 428 files / 14 phases ✅ (pre-G baseline 420; +8 from Phase G + earlier G3 deployment-template) |
| `npm run test:depth-enforcement` | 5/5 PASS (4 pure-function + 1 e2e) |
| `npm run test:research-source-readiness` | 4/4 PASS |
| `npm run test:audit-exit` | 3/3 PASS |
| `npm run test:audit-exit-e2e` | 2/2 PASS |
| `npm run test:quality-regression` | 10/10 PASS |
| `npm run test:functional-requirements-failures` (NEW) | 5/5 PASS |
| `npm run regression -- --package=.tmp/recipe-validation/...` | 151/151 PASS |
| `npm run audit -- --package=.tmp/recipe-validation/... --enforce-depth` | 100/100, depth=30/30 (deep), demoReady=true, depth gate passed |

Recipe-validation workspace verification (per spec):

- ✅ `BUILDER_START_HERE.md` exists at workspace root
- ✅ `ARCHIVE_INDEX.md` exists at workspace root
- ✅ Tier 3 banner present in `FINAL_CHECKLIST.md`, `FINAL_HANDOFF.md`,
  `OPERATIONS_RUNBOOK.md`, etc.
- ✅ `repo/mvp-builder-state.json` `lifecycleStatus = "DemoReady"`
- ✅ `00_PROJECT_CONTEXT.md` says `Status: Demo-ready` (no false "Blocked")
- ✅ `integrations/MOCKING_STRATEGY.md` includes the demo-safe magic-link
  mock section
- ✅ `requirement-failure-variance = 5/5` (≥ 4/5 spec target)

## Loop-50 results

Loop-50 ran post-G with the new generator. The harness reuses
`synthesize-research-ontology.ts` for deterministic regression. Synth-only
output continues to NOT reach DemoReady by design (synth has empty
ideaCritique / competingAlternatives / jobsToBeDone, so
computeDemoReadyFlag rejects it).

### Headline

| Metric | Pre-G value (Phase F follow-up) | Post-G value |
|---|---:|---:|
| All-green iterations | 50/50 | **50/50** ✅ |
| Audit headline (synth) | mean 98 (97-99) | **mean 99 (97-100)** |
| Production-ready | 50/50 | 50/50 |
| Demo / client-ready | 0/50 | **0/50** ✅ (synth capped, by design) |
| Depth-grade mean (synth) | 19.7/30 (66%) | **22.7/30 (76%)** ⬆ +3.0 |
| Depth-grade distribution | moderate=50 | **moderate=50** ✅ |
| `requirement-failure-variance` mean | 2.0/5 | **5.0/5** ⬆ ✅ (spec target ≥ 3.5) |
| Synth never `DemoReady` lifecycle | held | **held** ✅ |

### Spec-required invariants

| Invariant | Status |
|---|---|
| 50/50 all-green | ✅ 50/50 |
| Synth `demoReady=false` | ✅ Held — `computeReadiness` rule unchanged |
| Synth lifecycle never `DemoReady` | ✅ Held — `computeBuildReadyFlag` requires `agent-recipe`/`imported-real`; `computeDemoReadyFlag` short-circuits on `!buildReady` |
| `requirement-failure-variance` corpus mean ≥ 3.5 | ✅ **5.0/5 corpus mean** (W5 greedy single-step assignment) |
| Smoke file count increases by ≥ 2 | ✅ `BUILDER_START_HERE.md` (rewritten 9-section spec) + `ARCHIVE_INDEX.md` (new at root). Smoke now reports 428 files. |

### Expert rubric dimension means (post-G)

| Dimension | Mean | Max | Δ vs pre-G |
|---|---:|---:|---:|
| research-depth | 5.5 | 10 | — |
| edge-case-coverage | 7.0 | 10 | — |
| role-permission-matrix | 8.6 | 10 | — |
| regulatory-mapping | 5.0 | 5 | — |
| realistic-sample-data | 5.0 | 5 | — |
| screen-depth | 7.5 | 10 | — |
| schema-realism | 8.6 | 10 | — |
| test-case-grounding | 10.0 | 10 | — |
| jtbd-coverage | 5.0 | 5 | — |
| idea-clarity | 2.0 | 5 | — |
| workflow-step-realism | 2.7 | 5 | — |
| **requirement-failure-variance** | **5.0** | 5 | **+3.0 (W5)** |
| entity-field-richness | 4.0 | 5 | — |
| per-screen-acceptance-uniqueness | 5.0 | 5 | — |
| use-case-depth | 3.0 | 5 | — |
| persona-depth | 3.0 | 5 | — |
| **Raw expert total** | **86.8** | 110 | **+3.0** |

The W5 changes account for the entire delta: every other dim is unchanged
because the synthesizer / recipe artifacts didn't change. The depth-grade
mean lift (19.7 → 22.7) is exactly the +3.0 from `requirement-failure-variance`
contributing one of the six F3 depth dims at /5 each.

See `.tmp/loop-50/REPORT.md` for the full per-iteration table and finding
frequencies.

## Remaining risks

1. **Lifecycle state for `ReleaseNotApproved` is not auto-set at generation
   time.** The state is wired into the type system and `deriveLifecycleStatus`,
   but no generator-side check populates `releaseEvidenceMissing`. The
   intended use is for `scripts/mvp-builder-finalize-repo-release.ts` (or a
   future release-evidence checker) to flip the flag based on
   FINAL_DEPLOYMENT_STATUS / OPERATIONS_RUNBOOK content. Wired up but not
   yet triggered.

2. **DemoReady at generation time uses an artifact-presence proxy, not the
   audit's /100 score.** The spec's "score ≥ 95" check assumes the audit has
   run, but `generateProjectBundle` runs before the audit. The proxy uses
   the same artifact-set the audit checks (idea critique + competing
   alternatives + screens + DDL + test cases + JTBDs + workflow failure
   modes), which mirrors `computeReadiness` exactly. Real-world divergence
   should be rare; if it appears, the post-audit `demoReady` flag in
   `last-audit.json` is the source of truth.

3. **Tier 3 file list is closed at code level.** Adding a new ceremony file
   without also adding it to `TIER_3_FILES` will leave it without a banner.
   This is fine because the list is small and obvious, but worth noting
   as a maintenance touchpoint.

4. **Greedy single-step failure-mode assignment is workflow-local.** Two
   different workflows can still reference the same trigger string (if
   the underlying research has overlapping failureModes). T4a in the new
   test pins this against the synthetic 2-workflow fixture; the recipe
   validation has 7 workflows with disjoint failure modes so the
   recipe-grade corpus is unaffected.

5. **`renderBuilderStartHere` is text-templated.** A future enhancement
   could assemble it from research extractions JSON-Schema-style instead
   of string interpolation, but that's a refactor without functional
   delta — the current shape passes the W5 fresh-builder bar.

## Files modified summary

| File | Change |
|---|---|
| `lib/generator.ts` | New `TIER_3_FILES`, `TIER_3_BANNER`, `prependTier3Banner`, `isTier3Path`; rewritten `buildArchiveIndex` for `ARCHIVE_INDEX.md` at root; `add` wrapper applies banner; `buildBuilderStartHere` delegates to new module; `deriveLifecycleStatus` extended with `demoReady`/`researchIncomplete`/`releaseEvidenceMissing` arms; new `computeDemoReadyFlag`; updated `getLifecycleSummary`; staged `matchFailureModeForStepDetailed` + greedy single-step assignment + step-aware fallback in `buildFunctionalRequirementsFromResearch`; magic-link contract in `buildMockingStrategy`; updated `buildRootContext` with human-readable status |
| `lib/generator/builder-start-here.ts` (NEW) | `renderBuilderStartHere` — pure function rendering the 9-section file from `ProjectInput` + `ResearchExtractions` |
| `lib/types.ts` | `LifecycleStatus` adds `DemoReady`, `ResearchIncomplete`, `ReleaseNotApproved` |
| `lib/workflow.ts` | `getLifecycleNextAction` covers all new states |
| `lib/scoring.ts` | `ResearchIncomplete` rating cap mirrors `Draft` semantics |
| `scripts/test-functional-requirements-failures.ts` (NEW) | 5 tests pinning the W5 behavior |
| `package.json` | `test:functional-requirements-failures` npm script |
| `docs/PHASE_G_BUILDER_HANDOFF_REPORT.md` (NEW) | this report |

## Out of scope

- Domain packs (architectural decision from F1 pivot — preserved)
- Archetype routing (deleted in A3c — preserved)
- Keyword-template systems (deleted with archetypes — preserved)
- Weakening the Phase F depth gate (preserved — synth still capped, audit
  unchanged)
- Making synth output demo-ready (intentionally rejected; synth is a
  regression harness)
- Headline /100 score rebaseline (Phase E5 decision; depth-grade is the
  second signal layer)
- Automatic release-evidence detection (`ReleaseNotApproved` is plumbed
  but the flip side is left for a follow-up)
- Real-recipe SDK execution against real LLM (still gated on
  `ANTHROPIC_API_KEY`)
