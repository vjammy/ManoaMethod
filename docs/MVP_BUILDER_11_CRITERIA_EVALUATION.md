# MVP Builder — 11-Criteria Evaluation

**Date:** 2026-05-03
**Evaluator:** session-driven; user-supplied 11 criteria
**Scope:** generate three workspaces across distinct domains, audit each, inspect against the criteria, identify gaps and enhancements.

## Cases evaluated

| Case | Brief | Path-on-disk |
|---|---|---|
| SDR | `examples/sdr-sales-module.json` (B2B, role-heavy) | `.tmp/eval-11/sdr/workspace/mvp-builder-workspace/` |
| Clinic | `examples/small-clinic-scheduler.json` (regulated, multi-actor) | `.tmp/eval-11/clinic/workspace/mvp-builder-workspace/` |
| Restaurant | `examples/local-restaurant-ordering.json` (consumer, transactional) | `.tmp/eval-11/restaurant/workspace/mvp-builder-workspace/` |

Generation path: `synthesize-research-ontology.ts` (synth bridge) → `mvp-builder-create-project.ts`. Synth was used because it is repeatable and runs in seconds; the agent-recipe path (RESEARCH_RECIPE.md, 9 passes) would yield deeper extractions but was not run inside this session.

## Headline results

| Case | Audit score | Depth grade | Depth gate | Source | Phases | Screens | Playwright flows | Files |
|---|---|---|---|---|---|---|---|---|
| SDR | 96/100 production-ready | 23/30 (77 %, moderate) | ❌ workflow-step-realism = 3 (need ≥ 4) | synthesized | 11 | 8 | 14 | 404 |
| Clinic | 97/100 production-ready | 23/30 (77 %, moderate) | ❌ workflow-step-realism = 3 (need ≥ 4) | synthesized | 14 | 8 | 35 | ~430 |
| Restaurant | 97/100 production-ready | 23/30 (77 %, moderate) | ❌ workflow-step-realism = 3 (need ≥ 4) | synthesized | 10 | 8 | 14 | ~390 |

All three fail the same depth dimension: synth uses templated CRUD verbs ("Create a new X", "Edit X title") rather than concrete domain verbs the actor would say. Production-ready ≠ demo-ready (RC2 rule); `demoReady=false` because `source=synthesized`.

## Verdict per criterion

Legend: ✅ implemented · ⚠️ implemented but conditional / partial · ❌ not implemented · 🟡 implemented for shape but synth-path produces thin substance.

