# Xelera Method

Xelera Method is a local, markdown-first planning system for AI-assisted builds in Codex, Claude Code, and OpenCode.

It helps you turn a rough idea into a reusable workspace of markdown files before and during coding. That workspace explains the project, breaks the work into phases, records gates, tracks evidence, and preserves context so you can resume later or switch agents without losing your place.

Xelera Method is not a hosted app, project manager, or quality guarantee. It gives you structure, but you still need human review and good judgment.

## What Is Xelera Method?

Use Xelera Method when you want to:

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

Xelera Method solves this by generating a local workspace with:

- project context
- rules
- phase briefs
- entry gates
- exit gates
- verification files
- handoff files
- status and validation commands

## What It Does Not Do

Xelera Method does not:

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

- a created folder at `.tmp-family-task-app/xelera-method-workspace`
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

- Codex: [docs/USING_WITH_CODEX.md](C:\AI\XeleraMethod\docs\USING_WITH_CODEX.md)
- Claude Code: [docs/USING_WITH_CLAUDE_CODE.md](C:\AI\XeleraMethod\docs\USING_WITH_CLAUDE_CODE.md)
- OpenCode: [docs/USING_WITH_OPENCODE.md](C:\AI\XeleraMethod\docs\USING_WITH_OPENCODE.md)

## Verify The Phase

After the agent finishes a phase:

1. Review the work.
2. Open `phases/phase-XX/VERIFY_PROMPT.md`.
3. Check `phases/phase-XX/EVIDENCE_CHECKLIST.md`.
4. Fill out `phases/phase-XX/VERIFICATION_REPORT.md`.

Important verification rules:

- `## result:` must be `pass`, `fail`, or `pending`
- `## recommendation:` must be `proceed`, `revise`, `blocked`, or `pending`
- `## evidence files` must list real files if you want to advance
- `- pending` is only a placeholder and does not count as real evidence

## Validate The Package

Run:

```bash
npm run validate -- --package=.tmp-family-task-app/xelera-method-workspace
```

What you should see:

- a success message if required files and verification fields are valid
- or a list of specific problems if something is missing or malformed

Validation tells you whether the package structure is healthy. It does not automatically mean the package is ready to advance.

## Check Status

Run:

```bash
npm run status -- --package=.tmp-family-task-app/xelera-method-workspace
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
npm run next-phase -- --package=.tmp-family-task-app/xelera-method-workspace --evidence=phases/phase-01/VERIFICATION_REPORT.md
```

You can also add a handoff note:

```bash
npm run next-phase -- --package=.tmp-family-task-app/xelera-method-workspace --evidence=phases/phase-01/VERIFICATION_REPORT.md --handoff="Phase 1 reviewed and approved."
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

- Beginner manual: [docs/NOVICE_GUIDE.md](C:\AI\XeleraMethod\docs\NOVICE_GUIDE.md)
- Quick commands: [docs/QUICKSTART.md](C:\AI\XeleraMethod\docs\QUICKSTART.md)
- Troubleshooting: [docs/TROUBLESHOOTING.md](C:\AI\XeleraMethod\docs\TROUBLESHOOTING.md)
- Glossary: [docs/GLOSSARY.md](C:\AI\XeleraMethod\docs\GLOSSARY.md)
- Family task example: [docs/EXAMPLE_FAMILY_TASK_APP.md](C:\AI\XeleraMethod\docs\EXAMPLE_FAMILY_TASK_APP.md)

## Exported Workspace Contents

Every generated workspace includes beginner guidance and phase files such as:

- `START_HERE.md`
- `PROJECT_BRIEF.md`
- `00_PROJECT_CONTEXT.md`
- `01_CONTEXT_RULES.md`
- `CODEX_START_HERE.md`
- `CLAUDE_START_HERE.md`
- `OPENCODE_START_HERE.md`
- `repo/xelera-state.json`
- `phases/phase-01/...`

## Repo Notes

- `examples/`: sample input files you can generate from
- `docs/`: beginner guides and workflow explanations
- `scripts/`: CLI commands like `create-project`, `validate`, `status`, and `next-phase`
- `lib/`: generator and workflow logic

## License

MIT
