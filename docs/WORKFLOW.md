# Workflow

MVP Builder is a 9-step pipeline. Steps 1–8 produce a generated workspace. Step 9 (auto-regression) closes the loop by building and scoring the result, then sending failures back into specific phase folders for rework.

This file explains what each step takes in, what it produces, and the next action.

## Step map

```
1. Project Brief         → product idea, audience, scope, must-haves
2. Mode Selection        → beginner|intermediate|advanced × business|technical
3. Business Questions    → north-star, workflow, value, adoption
4. Technical Questions   → boundaries, failure modes, deployment, testability
5. Risk Review           → critique, contradictions, blockers
6. Phase Plan            → 8–14 phases, each with entry/exit gates and REQ-IDs
7. Approval Gate         → human approval and lifecycle transition
8. Export Package        → markdown workspace on disk
9. Auto-Regression Loop  → build → tests → probes → 0–100 score → fix prompts
```

Steps 1–7 currently happen in the Next.js planning UI (`npm run dev`) or by editing an example JSON in `examples/`. Step 8 is `npm run create-project`. Step 9 is `npm run auto-regression`.

## Step 1 — Project Brief

**Input:** the user's rough product description (or an `examples/*.json` file).
**Asserts:** product name, idea, audience, problem statement, must-haves, desired output, and constraints are non-empty.
**Produces:** `PROJECT_BRIEF.md`, `00_PROJECT_CONTEXT.md` once exported.
**Next:** answer mode and questionnaire questions.

## Step 2 — Mode Selection

**Input:** experience level (`beginner|intermediate|advanced`) and track (`business|technical`).
**Asserts:** both fields are set.
**Produces:** the profile that drives wording, depth, and minimum phase count.
**Next:** answer the business and technical questions.

## Step 3 — Business Questions

**Input:** answers to north-star, primary-workflow, customer-pain, business-proof, user-segments, stakeholder-workflow, monetization, adoption-risks.
**Asserts:** required answers present.
**Produces:** content for `BUSINESS_USER_START_HERE.md`, `product-strategy/*`, parts of `requirements/*`.
**Next:** answer the technical questions.

## Step 4 — Technical Questions

**Input:** answers to repo-shape, test-proof, data-boundaries, deployment-guardrails, failure-modes, observability, scaling-risk.
**Asserts:** required answers present.
**Produces:** content for `architecture/*`, `integrations/*`, `security-risk/*`.
**Next:** review the critique and risks.

## Step 5 — Risk Review

**Input:** answers from steps 1–4.
**Produces:** `PLAN_CRITIQUE.md`, contradictions list, blocker warnings, score per category.
**Asserts:** no blocker warnings remain unresolved before approval.
**Next:** review the phase plan.

## Step 6 — Phase Plan

**Produces:** 8–14 phases, each tagged `planning|design|implementation|verification|handoff|finalization`, with:

- `PHASE_BRIEF.md` (goal, scope, evidence expected)
- `ENTRY_GATE.md` and `EXIT_GATE.md`
- `TEST_PLAN.md`, `TEST_SCRIPT.md` (REQ-driven scenarios), `TEST_RESULTS.md`
- `VERIFY_PROMPT.md`, `EVIDENCE_CHECKLIST.md`, `VERIFICATION_REPORT.md`
- `HANDOFF_SUMMARY.md`, `NEXT_PHASE_CONTEXT.md`
- Build prompts for each agent (`CODEX_BUILD_PROMPT.md`, `CLAUDE_BUILD_PROMPT.md`, `OPENCODE_BUILD_PROMPT.md`)

Requirements from `requirements/FUNCTIONAL_REQUIREMENTS.md` are distributed across design and implementation phases. Verification phases own the full set. The `Requirement IDs:` line in `PHASE_PLAN.md` is what `npm run traceability` and `npm run loop:browser` read.

**Next:** approval.

## Step 7 — Approval Gate

