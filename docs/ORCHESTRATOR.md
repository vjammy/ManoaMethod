# Orchestrator

The orchestrator is the **static-analysis** scorer. It reads the repo (or a generated workspace), runs gate checks, executes the required commands (build/test/smoke/validate), and produces a 0–100 score with hard caps.

This is **different from auto-regression**:

- **Orchestrator** scores documentation, gates, evidence presence, command outputs. It's good for "is the package coherent and well-formed?".
- **Auto-regression** scores actual app behavior — does it build, do routes respond, do requirements render in a real browser. See [AUTO_REGRESSION.md](AUTO_REGRESSION.md).

Use both. Orchestrator catches structural problems early; auto-regression catches behavioral problems.

## Commands

```bash
npm run orchestrate                  # full run, executes commands
npm run orchestrate:dry-run          # static inspection only, no command execution
npm run score                        # just the score portion
npm run gates                        # just the gate-check portion
npm run recover                      # generate a RECOVERY_PLAN from latest results
```

All commands accept `--package=<workspace>` to operate on a generated workspace, or omit it to operate on the repo itself.

## Where output goes

`orchestrator/reports/`:

- `OBJECTIVE_CRITERIA.md` — what this run is evaluating against.
- `GATE_RESULTS.md` — pass/fail for each of: entry, implementation, test, regression, evidence, security, release, exit.
- `OBJECTIVE_SCORECARD.md` — the 0–100 breakdown by category, plus active hard caps.
- `FINAL_ORCHESTRATOR_REPORT.md` — combined view + verdict.
- `RECOVERY_PLAN.md` — what to fix to improve the score.
- `NEXT_AGENT_PROMPT.md` — handoff prompt for the next agent.

## Score categories (max points)

| Category | Max | What it measures |
|---|---|---|
| Objective fit | 20 | Project intent recoverable from markdown; core docs present |
| Functional correctness | 15 | Required commands ran and passed |
| Test and regression coverage | 15 | smoke, test, regression suite present and passing |
| Gate enforcement | 15 | Every gate passes |
| Artifact usefulness | 10 | Concrete reports + verification records |
| Beginner usability | 10 | Start-here guidance + plain-English prose |
| Handoff/recovery quality | 10 | Phase handoffs + next-context + recovery files |
| Local-first compliance | 5 | Repo emphasizes local-first, markdown-first behavior |

## Hard caps

If any cap is triggered, total score is clamped to the lowest active cap.

| Reason | Max |
|---|---|
| Tests were not run | 79 |
| Build fails | 69 |
| Verification claims pass but body says blocked/fail | 59 |
| Generated artifacts are mostly generic templates | 74 |
| Phase gates are bypassed | 69 |
| Fake evidence is present | 49 |
| Repo cannot build at all | 60 |
| A phase has more than 3 rework attempts | 79 |
| Requirement bodies are duplicated boilerplate | 74 |

The cap that's active appears in `OBJECTIVE_SCORECARD.md` under `capReason`.

## Verdicts

| Verdict | Condition |
|---|---|
| `PASS` | No failed gates, capped total ≥ 90 |
| `CONDITIONAL PASS` | No failed gates, capped total 80–89 |
| `NEEDS FIXES` | No failed gates, capped total 60–79 |
| `FAIL` | Any failed gate, OR capped total < 60 |

## Dry-run mode

```bash
npm run orchestrate:dry-run
```

Inspects structure and writes reports but does not execute the build/test commands. Useful for:

- CI gating where you only want a structural check.
- Diagnosing a gate failure before committing to a full run.
- Scoring a workspace on a machine without the build toolchain.

A dry-run is intentionally capped below 79 because tests were not run.

## Pairing with auto-regression

Typical CI pattern:

```bash
npm run orchestrate:dry-run --package=$WORKSPACE   # cheap structural check
npm run auto-regression --package=$WORKSPACE       # behavioral check, builds app
npm run orchestrate --package=$WORKSPACE           # full scorecard with gate enforcement
```

Auto-regression failures roll state back to specific phases. Orchestrator failures point at structural issues that auto-regression can't see (missing handoffs, contradictions in verification reports, etc.).

## When to use which command

| Need | Command |
|---|---|
| Score the structure | `npm run score` |
| Check just the gates | `npm run gates` |
| Get a recovery plan | `npm run recover` |
| Inspect without running anything | `npm run orchestrate:dry-run` |
| Full workspace check + score | `npm run orchestrate` |
| Score actual app behavior | `npm run auto-regression` (see [AUTO_REGRESSION.md](AUTO_REGRESSION.md)) |

## Limits

- The orchestrator does not drive a running app. That's what `npm run probe` and `npm run loop:browser` are for (consumed by auto-regression).
- Score weights are hard-coded in `lib/orchestrator/score.ts`. Tune there if you need different priorities.
- Hard cap rules are heuristics; review the active `capReason` rather than blindly trusting the number.
