# Manoa Method

Manoa Method is a local, markdown-first planning system for AI-assisted builds in Codex, Claude Code, and OpenCode.

It helps you turn a rough idea into a reusable workspace of markdown files before and during coding. That workspace explains the project, breaks the work into phases, records gates, tracks evidence, and preserves context so you can resume later or switch agents without losing your place.

Manoa Method is not a hosted app, project manager, or quality guarantee. It gives you structure, but you still need human review and good judgment.

## Documentation Map

If you want the full documentation set, start here:

- Documentation index: [docs/README.md](docs/README.md)
- Method overview: [docs/METHODOLOGY.md](docs/METHODOLOGY.md)
- Best practices: [docs/BEST_PRACTICES.md](docs/BEST_PRACTICES.md)
- Business user workflow: [docs/BUSINESS_USER_WORKFLOW.md](docs/BUSINESS_USER_WORKFLOW.md)
- Technical builder workflow: [docs/TECHNICAL_BUILDER_WORKFLOW.md](docs/TECHNICAL_BUILDER_WORKFLOW.md)
- Build from attached requirements: [docs/BUILD_FROM_REQUIREMENTS.md](docs/BUILD_FROM_REQUIREMENTS.md)

## What Manoa Method Tries To Do

Manoa Method tries to solve a specific problem:

- teams want to use AI coding tools
- requirements are often incomplete or trapped in chat
- scope drifts
- builders skip verification
- handoffs become unreliable

The method addresses that by turning requirements into a local, phase-based workspace with:

- structured context
- phase packets
- gates
- verification files
- evidence requirements
- state tracking
- handoff documentation

## The Method In One Page

At a high level, Manoa Method works like this:

1. Capture the project brief and mode.
2. Force business and technical questions into the open.
3. Critique the plan for ambiguity, contradictions, and missing decisions.
4. Score readiness.
5. Generate a markdown workspace.
6. Work one phase at a time.
7. Verify each phase with evidence before advancing.
8. Leave a handoff that another builder or agent can trust.

For the detailed explanation, read [docs/METHODOLOGY.md](docs/METHODOLOGY.md).

## Best Practices Behind The Method

The repo is opinionated about several practices:

- one source of truth
- separation of business guidance and technical execution
- explicit scope cuts
- required gates
- mandatory evidence
- explicit pass/fail language
- honest handoff state

The detailed mapping from practice to implementation is in [docs/BEST_PRACTICES.md](docs/BEST_PRACTICES.md).

## How To Use It With Attached Requirements

If you already have a requirements document and want an AI agent to build from it, use the guide here:

- [docs/BUILD_FROM_REQUIREMENTS.md](docs/BUILD_FROM_REQUIREMENTS.md)

The short version is:

- give the agent the requirements, wherever they live
- tell it to pull `https://github.com/vjammy/manoa-method`
- tell it that it is expected to build the real solution
- tell it to build in the repo root
- require it to use Manoa Method to turn those requirements into a robust production-ready application
- require it to follow the Manoa phase, gate, validation, and handoff workflow

## Audience-Specific Guides

- Business users: [docs/BUSINESS_USER_WORKFLOW.md](docs/BUSINESS_USER_WORKFLOW.md)
- Technical builders: [docs/TECHNICAL_BUILDER_WORKFLOW.md](docs/TECHNICAL_BUILDER_WORKFLOW.md)
- Beginner guide: [docs/NOVICE_GUIDE.md](docs/NOVICE_GUIDE.md)
- Quick commands: [docs/QUICKSTART.md](docs/QUICKSTART.md)

## Manoa Orchestrator

The repo now includes Manoa Orchestrator, a local-first orchestrator that can read a generated workspace or repo, derive objective criteria, generate focused prompt packets, run local commands, enforce gates, score the build from 0 to 100, and write recovery plans when something fails.

What it does not do:

- It does not call hosted agent APIs in v1.
- It does not fake agent execution.
- It does not add auth, a database, or a hosted backend.

Run it with:

```bash
npm run orchestrate
npm run orchestrate:dry-run
npm run score
npm run gates
npm run recover
```

Reports are written to `orchestrator/reports/` and run artifacts to `orchestrator/runs/`.

`npm run orchestrate:dry-run` reads the repo, generates prompts and reports, and checks which commands exist, but it intentionally does not execute the real build/test commands. That means a dry-run can be useful for structure and gate review while still scoring below a full pass.

## Production Build Mode

Manoa Method now includes a reusable production-build prompt and production-release document set so teams can distinguish:

- planning package only
- runnable MVP
- full production application

Use the reusable production prompt here:

- [docs/MANOA_PRODUCTION_BUILD_PROMPT.md](docs/MANOA_PRODUCTION_BUILD_PROMPT.md)

Generated workspaces now also include production-oriented files such as:

