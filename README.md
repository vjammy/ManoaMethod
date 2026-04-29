# MVP Builder

Turn a rough product idea into a phased, gated, evidence-checked workspace that an AI coding agent can actually build from.

## What you get

- A generated markdown workspace with phase briefs, entry/exit gates, test scripts, and handoff files.
- Sample data fixtures and traceability between requirements, phases, and tests.
- A 9-step workflow that ends with `npm run auto-regression` — build → test scripts → HTTP probe → Playwright requirement coverage → 0–100 score → fix prompts.
- One source of truth in markdown files. No hidden chat context, no hosted state.

## Install

```bash
npm install
npm run typecheck
```

Requires Node 20+.

## 5-minute tour

```bash
npm run create-project -- --input=examples/family-task-app.json --out=.tmp-demo
npm run validate -- --package=.tmp-demo/mvp-builder-workspace
npm run status -- --package=.tmp-demo/mvp-builder-workspace
```

Open `.tmp-demo/mvp-builder-workspace/START_HERE.md`. That's the entry point of every generated workspace.

For the full walkthrough see [docs/QUICKSTART.md](docs/QUICKSTART.md).

## Where to look next

| If you want to… | Read |
|---|---|
| Try it in 5 minutes | [docs/QUICKSTART.md](docs/QUICKSTART.md) |
| Understand the 9-step workflow | [docs/WORKFLOW.md](docs/WORKFLOW.md) |
| See every npm command | [docs/COMMANDS.md](docs/COMMANDS.md) |
| Understand auto-regression scoring + browser loop | [docs/AUTO_REGRESSION.md](docs/AUTO_REGRESSION.md) |
| Understand a generated workspace file by file | [docs/WORKSPACE.md](docs/WORKSPACE.md) |
| Drive Codex / Claude Code / OpenCode | [docs/AGENTS.md](docs/AGENTS.md) |
| Build from existing requirements docs | [docs/BUILD_FROM_REQUIREMENTS.md](docs/BUILD_FROM_REQUIREMENTS.md) |
| Diagnose a failure | [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |
| Look up a term | [docs/GLOSSARY.md](docs/GLOSSARY.md) |

The full doc index is [docs/README.md](docs/README.md).

## What this is not

- Not hosted. No backend, no auth, no database.
- Not an agent. The repo generates planning, scoring, and fix prompts; agents (Codex, Claude Code, OpenCode) do the building.
- Not a quality guarantee. The discipline only works if you actually run the loops and act on the fix prompts.

## Repo layout

```
lib/         generator, scoring, workflow, orchestrator
scripts/     npm run targets (create-project, validate, loop, auto-regression, ...)
docs/        documentation (start at docs/README.md)
examples/    sample inputs you can generate workspaces from
templates/   per-profile question and language templates
```
