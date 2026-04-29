# Generated Workspace

What every file in `<out>/mvp-builder-workspace/` is for. Use this as a map when an agent or human asks "where is X?".

## Read-first files

These six files are what the user (or an agent in a fresh session) should open before doing anything else:

1. **`START_HERE.md`** — master entry point. Explains what to read in what order.
2. **`00_PROJECT_CONTEXT.md`** — the brief and constraints, in plain English.
3. **`01_CONTEXT_RULES.md`** — operating rules every agent must follow.
4. **`PROJECT_BRIEF.md`** — full product brief, audience, scope, risks.
5. **`PHASE_PLAN.md`** — phase sequence with `Requirement IDs:` per phase.
6. **`SAMPLE_DATA.md`** — happy-path + negative-path JSON fixtures per entity.

## Lifecycle and approval

- **`00_APPROVAL_GATE.md`** — human approval record. Required before lifecycle reaches `ApprovedForBuild`.
- **`HANDOFF.md`** — top-level package handoff for the next builder.
- **`CURRENT_STATUS.md`** — current stage, gate, and next action in plain English.
- **`SCORECARD.md`** — generator's planning-readiness score (0–100, separate from auto-regression).

## Beginner-facing guides

- **`BUSINESS_USER_START_HERE.md`** — non-technical entry into the package.
- **`MODULE_MAP.md`** — which support folders are required vs optional.
- **`COPY_PASTE_PROMPTS.md`** — ready-to-use prompts for each Decide/Plan/Design/Build/Test/Handoff stage.
- **`STEP_BY_STEP_BUILD_GUIDE.md`** — six-stage walkthrough.
- **`WHAT_TO_IGNORE_FOR_NOW.md`** — folders you do not need to open yet.
- **`FINAL_CHECKLIST.md`** — pre-ship checklist.
- **`QUICKSTART.md`**, **`TROUBLESHOOTING.md`** — quick reference.

## Agent entry points

Per agent, two files at the workspace root:

| Agent | Start file | Handoff prompt |
|---|---|---|
| Codex | `CODEX_START_HERE.md` | `CODEX_HANDOFF_PROMPT.md` |
| Claude Code | `CLAUDE_START_HERE.md` | `CLAUDE_HANDOFF_PROMPT.md` |
| OpenCode | `OPENCODE_START_HERE.md` | `OPENCODE_HANDOFF_PROMPT.md` |

Plus shared:

- **`AGENTS.md`** — Core Agent Operating Rules.
- **`02_HOW_TO_USE_WITH_CODEX.md`**, **`03_HOW_TO_USE_WITH_CLAUDE_CODE.md`**, **`04_HOW_TO_USE_WITH_OPENCODE.md`**.

## Production / build target

- **`BUILD_TARGET.md`** — planning-only vs runnable MVP vs full production. Set the target before approval.
- **`PRODUCTION_SCOPE.md`** — what production means for this project.
- **`DEPLOYMENT_PLAN.md`**, **`ENVIRONMENT_SETUP.md`** — deployment specifics.
- **`PRODUCTION_READINESS_CHECKLIST.md`** — pre-prod gate checklist.
- **`OPERATIONS_RUNBOOK.md`**, **`INCIDENT_RESPONSE_GUIDE.md`**, **`ROLLBACK_PLAN.md`** — operational guidance.
- **`SECURITY_REVIEW.md`**, **`PERFORMANCE_PLAN.md`** — quality-of-service plans.
- **`RELEASE_CHECKLIST.md`**, **`PRODUCTION_GATE.md`** — release-time gates.

The `FINAL_*` files are end-of-build records:

- `FINAL_RELEASE_REPORT.md`, `FINAL_HANDOFF.md`, `FINAL_GATE_REPORT.md`, `FINAL_SCORECARD.md`, `FINAL_RECOVERY_SUMMARY.md`, `FINAL_DEPLOYMENT_STATUS.md`.

These start as templates and get filled in as the build progresses.

## Runtime + browser automation

- **`RUNTIME_TARGET.md`** — start command, base URL, port, smoke routes. The contract that `npm run probe`, `npm run loop`, and `npm run loop:browser` all consume.
- **`BROWSER_AUTOMATION_GUIDE.md`** — Chrome DevTools MCP and Playwright instructions for the agent driving the running app.

## Testing

- **`TESTING_STRATEGY.md`** — what testing means for this project.
- **`REGRESSION_TEST_PLAN.md`** — project-wide regression checklist.
- **`TEST_SCRIPT_INDEX.md`** — index of every phase test script with REQ-IDs and gate references.
- **`regression-suite/`** — manual markdown-driven regression checks plus `scripts/run-regression.ts`.