| # | Criterion | Verdict | Evidence | Limit / gap |
|---|---|---|---|---|
| 1 | Researched requirements with back-and-forth | ✅ | `docs/RESEARCH_RECIPE.md` (9-pass spec) + `lib/research/loop.ts` (probe/loop/auto-iterate) + `lib/research/audit-exit-runner.ts` (audit-as-exit-criterion) | The recipe is executed by the calling agent (Kimi/Claude Code/Codex/OpenCode), not by mvp-builder itself; SDK runtime path is OAuth-blocked and unused in production. |
| 2 | Properly phased | ✅ | Phases derived from research extractions; SDR → 11, Clinic → 14, Restaurant → 10. Gates per phase: `phases/<slug>/{ENTRY_GATE.md, EXIT_GATE.md, EVIDENCE_CHECKLIST.md, VERIFICATION_REPORT.md}`. | Phase count is needs-driven; user's "20-phase" example is achievable for richer briefs (clinic already lands at 14). |
| 3 | Multi-actor due diligence | 🟡 | `product-strategy/USER_PERSONAS.md` (one block per primary/reviewer/operator actor), `requirements/PERMISSION_MATRIX.md`, `research/extracted/actors.json` | **Synth-path personas are templated** — clinic personas are identical wording with actor names swapped (motivation, pain points, adoption signals). Audit `persona-depth` dim catches this; synth caps at moderate. Agent-recipe path differentiates per actor. |
| 4 | Workflow consideration | 🟡 | `research/extracted/workflows.json` (steps, branchOn, failureModes, sources, evidenceStrength); `ui-ux/USER_WORKFLOWS.md` | **Synth produces 3 generic workflows per case (primary, review, manage-members)** with templated CRUD steps. The depth-gate's `workflow-step-realism = 3` failure on every case proves this. Real recipe lifts this to ≥ 4. |
| 5 | Workflows → UI screens / DB schema | ✅ | `architecture/DATABASE_SCHEMA.sql` (PostgreSQL DDL with FKs, indexes, ENUM CHECKs); `ui-ux/SCREEN_INVENTORY.md` + `ui-ux/screens/<screen-id>.md` per screen; `ui-ux/UX_FLOW.md` (Mermaid state diagram + edge table) | **Synth schemas are skeletal** — every entity has `<id>, title, status (draft/active/archived), createdAt`. Clinic's `provider_availability` table has zero scheduling fields. The audit `schema-realism` dim measures this; synth lands at 8.58/10 mean. |
| 6 | Documentation | ✅ | 390–430 files per workspace covering 14 phases. Per-phase: PHASE_BRIEF, ENTRY_GATE, EXIT_GATE, EVIDENCE_CHECKLIST, TEST_PLAN, TEST_CASES, INTEGRATION_TESTS, VERIFICATION_REPORT, HANDOFF_SUMMARY, NEXT_PHASE_CONTEXT, plus per-actor PLAYWRIGHT_FLOWS. | **Top-level meta-file noise persists**: 60+ root files (FINAL_*, *HANDOFF*, multiple START_HERE variants) — known issue from W5 fresh-agent test. `BUILDER_START_HERE.md` exists, `archive/` consolidation does not. |
| 7 | Per-phase gate with exit criteria + retry | ✅ | `lib/orchestrator/runner.ts` (multi-round loop with `targetScore`, `maxRounds`, `detectStopReason`); per-phase gates + workspace-level gates (`gates/gate-NN-{entry,exit}.md`); `npm run orchestrate` writes prompt packets per round into `orchestrator/prompts/` so a coding agent can re-attempt. | Orchestrator runs `typecheck/smoke/build/test:quality-regression` (REQUIRED) — these validate **planning artifacts**, not the built app. UI gates (criterion 11) are NOT in the orchestrator's command set. |
| 8 | Comprehensive synthetic test data | 🟡 | `SAMPLE_DATA.md` emits per-entity samples in 4 categories: happy / happy-alt / negative-blank / negative-missing / boundary. `research/extracted/testCases.json` includes happy + failure-mode scenarios with mitigation references. | **Test values are templated stubs** ("Sample Scheduler", "Sample Sales") — not realistic ("Dr. Patel — annual physical, 30 min, 9:30 AM"). The `realistic-sample-data` audit dim caps synth at 5/5 anyway because the field shape is correct, but the values aren't memorable. |
| 9 | Auto-regression loop | ✅ | `npm run auto-regression` → `scripts/mvp-builder-auto-regression.ts`. Runs build → `runLoop` (HTTP probe + TEST_SCRIPT.md walk) → `runBrowserLoop` (Playwright, criterion 11) → 50/50 weighted score → iterates up to `--max-iterations` (default 3) until target (default 90). Writes `evidence/runtime/AUTO_REGRESSION_FIX_PROMPT_iteration-NN.md` per failing iteration; rolls phase state back on max-iterations stall. | Operates on a **built** app — needs `npm run build` to succeed and a running runtime at the URL declared in `RUNTIME_TARGET.md`. Not invoked by the orchestrator; a builder agent must call it explicitly. |
| 10 | Autoresearch with quality metrics in loop | ✅ | `scripts/mvp-builder-autoresearch.ts` (use-case loop + probes + readiness labels). `lib/research/audit-exit-runner.ts` (audit-as-exit-criterion: depth gate failures feed back as targeted re-extraction gaps). `lib/research/depth-gate.ts` (`evaluateDepthGate` blocking rules with source-aware ceilings). `--enforce-depth` flag wires it into `npm run audit`. | Live in the harness today (50-iter sweep mean 23/30 depth), but the loop's *quality* of feedback depends on the recipe being run by an agent with internet access — synth alone cannot lift the depth grade past `moderate` (cap held). |
| 11 | Playwright / Chrome DevTools actor-impersonating UI validation | ⚠️ | **Capability exists**: `BROWSER_AUTOMATION_GUIDE.md` documents both options (Chrome DevTools MCP + Playwright); `phases/<slug>/PLAYWRIGHT_FLOWS/<actor>-<workflow>.json` per actor per workflow with happy + negative + role-permission step lists; mock-auth contract `?as=<actorId>`; required testids `data-testid="permission-denied"` and `="form-error"`; `scripts/mvp-builder-loop-browser.ts:runBrowserLoop` drives chromium headless via dynamic import; closed loop wired through `auto-regression`. | **Three real gaps**: (a) Playwright is *optional* — the runner skips with `skipReason='no-playwright'` if not installed in the *built app*, so a builder that forgets `npm install --save-dev playwright` silently degrades to probe-only scoring; (b) `runBrowserLoop` is **not** in `lib/orchestrator/commands.ts` REQUIRED/OPTIONAL list, so the gate engine never enforces UI passing for closure; (c) no fixture in mvp-builder itself runs the browser loop end-to-end against a sample built app, so regression silently breaks if the runner drifts. |

