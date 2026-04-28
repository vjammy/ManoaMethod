# TROUBLESHOOTING

## I do not know which file to open first

Open the generated workspace and start with:

1. `START_HERE.md`
2. `00_PROJECT_CONTEXT.md`
3. `01_CONTEXT_RULES.md`
4. `00_APPROVAL_GATE.md`
5. `PROJECT_BRIEF.md`
6. `PHASE_PLAN.md`

## validate failed

Run:

```bash
npm run validate -- --package=YOUR_PACKAGE_PATH
```

Then read the listed problems one by one. Common causes:

- a required file is missing
- `VERIFICATION_REPORT.md` uses the wrong result value
- `VERIFICATION_REPORT.md` uses the wrong recommendation value
- a listed evidence file does not exist
- `repo/xelera-state.json` is malformed

Fix the listed file, then run `validate` again.

## status says pending

This usually means the current phase has not been fully reviewed yet.

Do this:

1. open `VERIFY_PROMPT.md`
2. open `EVIDENCE_CHECKLIST.md`
3. complete `VERIFICATION_REPORT.md`
4. run `status` again

## status says missing evidence

This means `VERIFICATION_REPORT.md` lists evidence files that do not exist, or only contains placeholder evidence.

Check:

- `## evidence files`
- whether each listed file exists on disk
- whether `- pending` was replaced with real paths

## next-phase will not advance

Common reasons:

- `result` is not `pass`
- `recommendation` is not `proceed`
- evidence files are missing
- the package is still blocked
- the evidence file path passed to `--evidence=` is wrong

Use:

```bash
npm run status -- --package=YOUR_PACKAGE_PATH
```

It usually tells you the next action.

## VERIFICATION_REPORT.md is malformed

Use these exact headers:

```md
## result: pending
## recommendation: pending
## evidence files
- pending
```

Allowed result values:

- `pass`
- `fail`
- `pending`

Allowed recommendation values:

- `proceed`
- `revise`
- `blocked`
- `pending`

## I used the wrong result or recommendation value

Replace it with one of the allowed values above, save the file, and run `validate` again.

## I deleted a required file

The easiest fix is usually to regenerate the package:

```bash
npm run create-project -- --input=examples/family-task-app.json --out=.tmp-family-task-app --zip=true
```

If you need to preserve work, copy your changed phase notes out first, regenerate, then re-apply your edits carefully.

## I want to resume after a few days

Open:

1. `START_HERE.md`
2. `repo/xelera-state.json`
3. `phases/phase-XX/HANDOFF_SUMMARY.md`
4. `phases/phase-XX/NEXT_PHASE_CONTEXT.md`

Then run:

```bash
npm run status -- --package=YOUR_PACKAGE_PATH
```

## Codex, Claude, or OpenCode lost context

Re-ground the agent with:

- the root context files
- the current phase packet
- the matching `*_START_HERE.md`
- the matching `*_HANDOFF_PROMPT.md`

Do not rely on old chat memory alone.

## I do not know what evidence to list

List the real files you reviewed to justify your decision. Good examples:

- `phases/phase-01/EVIDENCE_CHECKLIST.md`
- `phases/phase-01/HANDOFF_SUMMARY.md`
- `repo/manifest.json`
- changed markdown files relevant to the phase

Do not list:

- `- pending`
- vague notes
- chat history

## I am not technical enough to understand a file

Start with the plain-language docs:

- [NOVICE_GUIDE.md](C:\AI\XeleraMethod\docs\NOVICE_GUIDE.md)
- [GLOSSARY.md](C:\AI\XeleraMethod\docs\GLOSSARY.md)

Then ask your coding agent to explain one file at a time in plain English.

## The project has too many files

Focus only on:

- the root starter files
- the current phase folder
- `status`

You do not need to read every file at once.

## I want to restart a phase

There is no special reset command right now.

Practical restart options:

1. keep the same workspace, revise the phase files, and update verification
2. regenerate a fresh workspace from the example JSON
3. copy over only the notes you still want

If you are unsure, the safest path is usually to regenerate and compare.
