# USING_WITH_CLAUDE_CODE

## What This Guide Is For

Use this guide if you want to run a Xelera Method workspace with Claude Code.

Claude Code uses the same generated package as Codex and OpenCode. Only the startup instructions and prompt file change.

## Fastest Example

Create the family task app workspace:

```bash
npm run create-project -- --input=examples/family-task-app.json --out=.tmp-family-task-app --zip=true
```

Then open:

- `.tmp-family-task-app/xelera-method-workspace/CLAUDE_START_HERE.md`

## What To Open First

Read:

1. `START_HERE.md`
2. `00_PROJECT_CONTEXT.md`
3. `01_CONTEXT_RULES.md`
4. `00_APPROVAL_GATE.md`
5. `PROJECT_BRIEF.md`
6. `PHASE_PLAN.md`
7. `CLAUDE_START_HERE.md`

## What To Paste Into Claude Code

Open:

- `CLAUDE_HANDOFF_PROMPT.md`

Paste that prompt into Claude Code and give it the listed files.

For the current phase, the most useful files are usually:

- `PHASE_BRIEF.md`
- `ENTRY_GATE.md`
- `CLAUDE_BUILD_PROMPT.md`
- `TEST_PLAN.md`
- `HANDOFF_SUMMARY.md`
- `NEXT_PHASE_CONTEXT.md`

## Beginner-Friendly Flow

1. Generate the workspace.
2. Run `status`.
3. Open `CLAUDE_START_HERE.md`.
4. Paste `CLAUDE_HANDOFF_PROMPT.md`.
5. Keep Claude Code focused on the current phase only.
6. Review the output yourself.
7. Fill `VERIFICATION_REPORT.md`.
8. Run `validate`.
9. Run `status`.
10. Advance only if the current phase really passed.

## Exact Commands

Validate:

```bash
npm run validate -- --package=.tmp-family-task-app/xelera-method-workspace
```

Status:

```bash
npm run status -- --package=.tmp-family-task-app/xelera-method-workspace
```

Advance:

```bash
npm run next-phase -- --package=.tmp-family-task-app/xelera-method-workspace --evidence=phases/phase-01/VERIFICATION_REPORT.md
```

## Important Rules

- Work one phase at a time.
- Keep the phase packet small and relevant.
- Do not assume Claude Code remembers old context unless you provide the files again.
- Do not skip verification and evidence.
