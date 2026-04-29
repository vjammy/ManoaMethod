# USING_WITH_OPENCODE

## What This Guide Is For

Use this guide if you want to run a Manoa Method workspace with OpenCode.

OpenCode is a first-class workflow alongside Codex and Claude Code. The generated workspace stays the same across all three.

## Fastest Example

Create the family task app workspace:

```bash
npm run create-project -- --input=examples/family-task-app.json --out=.tmp-family-task-app --zip=true
```

Then open:

- `.tmp-family-task-app/manoa-method-workspace/OPENCODE_START_HERE.md`

## What To Open First

Read:

1. `START_HERE.md`
2. `00_PROJECT_CONTEXT.md`
3. `01_CONTEXT_RULES.md`
4. `00_APPROVAL_GATE.md`
5. `PROJECT_BRIEF.md`
6. `PHASE_PLAN.md`
7. `AGENTS.md`
8. `OPENCODE_START_HERE.md`

## What To Paste Into OpenCode

Open:

- `OPENCODE_HANDOFF_PROMPT.md`

Paste that prompt into OpenCode and give it the matching current phase files.

For the current phase, the usual packet is:

- `PHASE_BRIEF.md`
- `ENTRY_GATE.md`
- `OPENCODE_BUILD_PROMPT.md`
- `TEST_PLAN.md`
- `HANDOFF_SUMMARY.md`
- `NEXT_PHASE_CONTEXT.md`

## If You Use the OpenCode Config Pack

This repo also includes an OpenCode config pack under:

`dist-addons/opencode/manoa-method/`

If your OpenCode setup supports local commands or agents, copy those files into the location where you keep them.

## Beginner-Friendly Flow

1. Generate the workspace.
2. Run `status`.
3. Open `OPENCODE_START_HERE.md`.
4. Paste `OPENCODE_HANDOFF_PROMPT.md`.
5. Keep OpenCode focused on one phase only.
6. Review the results yourself.
7. Fill `VERIFICATION_REPORT.md`.
8. Run `validate`.
9. Run `status`.
10. Advance only after the package is truly ready.

## Verification Workflow

After phase work, update `VERIFICATION_REPORT.md` with:

- `## result: pass`, `fail`, or `pending`
- `## recommendation: proceed`, `revise`, `blocked`, or `pending`
- real files under `## evidence files`

Then use:

```bash
npm run validate -- --package=.tmp-family-task-app/manoa-method-workspace
npm run status -- --package=.tmp-family-task-app/manoa-method-workspace
```

Advance with:

```bash
npm run next-phase -- --package=.tmp-family-task-app/manoa-method-workspace --evidence=phases/phase-01/VERIFICATION_REPORT.md
```

## Important Rules

- Read `AGENTS.md`.
- Do not skip entry gates.
- Do not silently mark phases complete.
- Do not rely on hidden context.
- Do not use placeholder evidence when trying to advance.