## Cross-criterion observations

### Where mvp-builder is strong

- **Phase + gate scaffolding is real, not theatre.** Each phase has entry gate, exit gate, evidence checklist, verification report stubs, plus the orchestrator that re-runs commands and writes targeted recovery prompts when score < target.
- **Source-aware quality grading.** Audit distinguishes `researchSource ∈ {synthesized, agent-recipe, imported-real, manual}` and refuses to label synth as `demoReady` even at score 100. This prevents synth from passing through gates that require real research.
- **Per-actor browser flows.** This is the surprise — flows are emitted per (actor, workflow) tuple with mock-auth wired to a stable `?as=` contract and explicit role-gating assertions. Clinic produced 35 flows across 14 phases.
- **Auto-regression closes the loop on a built app** (build → probe → playwright → score → fix-prompt → iterate). The fix prompt is machine-readable (`AUTO_REGRESSION_FIX_PROMPT_iteration-NN.md`) so a coding agent can consume it.
- **Audit-as-exit-criterion** for autoresearch (criterion 10) is wired and tested (`npm run test:depth-enforcement`, 5/5 pass).

### Where mvp-builder is thin

- **Synth-vs-recipe substance gap.** The shape is identical (same files emitted), but synth produces templated content for personas, workflows, schemas, and sample data. The depth-gate correctly catches this on every case (workflow-step-realism = 3). Agent-recipe path was not exercised in this evaluation.
- **Actor differentiation in personas is shape-level only.** All four clinic personas have identical motivation/pain/adoption blocks with the actor name find-and-replaced. The persona-depth audit dim is calibrated to credit this as `moderate`, but humans reading the file see the duplication.
- **Database fields are skeletal.** Synth gives every entity `(id, title, status, createdAt)`. There is no `appointmentTime`, `providerId`, `partySize`, `paymentMethod`. The shape is right; the columns aren't.
- **Failure-case join-spam in requirements** — the W5 memo's open issue. Half the requirements show "no dedicated researched failure mode applies; route to workflow-level mitigations" — confirmed in clinic REQ-1, REQ-3, REQ-5.
- **Practice Managers.** has a stray period in the clinic actor name across all artifacts — minor name-normalization bug worth a one-line fix.

### Where the closed loop has a hole

The four loops in mvp-builder don't all chain:

| Loop | Closes on | Feeds back into |
|---|---|---|
| Audit-exit autoresearch loop | depth-gate findings | re-extraction gaps via `auditFindingsAsGaps` |
| Orchestrator gate loop | typecheck / smoke / build / test:quality-regression failures | recovery prompt + re-run, up to maxRounds |
| Auto-regression loop | probe + browser-loop score < target | fix-prompt + re-iterate, up to maxIterations |
| Phase orchestration | per-phase exit-gate evidence | next phase or stall |

**Missing edge:** auto-regression failures (built-app UI broken) → research re-extraction gaps. If the Playwright loop discovers that a workflow can't actually be completed in the built UI, that signal does not flow back into the research recipe to re-extract steps. The auto-regression fix prompt goes to the *builder* agent ("fix the code"), never to the *researcher* agent ("the workflow as researched is wrong"). For criteria 4 and 11 to fully close, this edge needs to exist.

## Recommended enhancements

Ordered by leverage × tractability.