- `BUILD_TARGET.md`
- `PRODUCTION_SCOPE.md`
- `DEPLOYMENT_PLAN.md`
- `ENVIRONMENT_SETUP.md`
- `PRODUCTION_READINESS_CHECKLIST.md`
- `OPERATIONS_RUNBOOK.md`
- `INCIDENT_RESPONSE_GUIDE.md`
- `ROLLBACK_PLAN.md`
- `SECURITY_REVIEW.md`
- `PERFORMANCE_PLAN.md`
- `RELEASE_CHECKLIST.md`
- `PRODUCTION_GATE.md`

These files are intended to prevent a runnable MVP from being mistaken for a complete end-to-end production build.

## What Is Manoa Method?

Use Manoa Method when you want to:

- plan a project before asking an AI coding agent to build it
- keep build context in local markdown instead of hidden chat history
- move through work phase by phase
- verify each phase before advancing
- hand off between Codex, Claude Code, OpenCode, or a human teammate

It is for beginner and intermediate business users, technical product owners, AI-assisted builders, and small teams who want a clearer build workflow.

## What Problem Does It Solve?

Many teams start coding too early. They lose time because:

- the idea is still vague
- scope is too broad
- the next builder does not know where to start
- important assumptions live only in chat
- nobody can tell whether a phase is really complete

Manoa Method solves this by generating a local workspace with:

- project context
- rules
- phase briefs
- entry gates
- exit gates
- verification files
- handoff files
- status and validation commands

## What It Does Not Do

Manoa Method does not:

- host your product
- create a SaaS workflow
- add a database or auth system by itself
- replace review, testing, or product judgment
- magically turn a weak idea into a good product

## Install And Setup

```bash
npm install
npm run typecheck
npm run build
```

What you should see:

- `npm install` finishes without dependency errors
- `npm run typecheck` finishes without TypeScript errors
- `npm run build` completes a production build

If you want to open the local UI too:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Create Your First Project

The fastest beginner-friendly example is the new family task management sample:

```bash
npm run create-project -- --input=examples/family-task-app.json --out=.tmp-family-task-app --zip=true
```

What you should see:

- a created folder at `.tmp-family-task-app/manoa-method-workspace`
- a zip file beside it
- command output telling you where the workspace was created

You can also generate the original repo sample:

```bash
npm run create-project -- --input=examples/sample-project.json --out=.tmp-sample-project --zip=true
```

## Open The Generated Workspace

Open the generated folder and read these files first:

1. `START_HERE.md`
2. `00_PROJECT_CONTEXT.md`
3. `01_CONTEXT_RULES.md`
4. `00_APPROVAL_GATE.md`
5. `PROJECT_BRIEF.md`
6. `PHASE_PLAN.md`

Then open the agent-specific file you want:

- `CODEX_START_HERE.md`
- `CLAUDE_START_HERE.md`
- `OPENCODE_START_HERE.md`

## Start Phase 1

Phase 1 is the first planning/build checkpoint in the generated workspace.

Inside `phases/phase-01/`, the most important files are:

- `PHASE_BRIEF.md`
- `ENTRY_GATE.md`
- `CODEX_BUILD_PROMPT.md`
- `CLAUDE_BUILD_PROMPT.md`
- `OPENCODE_BUILD_PROMPT.md`
- `VERIFY_PROMPT.md`
- `EVIDENCE_CHECKLIST.md`
- `VERIFICATION_REPORT.md`
- `EXIT_GATE.md`
- `HANDOFF_SUMMARY.md`
- `NEXT_PHASE_CONTEXT.md`

## Use An AI Coding Agent

The simplest rule is:

- read the root guidance files
- open the current phase folder
- use the matching `*_START_HERE.md`
- paste the matching `*_HANDOFF_PROMPT.md`
- give the agent the current phase packet files

Start here for each agent:

- Codex: [docs/USING_WITH_CODEX.md](docs/USING_WITH_CODEX.md)
- Claude Code: [docs/USING_WITH_CLAUDE_CODE.md](docs/USING_WITH_CLAUDE_CODE.md)
- OpenCode: [docs/USING_WITH_OPENCODE.md](docs/USING_WITH_OPENCODE.md)

## Verify The Phase

After the agent finishes a phase:

1. Review the work.
2. Open `phases/phase-XX/VERIFY_PROMPT.md`.
3. Run or follow `phases/phase-XX/TEST_SCRIPT.md`.
4. Record results in `phases/phase-XX/TEST_RESULTS.md`.
5. Check `phases/phase-XX/EVIDENCE_CHECKLIST.md`.
6. Fill out `phases/phase-XX/VERIFICATION_REPORT.md`.

Important verification rules:

- `## result:` must be `pass`, `fail`, or `pending`
- `## recommendation:` must be `proceed`, `revise`, `blocked`, or `pending`
- `## evidence files` must list real files if you want to advance
- `- pending` is only a placeholder and does not count as real evidence
- A phase cannot be considered ready just because files exist. Tests must be run and recorded first.

## Validate The Package

Run:

```bash
npm run validate -- --package=.tmp-family-task-app/manoa-method-workspace
```

What you should see:

