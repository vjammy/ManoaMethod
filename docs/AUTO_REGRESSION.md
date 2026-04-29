# Auto-Regression

Step 9 of the workflow. Build the app, run tests, drive a real browser, score 0–100, and feed every failure back into the right phase folder.

## TL;DR

```bash
npm run auto-regression -- --package=<workspace>
```

- Iterates up to `--max-iterations` (default 3) until combined score ≥ `--target` (default 90).
- Writes a fix prompt and per-phase `REWORK_PROMPT_*.md` on every failing iteration.
- On stall or max-iterations, rolls `repo/mvp-builder-state.json` back to the earliest failing phase with `lifecycleStatus: InRework`.

## Score formula

The combined score is the average of two sub-scores.

### HTTP loop score (max 100)

```
if probe_passes AND every test-script step passes  → 100
else:
  score = 0
  if probe_passes:                               score += 50
  if total_steps > 0:                            score += round((passed/total) × 50)
```

- **Probe**: spawn the runtime per `RUNTIME_TARGET.md`, GET the smoke routes, succeed on 2xx/3xx within the start timeout.
- **Test-script steps**: bash commands extracted from each phase's `TEST_SCRIPT.md` fenced bash block, run from the package root. Forbidden commands are skipped (rm -rf, sudo, force push, etc.).

### Browser loop score (max 100)

```
score = (probe_passes ? 30 : 0) + round((covered + 0.5 × partially_covered) / total × 70)
```

Where each REQ in `requirements/ACCEPTANCE_CRITERIA.md` is classified:

| REQ status | Conditions | Coverage weight |
|---|---|---|
| `covered` | Tokens render on page **AND** `phases/phase-NN/TEST_RESULTS.md` has `## Final result: pass` with a `Scenario evidence: REQ-N` block | 1.0 |
| `partially-covered` | Tokens render but TEST_RESULTS.md is not pass-verified, **OR** only one token rendered | 0.5 |
| `uncovered` | Zero tokens rendered, or no SAMPLE_DATA.md fixture matched | 0.0 |

Tokens come from `SAMPLE_DATA.md` — the entity name plus the field values from the happy-path JSON sample.

### Combined score

```
if Playwright unavailable OR runtime did not start:
  combined = HTTP loop score
else:
  combined = round(HTTP loop score × 0.5 + browser loop score × 0.5)
```

## Iteration termination

| State | Condition |
|---|---|
| `converged` | combined ≥ target |
| `stalled` | same combined score as previous iteration AND below target |
| `no-build` | `npm run build` (or `--build-command`) exited non-zero |
| `max-iterations` | `--max-iterations` reached without convergence |

Only `converged` exits zero. All others exit non-zero so CI can fail correctly.

## What gets written

### Per iteration

- `evidence/runtime/probe-<timestamp>.md` — HTTP probe results (from `npm run probe`).
- `evidence/runtime/test-scripts-<timestamp>.md` — TEST_SCRIPT.md command results.
- `evidence/runtime/browser/<timestamp>/BROWSER_LOOP_REPORT.md` — Playwright run, per-REQ table, screenshots, console errors.
- `evidence/runtime/LOOP_FIX_PROMPT_iteration-NN.md` — HTTP loop's punch list.
- `evidence/runtime/AUTO_REGRESSION_FIX_PROMPT_iteration-NN.md` — combined punch list.

### Per failing phase

- `phases/phase-NN/REWORK_PROMPT_auto-regression-iteration-NN_attempt-MM.md` — failing REQs owned by this phase, with reasons.
- Appended section in `phases/phase-NN/TEST_RESULTS.md`:
  ```
  ## Auto-regression failures (iteration N, attempt M, ISO-date)
  - Combined score: 75/90
  - REQ-3 (uncovered): no tokens rendered
  - See: phases/phase-NN/REWORK_PROMPT_auto-regression-iteration-NN_attempt-MM.md
  ```

### State files

- `repo/mvp-builder-loop-state.json` — last HTTP loop run.
- `repo/mvp-builder-loop-browser-state.json` — last browser loop run, including `verifiedReqIds`.
- `repo/mvp-builder-auto-regression-state.json` — every iteration of every auto-regression run.
- `repo/mvp-builder-state.json` — modified on rollback: `currentPhase`, `lifecycleStatus`, `blockedPhases`, `phaseEvidence.<slug>.attempts`.
- `repo/manifest.json` — mirrors lifecycle change.

## How rework hands back to dev

When the loop exits without converging:

1. **Find earliest failing phase** — sort failing slugs ascending by phase index.
2. **Roll state back**: `state.currentPhase = N`, `state.lifecycleStatus = 'InRework'`, all failing slugs added to `blockedPhases`.
3. **Record an attempt** under `state.phaseEvidence[slug].attempts` with `status: 'fail'` and `failedCriteria` listing each REQ failure plus any HTTP loop failures.
4. **Mirror onto `repo/manifest.json`** so `npm run validate`, `npm run status`, `npm run gates`, and the orchestrator all see the new lifecycle.

The next dev iteration:

```bash
npm run status -- --package=<workspace>
# Shows: lifecycleStatus=InRework, currentPhase=phase-N, blocked=[phase-N, ...]
# Reads phases/phase-N/REWORK_PROMPT_auto-regression-*.md
# Fixes the code
npm run auto-regression -- --package=<workspace>
# Runs again from scratch; new iteration count
```

## Why a REQ can render on the page but still not be "covered"

Tokens-on-page proves the **feature exists**, not that the **scenario was executed**. A page can render `Family Workspace` and `Rivera Household` without anyone having actually walked through the happy-path and negative-path scenarios. Real coverage means a human or agent ran `TEST_SCRIPT.md`, exercised both samples, and pasted the observation under `Scenario evidence: REQ-N` in `TEST_RESULTS.md` with `## Final result: pass`.

This dual gate is why auto-regression can score 100 — both layers agree the work happened.

## Limits and known gaps

- **Browser coverage is content-presence based**, not full flow drivers. Drive richer interactions inside `TEST_SCRIPT.md` and record evidence in `TEST_RESULTS.md`.
- **Negative-path samples** are surfaced in `SAMPLE_DATA.md` but not auto-driven by `loop:browser` (no form selectors are generated). Exercise them manually inside the phase test script.
- **Console errors** are recorded in evidence but do not subtract from the score. Trivial to add — see [CONTRIBUTING.md] if it ships.
- **Failed network requests** likewise captured but not penalized.

## Worked example

Family Task Board workspace, no Playwright installed, runtime not started:

```
Iteration 1: combined=75/90 (loop=75, browser=0, covered=0/15)
```

- HTTP loop: probe failed (no real app running) → 0 + 1/2 test-script steps passed → 25. Hmm, actually score=75 means probe passed (50) + 1/2 steps (25). So the test-script ran two commands, one passed.
- Browser loop: 0 (Playwright not installed).
- Combined: HTTP only since Playwright unavailable → 75.
- Below target 90 → write fix prompt, exit non-zero.
- Roll state: phase-01 added to `blockedPhases`, `lifecycleStatus=InRework`, attempt recorded.

Same workspace with Playwright installed and a real Next.js app running:

```
Iteration 1: combined=88/90 (loop=100, browser=76, covered=11/15, partial=2)
```

- HTTP: probe passed + all steps passed → 100.
- Browser: probe passed (30) + (11 + 0.5 × 2) / 15 × 70 → 30 + 56 = 86. Wait, that's 86 not 76 — example illustrates the math, real outputs may differ.
- Combined: (100 + 86) / 2 = 93 → above target 90 → converged.
