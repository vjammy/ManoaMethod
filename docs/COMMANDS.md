# Commands

Every `npm run` command, what it does, the args it accepts, where it writes, and when to use it.

## Repo health

### `npm install`
Installs the repo's TypeScript build deps (Next.js, jszip, tsx). Required before any other command.

### `npm run typecheck`
Runs `tsc --noEmit`. Use after editing any TS file under `lib/` or `scripts/`.

### `npm run build`
Runs `next build`. Required only if you're working on the planning UI under `app/`.

### `npm run dev`
Starts the Next.js planning UI on `http://localhost:3000`. Optional — most users drive everything through `create-project`.

### `npm run smoke` and `npm test`
End-to-end test that exercises the generator against multiple example projects. Long-running (30+ seconds).

### `npm run test:quality-regression`
Heavier swarm test that generates and validates 10 example projects. Use when changing the generator.

## Workspace generation (step 8)

### `npm run create-project`
Generates a markdown workspace from a project input.

```bash
npm run create-project -- --input=<file.json> --out=<dir> [--zip=true]
```

- `--input` — path to a JSON file matching `ProjectInput` (see `examples/family-task-app.json`).
- `--out` — output directory; the workspace is created at `<out>/mvp-builder-workspace/`.
- `--zip=true` — also produce `<out>/mvp-builder-workspace.zip`.

Default input: `lib/templates.ts > baseProjectInput()` (a generic placeholder).

### `npm run validate`
Confirms a generated workspace's structure, required files, and verification fields.

```bash
npm run validate -- --package=<workspace>
```

Exits non-zero on any structural issue. Run after every regeneration and after manual phase edits.

### `npm run status`
Prints the current phase, lifecycle status, evidence state, and the next recommended action.

```bash
npm run status -- --package=<workspace>
```

### `npm run next-phase`
Advances `currentPhase` after verifying the active phase passed.

```bash
npm run next-phase -- --package=<workspace> --evidence=phases/phase-NN/VERIFICATION_REPORT.md [--handoff="note"]
```

Refuses to advance unless `result=pass`, `recommendation=proceed`, and at least one referenced evidence file exists on disk.

### `npm run rework`
Marks the current phase as failed and produces a rework prompt.

```bash
npm run rework -- --package=<workspace> [--evidence=phases/phase-NN/VERIFICATION_REPORT.md]
```

Sets `lifecycleStatus: InRework`, adds the slug to `blockedPhases`, writes `phases/phase-NN/REWORK_PROMPT_attempt-MM.md`. Auto-regression performs the same rollback automatically when its loop fails.

### `npm run traceability`
Builds the requirement-to-phase matrix.

```bash
npm run traceability -- --package=<workspace>
```

Reads `Requirement IDs:` lines from `PHASE_PLAN.md` and `## Requirement N:` headings from `requirements/FUNCTIONAL_REQUIREMENTS.md`. Writes `repo/TRACEABILITY.md`.

## Verification loops (step 9)

### `npm run probe`
HTTP probe only. Spawns the runtime per `RUNTIME_TARGET.md`, hits each smoke route, captures status + body snippet.

```bash
npm run probe -- --package=<workspace>
```

Writes `evidence/runtime/probe-<timestamp>.md`.

### `npm run test-scripts`
Runs the bash blocks inside every phase's `TEST_SCRIPT.md`.

```bash
npm run test-scripts -- --package=<workspace> [--phase=phase-NN] [--dry-run=true]
```

Forbidden commands (rm -rf, sudo, force push, etc.) are skipped. Writes `evidence/runtime/test-scripts-<timestamp>.md`.

### `npm run loop`
The HTTP convergence loop. Combines `probe` + `test-scripts` into one 0–100 score per iteration.

```bash
npm run loop -- --package=<workspace> [--target=90] [--max-iterations=5]
```