- a success message if required files and verification fields are valid
- or a list of specific problems if something is missing or malformed

Validation now checks the testing layer:

- Root testing files: `TESTING_STRATEGY.md`, `REGRESSION_TEST_PLAN.md`, `TEST_SCRIPT_INDEX.md`
- Per-phase testing files: `TEST_SCRIPT.md` and `TEST_RESULTS.md` in every phase folder
- Regression suite files in `/regression-suite/`
- `TEST_RESULTS.md` must start as `pending` by design
- Generic or fake test evidence is rejected
- Contradictions between verification reports and test results are caught

Validation tells you whether the package structure is healthy. It does not automatically mean the package is ready to advance.

## Check Status

Run:

```bash
npm run status -- --package=.tmp-family-task-app/manoa-method-workspace
```

What you should see:

- current phase
- lifecycle status
- verification state
- evidence state
- next recommended action

If the package is blocked, `status` explains what to fix next.

## Advance To The Next Phase

Advance only after:

- the phase result is `pass`
- the recommendation is `proceed`
- at least one real evidence file is listed under `## evidence files`
- the listed evidence file exists on disk
- the package is not blocked by unresolved gates or blockers

Command:

```bash
npm run next-phase -- --package=.tmp-family-task-app/manoa-method-workspace --evidence=phases/phase-01/VERIFICATION_REPORT.md
```

You can also add a handoff note:

```bash
npm run next-phase -- --package=.tmp-family-task-app/manoa-method-workspace --evidence=phases/phase-01/VERIFICATION_REPORT.md --handoff="Phase 1 reviewed and approved."
```

## Repeat

The normal lifecycle loop is:

1. read the current phase
2. work only that phase
3. verify the phase
4. run `validate`
5. run `status`
6. advance with `next-phase`
7. repeat for the next phase

## Where To Read Next

- Beginner manual: [docs/NOVICE_GUIDE.md](docs/NOVICE_GUIDE.md)
- Quick commands: [docs/QUICKSTART.md](docs/QUICKSTART.md)
- Troubleshooting: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- Glossary: [docs/GLOSSARY.md](docs/GLOSSARY.md)
- Family task example: [docs/EXAMPLE_FAMILY_TASK_APP.md](docs/EXAMPLE_FAMILY_TASK_APP.md)
- Orchestrator guide: [docs/ORCHESTRATOR.md](docs/ORCHESTRATOR.md)

## Exported Workspace Contents

Every generated workspace includes beginner guidance, phase files, a testing layer, and a regression suite:

### Root files
- `START_HERE.md`
- `PROJECT_BRIEF.md`
- `00_PROJECT_CONTEXT.md`
- `01_CONTEXT_RULES.md`
- `AGENTS.md` (includes Core Agent Operating Rules)
- `CODEX_START_HERE.md`
- `CLAUDE_START_HERE.md`
- `OPENCODE_START_HERE.md`
- `TESTING_STRATEGY.md`
- `REGRESSION_TEST_PLAN.md`
- `TEST_SCRIPT_INDEX.md`
- `repo/manoa-state.json`

### Per-phase files (inside each `phases/phase-XX/` folder)
- `PHASE_BRIEF.md`
- `ENTRY_GATE.md`
- `EXIT_GATE.md`
- `TEST_PLAN.md`
- `TEST_SCRIPT.md` — concrete test steps with pass/fail criteria
- `TEST_RESULTS.md` — fillable test results template (defaults to pending)
- `VERIFY_PROMPT.md`
- `EVIDENCE_CHECKLIST.md`
- `VERIFICATION_REPORT.md`
- `HANDOFF_SUMMARY.md`
- `NEXT_PHASE_CONTEXT.md`

### Regression suite (inside `/regression-suite/`)
- `README.md`
- `RUN_REGRESSION.md`
- `REGRESSION_CHECKLIST.md`
- `REGRESSION_RESULTS_TEMPLATE.md`
- `scripts/artifact-integrity.md`
- `scripts/gate-consistency.md`
- `scripts/evidence-quality.md`
- `scripts/handoff-continuity.md`
- `scripts/agent-rules.md`
- `scripts/local-first.md`

The regression suite is a reusable, project-specific asset designed to be run repeatedly throughout the project lifecycle — not just during initial generation. It uses manual markdown-based procedures with copyable commands and concrete checks.

### Regression suite rules

- Each script has a clear purpose, inputs, step-by-step checks, pass criteria, fail criteria, evidence to capture, and stop conditions.
- `REGRESSION_RESULTS_TEMPLATE.md` starts as `pending` by design. Do not pre-fill it with passing results.
- Regression results must include concrete evidence. Generic claims like "looks good" or "no issues" are rejected by validation.
- Run the full suite after every major phase, before `next-phase`, before handoff, and before committing production code.

## Repo Notes

- `examples/`: sample input files you can generate from
- `docs/`: beginner guides and workflow explanations
- `scripts/`: CLI commands like `create-project`, `validate`, `status`, and `next-phase`
- `lib/`: generator and workflow logic
