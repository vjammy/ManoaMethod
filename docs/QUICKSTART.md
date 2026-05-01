# Quickstart

A linear 5-minute tour. Each step has a command, what to expect, and what to do next.

## Prerequisites

- Node 20 or newer.
- `npm install` from the repo root.
- `npm run typecheck` to confirm the install is healthy.

## 1. Generate a sample workspace

`create-project` requires research extractions. There are two ways to produce them:

### Option A — agent-driven (recommended for real projects)

Inside your coding agent (Claude Code, Codex, Kimi, OpenCode), follow the recipe in [docs/RESEARCH_RECIPE.md](RESEARCH_RECIPE.md). The agent uses its own LLM context — no API key on this side — to write `<dir>/research/extracted/*.json`. Then:

```bash
npm run create-project -- --input=brief.json --out=.tmp-demo --research-from=<dir>
```

### Option B — synthesizer bridge (for the harness, demos, and CI)

```bash
npx tsx scripts/synthesize-research-ontology.ts --input=examples/family-task-app.json --out=.tmp-demo/research-input
npm run create-project -- --input=examples/family-task-app.json --out=.tmp-demo --research-from=.tmp-demo/research-input
```

The synthesizer is deterministic and free but mechanical — it produces brief-derived extractions that pass the schema, but the depth comes from the brief, not from real domain research. Use it for tests; use Option A for real work.

### Option C — deprecated archetype path

```bash
npm run create-project -- --input=examples/family-task-app.json --out=.tmp-demo --allow-templated
```

Skips research. The manifest is marked `lifecycleStatus: Blocked` and the audit caps the score below 85. Will be removed in Phase A3c.

**You should see:** `Created artifact package at .tmp-demo/mvp-builder-workspace`.

A folder appears at `.tmp-demo/mvp-builder-workspace/` with phase folders, support folders (requirements, architecture, security, integrations, ui-ux), and root-level guides.

## 2. Validate the package

```bash
npm run validate -- --package=.tmp-demo/mvp-builder-workspace
```

**You should see:** `File structure and verification fields are valid. Lifecycle=ReviewReady, phases=12, blockerWarnings=0, currentPhase=1.`

If validation reports issues, regenerate the workspace — do not edit generated files by hand at this stage.

## 3. Check status

```bash
npm run status -- --package=.tmp-demo/mvp-builder-workspace
```

**You should see:** the current phase, lifecycle status, evidence state, and the next recommended action.

## 4. Open these files in order

Inside the generated workspace:

1. `START_HERE.md` — the master entry point.
2. `00_PROJECT_CONTEXT.md` and `01_CONTEXT_RULES.md` — read-first context for any agent.
3. `PROJECT_BRIEF.md` — what is being built and why.
4. `PHASE_PLAN.md` — the phase sequence with `Requirement IDs:` per phase.
5. `SAMPLE_DATA.md` — happy-path and negative-path fixtures per entity, keyed to REQ-IDs.
6. `requirements/ACCEPTANCE_CRITERIA.md` — Given/When/Then per REQ-ID, linked to entity samples.

## 5. Drive a phase with an AI agent

For phase 1, the agent needs:

- `phases/phase-01/PHASE_BRIEF.md`
- `phases/phase-01/ENTRY_GATE.md`
- The matching build prompt: `phases/phase-01/CODEX_BUILD_PROMPT.md` (or `CLAUDE_BUILD_PROMPT.md` / `OPENCODE_BUILD_PROMPT.md`)
- `phases/phase-01/TEST_SCRIPT.md`
- `phases/phase-01/HANDOFF_SUMMARY.md`
- `phases/phase-01/NEXT_PHASE_CONTEXT.md`

See [AGENTS.md](AGENTS.md) for the agent-specific handoff prompts.

## 6. Verify the phase

After the agent finishes:

1. Open `phases/phase-01/VERIFY_PROMPT.md` and follow it.
2. Run or follow `phases/phase-01/TEST_SCRIPT.md`. Each REQ scenario points to `SAMPLE_DATA.md` for inputs.
3. Record results in `phases/phase-01/TEST_RESULTS.md` under `## Final result:` (must become `pass` for the phase's REQ-IDs to count as covered).
4. Fill in `phases/phase-01/VERIFICATION_REPORT.md` with `result`, `recommendation`, and `## evidence files`.

## 7. Advance

```bash
npm run next-phase -- --package=.tmp-demo/mvp-builder-workspace --evidence=phases/phase-01/VERIFICATION_REPORT.md
```

Only advances when result=pass, recommendation=proceed, and evidence files exist on disk.

## 8. After the build, run auto-regression

Once any implementation phase has produced runnable code:

```bash
npm run auto-regression -- --package=.tmp-demo/mvp-builder-workspace
```

This builds the app, runs HTTP probes against `RUNTIME_TARGET.md`, runs every phase's `TEST_SCRIPT.md`, drives Playwright if installed, and produces a 0–100 score. Failing iterations write `evidence/runtime/AUTO_REGRESSION_FIX_PROMPT_iteration-NN.md` and per-phase `phases/phase-NN/REWORK_PROMPT_*.md`.

Full scoring rules are in [AUTO_REGRESSION.md](AUTO_REGRESSION.md).

## What to read next

- [WORKFLOW.md](WORKFLOW.md) — the 9 steps in detail.
- [COMMANDS.md](COMMANDS.md) — every npm command with arguments and outputs.
- [WORKSPACE.md](WORKSPACE.md) — every file in a generated workspace.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — symptom → fix table.