| # | Enhancement | Why | Where | Effort |
|---|---|---|---|---|
| E1 | Wire `runBrowserLoop` (or equivalent) into `lib/orchestrator/commands.ts` OPTIONAL with a flag (`--include-browser`), so the gate engine can be told to enforce UI passing | Closes the open-loop gap on criterion 11 — today UI validation is shipped but never enforced as a gate by the orchestrator | `lib/orchestrator/commands.ts:6`, `runProjectCommands` | S |
| E2 | Add a built-app fixture (`tests/fixtures/mini-built-app/`) with one Next.js page that satisfies one PLAYWRIGHT_FLOWS spec, and a `npm run test:browser-loop` script that runs the full chain against it | Today the Playwright runner can silently rot — no end-to-end coverage in the mvp-builder repo itself proves it works | new `tests/fixtures/`, new test script | M |
| E3 | When auto-regression fails to converge, write a **research-gap** prompt as well as a code-fix prompt (different consumer) and emit a reverse signal `research/extracted/_uiCounterEvidence.json` so the next research pass sees that the researched workflow steps don't render | Closes the missing edge between built-app UI failures and research re-extraction (criterion 4 ↔ 11 link) | `scripts/mvp-builder-auto-regression.ts:75` (`buildIterationFixPrompt`), new emitter in `lib/research/persistence.ts` | M |
| E4 | Differentiate persona narratives per actor in the synth path — at minimum, draw pain points from `actor.knownConcerns` and motivation from `jobsToBeDone[actor]` rather than reusing the brief's success metric for every actor | The personas-look-identical pattern erodes trust in synth output even when audit math gives it credit | `lib/generator/personas.ts` (or wherever personas emit), `scripts/synthesize-research-ontology.ts` actor block | S |
| E5 | Per-step failure-case derivation from `step.branchOn + step.systemResponse` instead of rotating workflow-level `failureModes` modulo step-index | Fixes the W5 join-spam issue: requirements without a specific failure currently borrow an unrelated one. Status today: half of clinic REQs print "no dedicated researched failure mode applies" | requirements emitter in `lib/generator/`, see W5 memo item 4 | S |
| E6 | Synth path: emit at least one domain-specific field per entity by mining the brief's `dataAndIntegrations` text for noun phrases (e.g., "appointment time" → `appointmentTime TIMESTAMPTZ`) instead of `(id, title, status, createdAt)` | Lifts schema-realism on synth from "templated stub" to "domain-shaped stub" without requiring full agent-recipe research | `lib/generator/database-schema.ts` (or wherever DDL emits), token-pack expansion | M |
| E7 | Move the 60+ top-level meta files into `archive/` and keep only the ~10 a builder opens (BUILDER_START_HERE, README, PROJECT_BRIEF, PHASE_PLAN, ARCHIVE_INDEX as the index) | Known W5 issue — a less attentive agent loses 30–60 minutes navigating noise | `lib/generator.ts` emit paths, `ARCHIVE_INDEX.md` rendering | S |
| E8 | Lifecycle = `BuildReady` when `audit.production-ready && depth-gate-passed` (with `--enforce-depth`); reserve `Blocked` for actual schema-validation failures | W5 memo item 3 — confusing "Blocked" status while content is build-ready | `00_PROJECT_CONTEXT.md` lifecycle banner emitter | S |
| E9 | Normalize trailing punctuation in actor names (`Practice Managers.` → `Practice Managers`) | Cosmetic but pervasive — appears in personas, requirements, schema enum, flow IDs | actor-name normalizer in research extraction or synth output | XS |

## Pass / fail summary against the user's 11 criteria

| # | Criterion | Pass? | One-line |
|---|---|---|---|
| 1 | Researched requirements with back-and-forth | ✅ | Recipe + audit-exit loop are real; depend on calling agent's research execution. |
| 2 | Properly phased with multiple phases | ✅ | 10–14 phases per case, each with entry/exit gate. |
| 3 | Multi-actor due diligence | 🟡 | Personas exist per actor; synth-path content is templated. |
| 4 | Workflows considered properly | 🟡 | Workflow extraction with steps/failures/sources is real; synth produces templated CRUD. |
| 5 | Workflows → UI screens + DB schema | ✅ | Per-screen specs, UX flow diagram, executable PostgreSQL DDL. |
| 6 | Documentation | ✅ | 390–430 files per workspace; meta-file noise still present. |
| 7 | Per-phase gate with exit criteria + retry | ✅ | Orchestrator + per-phase gates; built-app UI gate not yet in orchestrator's command set. |
| 8 | Comprehensive synthetic test data | 🟡 | 4-category samples (happy/alt/negative/boundary); values are templated stubs. |
| 9 | Auto-regression loop | ✅ | `npm run auto-regression` chains build → probe → browser-loop → fix-prompt → iterate. |
| 10 | Autoresearch with quality metrics in loop | ✅ | Audit-exit-criterion + depth-gate enforced; `--enforce-depth` flag, 5/5 tests pass. |
| 11 | Playwright / DevTools actor-impersonating UI validation | ⚠️ | Per-actor flow specs + runner + mock-auth contract — not enforced by orchestrator, optional install in built app, no e2e fixture proving the runner itself works. |

**Score:** 7 ✅, 3 🟡, 1 ⚠️, 0 ❌. The structural shape across all 11 criteria is implemented; the substance differs between synth and agent-recipe paths, and one closed-loop edge (UI failures → research gaps) is missing.

## Next concrete actions, in order

1. **E1 + E2** in one phase (closes the orchestrator-doesn't-enforce-UI hole and proves the runner doesn't rot). Effort: S + M = ~1 day.
2. **E3** in the next phase (closes the missing UI→research edge). Effort: M = ~1 day.
3. **E4 + E5 + E6** as the synth-substance lift. Effort: S+S+M = ~1.5 days. Lifts depth-grade ceiling for harness runs from `moderate` toward `deep` without requiring agent-recipe execution for every harness iteration.
4. **E7 + E8 + E9** as workspace polish (W5 backlog). Effort: S+S+XS = half a day.
