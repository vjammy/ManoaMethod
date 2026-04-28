# QUICKSTART

## 1. Install Dependencies

```bash
npm install
```

Optional checks:

```bash
npm run typecheck
npm run build
```

## 2. Create the Family Task App Example

```bash
npm run create-project -- --input=examples/family-task-app.json --out=.tmp-family-task-app --zip=true
```

What you should see:

- `.tmp-family-task-app/xelera-method-workspace`
- `.tmp-family-task-app/xelera-method-workspace.zip`

## 3. Open These Files First

Inside the generated workspace, open:

1. `START_HERE.md`
2. `00_PROJECT_CONTEXT.md`
3. `01_CONTEXT_RULES.md`
4. `00_APPROVAL_GATE.md`
5. `PROJECT_BRIEF.md`
6. `PHASE_PLAN.md`

## 4. Validate the New Package

```bash
npm run validate -- --package=.tmp-family-task-app/xelera-method-workspace
```

What you should see:

- a validation success message
- or specific fix instructions if something is wrong

## 5. Check Status

```bash
npm run status -- --package=.tmp-family-task-app/xelera-method-workspace
```

What you should see:

- current phase
- lifecycle status
- evidence state
- next recommended action

## 6. Choose an Agent

Open one of:

- `CODEX_START_HERE.md`
- `CLAUDE_START_HERE.md`
- `OPENCODE_START_HERE.md`

Then open the matching prompt:

- `CODEX_HANDOFF_PROMPT.md`
- `CLAUDE_HANDOFF_PROMPT.md`
- `OPENCODE_HANDOFF_PROMPT.md`

## 7. What To Paste Into an Agent

Paste the matching handoff prompt and give the agent:

- the root context files listed in the start file
- the current phase files listed in the build prompt

At minimum for the current phase, open:

- `PHASE_BRIEF.md`
- `ENTRY_GATE.md`
- the matching `*_BUILD_PROMPT.md`
- `TEST_PLAN.md`
- `HANDOFF_SUMMARY.md`
- `NEXT_PHASE_CONTEXT.md`

## 8. After the Agent Finishes

Open and complete:

- `VERIFY_PROMPT.md`
- `EVIDENCE_CHECKLIST.md`
- `VERIFICATION_REPORT.md`

## 9. Advance After Verification

Only advance after:

- `result` is `pass`
- `recommendation` is `proceed`
- `## evidence files` lists at least one real file that exists

Command:

```bash
npm run next-phase -- --package=.tmp-family-task-app/xelera-method-workspace --evidence=phases/phase-01/VERIFICATION_REPORT.md
```

## 10. Useful Next Reads

- [NOVICE_GUIDE.md](C:\AI\XeleraMethod\docs\NOVICE_GUIDE.md)
- [TROUBLESHOOTING.md](C:\AI\XeleraMethod\docs\TROUBLESHOOTING.md)
- [EXAMPLE_FAMILY_TASK_APP.md](C:\AI\XeleraMethod\docs\EXAMPLE_FAMILY_TASK_APP.md)
