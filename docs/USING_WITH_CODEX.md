# USING_WITH_CODEX

## What This Guide Is For

Use this guide if you want to run a Xelera Method workspace with Codex.

Codex is one of three supported agent flows. The project package stays the same even if you later switch to Claude Code or OpenCode.

## Fastest Example

Create the family task app workspace:

```bash
npm run create-project -- --input=examples/family-task-app.json --out=.tmp-family-task-app --zip=true
```

Then open:

- `.tmp-family-task-app/xelera-method-workspace/CODEX_START_HERE.md`

## What To Open First

Before you paste anything into Codex, read:

1. `START_HERE.md`
2. `00_PROJECT_CONTEXT.md`
3. `01_CONTEXT_RULES.md`
4. `00_APPROVAL_GATE.md`
5. `PROJECT_BRIEF.md`
6. `PHASE_PLAN.md`
7. `CODEX_START_HERE.md`

## What To Paste Into Codex

Open:

- `CODEX_HANDOFF_PROMPT.md`

Paste that prompt into Codex and give Codex the files listed there.

For the current phase, you will usually also give Codex:

- `phases/phase-XX/PHASE_BRIEF.md`
- `phases/phase-XX/ENTRY_GATE.md`
- `phases/phase-XX/CODEX_BUILD_PROMPT.md`
- `phases/phase-XX/TEST_PLAN.md`
- `phases/phase-XX/HANDOFF_SUMMARY.md`
- `phases/phase-XX/NEXT_PHASE_CONTEXT.md`

## Beginner-Friendly Flow

1. Generate the workspace.
2. Run `status`.
3. Open `CODEX_START_HERE.md`.
4. Paste `CODEX_HANDOFF_PROMPT.md`.
5. Keep Codex focused on the current phase only.
6. Ask Codex for a short handoff summary when done.
7. Review the result yourself.
8. Fill `VERIFICATION_REPORT.md`.
9. Run `validate`.
10. Run `status`.
11. Advance with `next-phase` only if the phase truly passed.

## Exact Commands

Validate:

```bash
npm run validate -- --package=.tmp-family-task-app/xelera-method-workspace
```

Check status:

```bash
npm run status -- --package=.tmp-family-task-app/xelera-method-workspace
```

Advance after successful verification:

```bash
npm run next-phase -- --package=.tmp-family-task-app/xelera-method-workspace --evidence=phases/phase-01/VERIFICATION_REPORT.md
```

## Important Rules

- Work one phase at a time.
- Confirm the entry gate before implementation.
- Do not treat Codex output as automatically approved.
- Do not use `pass + proceed` without real evidence files.
- Ask Codex for a short handoff summary before moving on.
