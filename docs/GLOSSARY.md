# Glossary

Alphabetical reference for terms used across the docs and generated workspaces.

## Acceptance criteria
The Given/When/Then statements per requirement. Lives in `requirements/ACCEPTANCE_CRITERIA.md`. Each criterion is tagged with a REQ-ID and references an entity in `SAMPLE_DATA.md`.

## Auto-regression
The step-9 loop that builds the app, runs tests, drives a browser, and produces a 0–100 score. Failing iterations write fix prompts and roll state back to the earliest failing phase. See [AUTO_REGRESSION.md](AUTO_REGRESSION.md).

## Browser loop
`npm run loop:browser`. Playwright-driven probe that scores requirement coverage (max 70) plus probe (max 30).

## Build target
Declared in `BUILD_TARGET.md`. One of: planning package only, runnable MVP, full production application.

## Combined score
Auto-regression's headline number. Average of the HTTP loop score and the browser loop score, or just the HTTP score when Playwright is unavailable.

## Convergence
Auto-regression iteration outcome where combined score ≥ target. Only convergence exits zero.

## Coverage status
Per-REQ classification by the browser loop: `covered`, `partially-covered`, or `uncovered`. See [AUTO_REGRESSION.md](AUTO_REGRESSION.md).

## Entry gate
The conditions that must be true before a phase can start. Lives in `phases/phase-NN/ENTRY_GATE.md` and `gates/gate-NN-entry.md`.

## Evidence
Concrete proof a phase or scenario is done: changed files, command output, screenshots, recorded observations. Generic prose ("looks good") is rejected by the validator.

## Exit gate
The conditions that must be true before a phase can close. Lives in `phases/phase-NN/EXIT_GATE.md` and `gates/gate-NN-exit.md`.

## Fix prompt
Markdown punch list written by a failing loop iteration. Two flavors:

- `evidence/runtime/AUTO_REGRESSION_FIX_PROMPT_iteration-NN.md` — combined.
- `phases/phase-NN/REWORK_PROMPT_auto-regression-iteration-NN_attempt-MM.md` — per affected phase.

## HTTP loop
`npm run loop`. Combines `npm run probe` (HTTP smoke) and `npm run test-scripts` (TEST_SCRIPT.md bash) into a 0–100 score. Probe ×50 + step pass rate ×50.

## Lifecycle status
The package's overall state. Stored in `repo/mvp-builder-state.json` and mirrored to `repo/manifest.json`. Values:

| State | Meaning |
|---|---|
| `Draft` | Brief and questionnaire incomplete |
| `Blocked` | Blocker warning unresolved |
| `ReviewReady` | Eligible for human approval |
| `ApprovedForBuild` | Build can proceed |
| `InRework` | Auto-regression rolled state back |

## Manifest
`repo/manifest.json`. Lightweight metadata about the package: profile, score, lifecycle, phase count, supported agents.

## Mode
The combination of experience level (`beginner|intermediate|advanced`) and track (`business|technical`). Drives wording, depth, and minimum phase count.

## Phase
One unit of work in the build. Each phase has its own folder under `phases/phase-NN/` with brief, gates, test files, and handoff. Phases are typed: `planning`, `design`, `implementation`, `verification`, `handoff`, `finalization`.

## Phase plan
`PHASE_PLAN.md`. Lists every phase with goal, type, gates, and `Requirement IDs:`. Driven by `npm run traceability`.

## Probe
`npm run probe`. Spawns the runtime and hits each smoke route from `RUNTIME_TARGET.md`. The HTTP-only sub-step of the loop.

## Profile
A `<level>-<track>` configuration in `templates/`. Determines the language style and depth of generated content.

## REQ-ID
An identifier like `REQ-1`, `REQ-2`. Numbered requirements from `requirements/FUNCTIONAL_REQUIREMENTS.md`. Mapped to phases via `Requirement IDs:` lines in `PHASE_PLAN.md`. Used by traceability and the browser loop.

## Requirement coverage
Browser loop output: `covered + 0.5 × partially-covered) / total`. Drives 70 of the 100 browser loop points.

## Rework
The mechanism for reopening a failed phase. Triggered by `npm run rework` manually or auto-regression on a failed loop. Writes a `REWORK_PROMPT_*.md` and sets `lifecycleStatus: InRework`.

## Runtime target
`RUNTIME_TARGET.md`. The contract that says how to start the app, what URL to hit, and which routes count as smoke. Consumed by probe, HTTP loop, and browser loop.

## Sample data
`SAMPLE_DATA.md`. Central fixtures keyed by entity, with happy-path and negative-path JSON samples. Referenced by `TEST_SCRIPT.md` and `requirements/ACCEPTANCE_CRITERIA.md`.

## Scorecard
`SCORECARD.md` inside a generated workspace. Planning-readiness score (0–100) from `lib/scoring.ts`. Different from the auto-regression build-correctness score.

## State
`repo/mvp-builder-state.json`. Tracks `currentPhase`, `lifecycleStatus`, `completedPhases`, `blockedPhases`, and `phaseEvidence`.

## Step
One of the 9 stages in [WORKFLOW.md](WORKFLOW.md). Steps 1–7 are planning, step 8 is export, step 9 is auto-regression.

## TEST_RESULTS verified
A REQ is "TEST_RESULTS verified" when its phase's `TEST_RESULTS.md` shows `## Final result: pass` with a `Scenario evidence: REQ-N` block. Required for browser loop `covered` status.

## Traceability
`npm run traceability`. Builds `repo/TRACEABILITY.md` mapping REQ-IDs to owning phases, attempts, and recommendations.

## Verification report
`phases/phase-NN/VERIFICATION_REPORT.md`. Records `result`, `recommendation`, and `evidence files` for the phase. Required input to `npm run next-phase`.