## Per-phase folders (`phases/phase-NN/`)

Every phase has:

| File | Purpose |
|---|---|
| `PHASE_BRIEF.md` | Goal, scope, evidence expected |
| `ENTRY_GATE.md` | When the phase can start |
| `EXIT_GATE.md` | When the phase can close |
| `CODEX_BUILD_PROMPT.md`, `CLAUDE_BUILD_PROMPT.md`, `OPENCODE_BUILD_PROMPT.md` | Per-agent build prompts |
| `TEST_PLAN.md` | Testing scenarios for this phase |
| `TEST_SCRIPT.md` | Concrete steps + REQ-driven scenarios + executable bash block (varies by phase type) |
| `TEST_RESULTS.md` | Where evidence goes (defaults to `## Final result: pending`) |
| `VERIFY_PROMPT.md` | Reviewer prompt to fill the verification report |
| `EVIDENCE_CHECKLIST.md` | What evidence the phase must produce |
| `VERIFICATION_REPORT.md` | result + recommendation + evidence files |
| `HANDOFF_SUMMARY.md` | Summary for the next phase or builder |
| `NEXT_PHASE_CONTEXT.md` | What the next phase should inherit |
| `REWORK_PROMPT_*.md` | Created when a phase fails (manual rework or auto-regression) |

## Gates (`gates/`)

- `gate-NN-entry.md`, `gate-NN-exit.md` — short checklist views matching each phase's entry and exit criteria.

## Support folders

| Folder | What it covers |
|---|---|
| `product-strategy/` | North star, target users, MVP scope, out-of-scope, success metrics, tradeoffs, gate |
| `requirements/` | Functional, non-functional, acceptance criteria (with REQ-IDs and SAMPLE_DATA links), open questions, risk review, gate |
| `security-risk/` | Data classification, secret management, privacy review, authorization, dependency risk, gate |
| `integrations/` | External services, API keys, env vars, webhooks, failure modes, mocking strategy, integration test plan, gate |
| `architecture/` | System overview, data model (with sample records), API contracts, state management, decisions, gate |
| `ui-ux/` | User workflows, screen inventory, screenshot review prompt, accessibility, responsive checklists, gate |
| `recursive-test/` | Quality-improvement loop prompts, scoring rubric, iteration log, regression recheck, final quality gate |
| `auto-improve/` | Editor-loop program, quality rubric, scorecard, run loop, results.tsv |

## Repo state files

- **`repo/manifest.json`** — package metadata, lifecycle, phase count, supported agents.
- **`repo/mvp-builder-state.json`** — current phase, lifecycle status, completed/blocked phases, phaseEvidence.
- **`repo/input.json`** — the original input that generated this workspace.
- **`repo/TRACEABILITY.md`** — generated by `npm run traceability`.
- **`repo/mvp-builder-loop-state.json`** — last `npm run loop` run.
- **`repo/mvp-builder-loop-browser-state.json`** — last `npm run loop:browser` run.
- **`repo/mvp-builder-auto-regression-state.json`** — every iteration of every auto-regression run.

## Evidence (`evidence/runtime/`)

Created on first loop run:

- `probe-<timestamp>.md` — HTTP probe output.
- `test-scripts-<timestamp>.md` — TEST_SCRIPT.md command results.
- `last-test-scripts.json` — most recent test-scripts run, summary form.
- `browser/<timestamp>/BROWSER_LOOP_REPORT.md` — Playwright run, per-REQ table, screenshots.
- `LOOP_FIX_PROMPT_iteration-NN.md` — HTTP loop punch list per failing iteration.
- `AUTO_REGRESSION_FIX_PROMPT_iteration-NN.md` — combined punch list per failing iteration.

## Files that should never be edited by hand

- Anything in `repo/` (state and manifest).
- `evidence/runtime/*` after a loop run — these are the audit trail.
- The fenced bash block inside any `TEST_SCRIPT.md` should only be extended (more deterministic checks), never relaxed to make the loop pass.

## Files that get appended to during the build

- `phases/phase-NN/TEST_RESULTS.md` — gets a "Scenario evidence: REQ-N" block per recorded run, plus an "Auto-regression failures" section if the loop fails.
- `phases/phase-NN/VERIFICATION_REPORT.md` — the human/agent fills this in per phase.
- `regression-suite/REGRESSION_RESULTS_TEMPLATE.md` — fills in as regression runs happen.
- The `FINAL_*` files — fill in at end of build.
