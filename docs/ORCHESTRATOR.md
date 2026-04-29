# Xelera Orchestrator

Xelera Orchestrator is the local-first run loop for generated Xelera workspaces and repos.

It reads the repo and package docs, derives objective criteria, writes prompt packets for focused agents, runs local commands, enforces entry/build/evidence/exit gates, scores the result from 0 to 100, and writes recovery plans when a gate fails.

## What It Does Not Do

- It does not call hosted agent APIs in v1.
- It does not fake remote agent execution.
- It does not add auth, a database, or a hosted backend.
- It does not replace human review.

## Commands

```bash
npm run orchestrate
npm run orchestrate:dry-run
npm run score
npm run gates
npm run recover
```

`orchestrate:dry-run` means:

- read the repo and package state
- write prompt packets and reports
- detect which commands exist
- do not execute the project commands

Because tests and build are intentionally skipped in dry-run mode, the score is expected to cap below a full production-ready pass. A dry-run can still show all gates passing if the repo structure and evidence rules are healthy, but it should not be treated as final proof that the build is ready.

You can also use the thin subcommand wrapper:

```bash
npm run xelera -- orchestrate
npm run xelera -- score
npm run xelera -- gates
npm run xelera -- recover
```

## Reports

The orchestrator writes markdown-first output under `orchestrator/reports/` and run artifacts under `orchestrator/runs/`.

Important reports:

- `OBJECTIVE_CRITERIA.md`
- `OBJECTIVE_SCORECARD.md`
- `GATE_RESULTS.md`
- `TEST_RESULTS.md`
- `RECOVERY_PLAN.md`
- `NEXT_AGENT_PROMPT.md`
- `FINAL_ORCHESTRATOR_REPORT.md`

## Scoring And Caps

The score categories are:

- Objective fit: 20
- Functional correctness: 15
- Test and regression coverage: 15
- Gate enforcement: 15
- Artifact usefulness: 10
- Beginner usability: 10
- Handoff/recovery quality: 10
- Local-first/markdown-first compliance: 5

Hard caps apply when tests are not run, build fails, fake evidence is present, gates are bypassed, verification claims pass while the body says blocked or fail, artifacts are mostly generic, or the repo cannot build at all.

## How To Read A Low Score

- `PASS` means the repo met the current score threshold and no gate failures remain.
- `CONDITIONAL PASS` means the repo is usable but still needs follow-up before a strong handoff.
- `NEEDS FIXES` means the gates may be healthy, but the repo is still missing enough quality, clarity, or proof that it should not be treated as done.
- `FAIL` means one or more gates failed or a hard cap pulled the score down sharply.

## Recovery

If a gate fails, the orchestrator identifies the failed gate, exact failed criteria, likely files to change, and a focused next-agent prompt. It intentionally avoids recommending broad rewrites unless the repo structure leaves no safer option.