**Asserts:** lifecycle is `ReviewReady` (no blockers) before approval is allowed.
**Produces:** the approval record in `00_APPROVAL_GATE.md` and lifecycle transition to `ApprovedForBuild`.
**Lifecycle states:** `Draft → Blocked → ReviewReady → ApprovedForBuild`. Auto-regression rework writes `InRework`.
**Next:** export.

## Step 8 — Export Package

**Command:** `npm run create-project -- --input=<file.json> --out=<dir>`
**Produces:** the full workspace under `<dir>/mvp-builder-workspace/`.

Generated workspace layout:

```
mvp-builder-workspace/
  START_HERE.md, README.md, PROJECT_BRIEF.md, PHASE_PLAN.md
  SAMPLE_DATA.md, RUNTIME_TARGET.md, BUILD_TARGET.md
  TESTING_STRATEGY.md, REGRESSION_TEST_PLAN.md, TEST_SCRIPT_INDEX.md
  CODEX_*, CLAUDE_*, OPENCODE_* (start + handoff prompts)
  product-strategy/, requirements/, security-risk/, integrations/, architecture/
  ui-ux/, recursive-test/, auto-improve/
  phases/phase-01/ ... phase-NN/
  gates/gate-NN-entry.md, gates/gate-NN-exit.md
  regression-suite/
  repo/manifest.json, repo/mvp-builder-state.json, repo/input.json
```

Validate, status-check, and walk phase-by-phase using:

```bash
npm run validate -- --package=<workspace>
npm run status -- --package=<workspace>
npm run next-phase -- --package=<workspace> --evidence=phases/phase-01/VERIFICATION_REPORT.md
```

**Next:** drive each phase with an AI agent. See [AGENTS.md](AGENTS.md).

## Step 9 — Auto-Regression Loop

**Command:** `npm run auto-regression -- --package=<workspace>`

Each iteration:

1. **Build** (`npm run build` by default; override with `--build-command`). Failure stops the iteration with score 0 and writes a fix prompt.
2. **HTTP loop** (`npm run loop`): spawns the runtime, hits routes from `RUNTIME_TARGET.md`, runs every phase's `TEST_SCRIPT.md` bash block.
3. **Browser loop** (`npm run loop:browser`): if Playwright is installed, drives chromium against the runtime, walks every REQ-ID in `requirements/ACCEPTANCE_CRITERIA.md`, checks `SAMPLE_DATA.md` tokens render, captures screenshots and console errors.
4. **Combined score**: average of the HTTP loop score (0–100) and the browser loop score (0–100). If Playwright isn't available, only the HTTP score is used.
5. **Fix prompts**: every failing iteration writes `evidence/runtime/AUTO_REGRESSION_FIX_PROMPT_iteration-NN.md` (overall) and `phases/phase-NN/REWORK_PROMPT_auto-regression-iteration-NN_attempt-MM.md` per affected phase.
6. **State rollback** when the loop exits without converging (stalled or max-iterations): `repo/mvp-builder-state.json` is updated to `lifecycleStatus: InRework`, `currentPhase` rolls back to the earliest failing phase, and that phase's `phaseEvidence.attempts` records the failure.

Score formulas, REQ status rules, and worked examples are in [AUTO_REGRESSION.md](AUTO_REGRESSION.md).

## Lifecycle states summary

| State | Meaning | How you exit it |
|---|---|---|
| `Draft` | Brief and questionnaire incomplete | Fill required fields |
| `Blocked` | Blocker warning unresolved | Fix the blocker |
| `ReviewReady` | Eligible for human approval | Approve via `00_APPROVAL_GATE.md` |
| `ApprovedForBuild` | Build can proceed | Begin phases |
| `InRework` | Auto-regression rolled state back | Fix per `REWORK_PROMPT_*.md`, then re-run auto-regression |

## What to read next

- [COMMANDS.md](COMMANDS.md) — every npm command in detail.
- [AUTO_REGRESSION.md](AUTO_REGRESSION.md) — scoring formulas and the rework loop.
- [WORKSPACE.md](WORKSPACE.md) — what every generated file is for.