Score = `probe_passes ? 50 : 0` + `(passed_steps / total_steps) × 50`. Writes per-iteration fix prompts to `evidence/runtime/LOOP_FIX_PROMPT_iteration-NN.md` and persists state in `repo/mvp-builder-loop-state.json`.

### `npm run loop:browser`
Playwright-driven requirement coverage probe.

```bash
npm run loop:browser -- --package=<workspace> [--target=90]
```

Score = `probe_passes ? 30 : 0` + `(covered + 0.5 × partial) / total × 70`. A REQ counts as `covered` only when its sample tokens render AND the owning phase's `TEST_RESULTS.md` shows `## Final result: pass` with a `Scenario evidence: REQ-N` block. Writes `evidence/runtime/browser/<timestamp>/BROWSER_LOOP_REPORT.md` and per-REQ screenshots.

Playwright is loaded via dynamic import; if not installed the score reflects probe-only and the report includes the install hint:

```bash
npm install --save-dev playwright
npx playwright install chromium
```

### `npm run auto-regression`
The full step-9 loop: build → loop → loop:browser → combined score.

```bash
npm run auto-regression -- --package=<workspace> [--target=90] [--max-iterations=3] [--build-command="npm run build"] [--skip-browser=true]
```

Combined score = average of HTTP loop and browser loop when Playwright is available; otherwise HTTP loop only. Writes per-iteration `evidence/runtime/AUTO_REGRESSION_FIX_PROMPT_iteration-NN.md` and per-failing-phase `phases/phase-NN/REWORK_PROMPT_auto-regression-iteration-NN_attempt-MM.md`. On stall or max-iterations, rolls `repo/mvp-builder-state.json` back to the earliest failing phase. Persists state in `repo/mvp-builder-auto-regression-state.json`. Full scoring spec: [AUTO_REGRESSION.md](AUTO_REGRESSION.md).

## Orchestrator (static analysis)

### `npm run orchestrate`
Reads the repo, derives objective criteria, runs gate checks, and produces a 0–100 score with hard caps.

```bash
npm run orchestrate [-- --package=<workspace>] [--target-score=95] [--max-rounds=5]
```

Writes `orchestrator/reports/{OBJECTIVE_CRITERIA,GATE_RESULTS,OBJECTIVE_SCORECARD,FINAL_ORCHESTRATOR_REPORT,RECOVERY_PLAN,NEXT_AGENT_PROMPT}.md`.

### `npm run orchestrate:dry-run`
Same as above with `--dry-run=true`. Inspects structure but does not execute build/test commands.

### `npm run score`
Just the scoring portion of orchestrate. Useful for CI gating.

### `npm run gates`
Just the gate checks portion of orchestrate.

### `npm run recover`
Generates a `RECOVERY_PLAN.md` based on the latest scorecard and gate results.

## Multi-project / advanced

### `npm run swarm:build-10`, `swarm:score`, `swarm:gates`, `swarm:report`
Generates and scores 10 sample projects in one run. Used for regression-testing the generator itself.

### `npm run autoresearch`
Runs the autoresearch program against the repo. See `autoresearch/MVP_BUILDER_AUTORESEARCH_PROGRAM.md`.

### `npm run finalize:release`
Repository finalization helper. See `scripts/mvp-builder-finalize-repo-release.ts`.

### `npm run mvp-builder`
Combined CLI entry that exposes the most common operations under one command. See `scripts/mvp-builder-cli.ts`.

## When to use which

| Situation | Run |
|---|---|
| New project | `create-project`, then `validate`, `status` |
| After phase work | `validate`, then `next-phase` |
| Phase failed | `rework` (or let `auto-regression` do it) |
| Want a 0–100 build score | `auto-regression` |
| Just want HTTP routes checked | `probe` |
| Want browser-driven REQ coverage | `loop:browser` |
| Want a static-analysis score | `orchestrate` or `score` |
| Investigating a CI failure | `validate`, then `gates`, then `score` |
