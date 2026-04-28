# EXAMPLE_FAMILY_TASK_APP

## What This Example Is

This example is a realistic sample project for Xelera Method called **Family Task Board**.

It represents a family task management web app where:

- parents can assign tasks
- kids can see their own dashboard
- the household can track completion
- reminders can be planned for due and overdue tasks

It is meant to be rich enough to produce meaningful phases, gates, verification files, and handoff context.

## Exact Command

Create the example workspace:

```bash
npm run create-project -- --input=examples/family-task-app.json --out=.tmp-family-task-app --zip=true
```

Validate it:

```bash
npm run validate -- --package=.tmp-family-task-app/xelera-method-workspace
```

Check status:

```bash
npm run status -- --package=.tmp-family-task-app/xelera-method-workspace
```

## What The Sample Includes

- parent / household admin user
- second parent / co-parent user
- child / kid user
- optional guardian or caregiver
- task creation and assignment
- task status tracking
- parent dashboard
- kid dashboard
- reminder and email planning
- privacy and safety considerations for child users
- mobile-friendly planning constraints

## Why This Example Matters

This sample is useful because it forces the plan to think about:

- roles and permissions
- privacy boundaries
- child safety
- dashboard differences
- reminder behavior
- mobile usability
- verification and handoff discipline

## What To Open First After Generation

Open:

1. `START_HERE.md`
2. `00_PROJECT_CONTEXT.md`
3. `01_CONTEXT_RULES.md`
4. `PROJECT_BRIEF.md`
5. `PHASE_PLAN.md`

Then open the agent-specific starter file:

- `CODEX_START_HERE.md`
- `CLAUDE_START_HERE.md`
- `OPENCODE_START_HERE.md`

## Suggested Beginner Workflow

1. generate the workspace
2. read the root guidance files
3. run `status`
4. open the current phase folder
5. give the phase packet to one coding agent
6. review the results
7. fill `VERIFICATION_REPORT.md`
8. run `validate`
9. run `status`
10. advance with `next-phase` when ready

## What This Example Does Not Mean

This sample does not mean the repo already includes a production family task app. It is a planning input and test case for Xelera Method.
