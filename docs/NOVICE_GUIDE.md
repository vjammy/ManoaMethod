# NOVICE_GUIDE

## The Simplest Explanation

Manoa Method helps you prepare a project before and during AI-assisted coding.

It creates a local folder full of markdown files. Those files explain:

- what you are building
- what phase you are in
- what must be true before you start
- what must be true before you finish
- what evidence proves the work is complete
- what the next builder needs to know

If you are a beginner business user, think of it as a structured project workbook for Codex, Claude Code, or OpenCode.

## Mental Model

Use this mental model:

- one project becomes one local workspace
- one workspace contains many phases
- each phase has its own brief, gates, verification, and handoff
- you should only work one phase at a time
- `status` tells you where you are
- `validate` checks whether the package is healthy
- `next-phase` only advances when the current phase has passed its gate

## Before You Start

You need:

- Node.js and npm installed
- this repo on your machine
- a terminal open in `C:\AI\ManoaMethod`
- a coding agent you want to use: Codex, Claude Code, or OpenCode

Install dependencies:

```bash
npm install
```

Optional safety checks:

```bash
npm run typecheck
npm run build
```

What you should see:

- `npm install` completes successfully
- `npm run typecheck` completes without errors
- `npm run build` completes without build failures

## Folder Structure

When you generate a project, Manoa Method creates a folder like:

```text
manoa-method-workspace/
  START_HERE.md
  PROJECT_BRIEF.md
  00_PROJECT_CONTEXT.md
  01_CONTEXT_RULES.md
  00_APPROVAL_GATE.md
  PHASE_PLAN.md
  CODEX_START_HERE.md
  CLAUDE_START_HERE.md
  OPENCODE_START_HERE.md
  repo/
    manifest.json
    manoa-state.json
  phases/
    phase-01/
    phase-02/
    ...
```

Open these files first:

1. `START_HERE.md`
2. `00_PROJECT_CONTEXT.md`
3. `01_CONTEXT_RULES.md`
4. `00_APPROVAL_GATE.md`
5. `PROJECT_BRIEF.md`
6. `PHASE_PLAN.md`

## The Lifecycle Loop

This is the normal Manoa Method loop:

1. Create a workspace.
2. Read the root context files.
3. Open the current phase.
4. Give the current phase packet to a coding agent.
5. Review the results.
6. Fill verification and evidence files.
7. Run `validate`.
8. Run `status`.
9. Advance with `next-phase` if the gates are satisfied.
10. Repeat.

## Step-By-Step Walkthrough

### 1. Create a Sample Project

The best beginner sample in this repo is the family task app:

```bash
npm run create-project -- --input=examples/family-task-app.json --out=.tmp-family-task-app --zip=true
```

What you should see:

- a new folder at `.tmp-family-task-app/manoa-method-workspace`
- a zip file at `.tmp-family-task-app/manoa-method-workspace.zip`
- terminal output saying where the package was created

### 2. Open the Generated Workspace

Open:

- `.tmp-family-task-app/manoa-method-workspace/START_HERE.md`

Then read:

- `00_PROJECT_CONTEXT.md`
- `01_CONTEXT_RULES.md`
- `00_APPROVAL_GATE.md`
- `PROJECT_BRIEF.md`
- `PHASE_PLAN.md`

### 3. Find the Current Phase

The workspace tracks the current phase in:

- `repo/manoa-state.json`

You do not need to edit that file by hand unless you are repairing a broken state. Usually you should use:

```bash
npm run status -- --package=.tmp-family-task-app/manoa-method-workspace
```

What you should see:

- the current phase number and title
- whether the package is blocked or pending
- whether verification is complete
- the next recommended action

### 4. Open the Phase Folder

Open the current phase folder, usually:

- `phases/phase-01/`

Important files inside a phase:

- `PHASE_BRIEF.md`
- `ENTRY_GATE.md`
- `CODEX_BUILD_PROMPT.md`
- `CLAUDE_BUILD_PROMPT.md`
- `OPENCODE_BUILD_PROMPT.md`
- `TEST_PLAN.md`
- `VERIFY_PROMPT.md`
- `EVIDENCE_CHECKLIST.md`
- `VERIFICATION_REPORT.md`
- `EXIT_GATE.md`
- `HANDOFF_SUMMARY.md`
- `NEXT_PHASE_CONTEXT.md`

### 5. Use Your Coding Agent

Pick one agent and use its matching start file:

- Codex: `CODEX_START_HERE.md`
- Claude Code: `CLAUDE_START_HERE.md`
- OpenCode: `OPENCODE_START_HERE.md`

Then paste the matching handoff prompt:

- `CODEX_HANDOFF_PROMPT.md`
- `CLAUDE_HANDOFF_PROMPT.md`
- `OPENCODE_HANDOFF_PROMPT.md`

### 6. Review the Work

After the agent finishes:

- compare the work to `PHASE_BRIEF.md`
- check `ENTRY_GATE.md`
- check `EXIT_GATE.md`
- review changed files
- check test results

### 7. Fill Verification

Open:

- `VERIFY_PROMPT.md`
- `EVIDENCE_CHECKLIST.md`
- `VERIFICATION_REPORT.md`

You are deciding whether the phase is:

- ready to proceed
- still needs revision
- blocked

### 8. Validate the Package

Run:

```bash
npm run validate -- --package=.tmp-family-task-app/manoa-method-workspace
```

What you should see:

- a success message if required files and verification fields are valid
- or a list of exactly what needs to be fixed

### 9. Check Status

Run:

```bash
npm run status -- --package=.tmp-family-task-app/manoa-method-workspace
```

What you should see:

- current phase
- lifecycle status
- evidence readiness
- whether the phase is pending, passed, failed, blocked, or requires revision
- what to do next

### 10. Advance

Advance only after:

- `## result: pass`
- `## recommendation: proceed`
- `## evidence files` lists at least one real file
- that file exists on disk
- the package is not blocked

Command:

```bash
npm run next-phase -- --package=.tmp-family-task-app/manoa-method-workspace --evidence=phases/phase-01/VERIFICATION_REPORT.md
```

## How To Work With Codex

Open:

- `CODEX_START_HERE.md`
- `CODEX_HANDOFF_PROMPT.md`
- the current phase folder

Give Codex:

- the root context files listed in `CODEX_START_HERE.md`
- the current phase files listed in `CODEX_BUILD_PROMPT.md`

Good beginner pattern:

1. paste the handoff prompt
2. attach or open the listed markdown files
3. ask Codex to stay inside the current phase
4. ask Codex for a short handoff summary when done

## How To Work With Claude Code

Open:

- `CLAUDE_START_HERE.md`
- `CLAUDE_HANDOFF_PROMPT.md`
- the current phase folder

Give Claude Code:

- the root context files
- the current phase packet

Keep the conversation phase-scoped. Do not ask Claude Code to jump ahead into future phases unless you deliberately want to rewrite the plan.

## How To Work With OpenCode

Open:

- `OPENCODE_START_HERE.md`
- `OPENCODE_HANDOFF_PROMPT.md`
- `AGENTS.md`
- the current phase folder

OpenCode uses the same project package, just with its own startup guidance.

## How To Complete A Phase

A phase is usually complete when:

- the work matches the phase brief
- the entry gate was respected
- the exit gate is satisfied
- tests or checks were run
- the handoff summary is updated
- the verification report is filled out
- evidence files are listed
- `status` no longer points you to unresolved phase work

## How To Fill Verification

Open `VERIFICATION_REPORT.md`.

Use these exact values:

- `## result: pass`
- `## result: fail`
- `## result: pending`
- `## recommendation: proceed`
- `## recommendation: revise`
- `## recommendation: blocked`
- `## recommendation: pending`

Example of a real completed section:

```md
## result: pass
Selected result: pass

## recommendation: proceed
Selected recommendation: proceed

## evidence files
- phases/phase-01/EVIDENCE_CHECKLIST.md
- repo/manifest.json
```

Important:

- `- pending` is only a placeholder
- placeholder evidence does not count
- if you want to advance, list real files that exist

## How To Add Evidence

Evidence means the real files or records you used to justify your decision.

Good evidence examples:

- `phases/phase-01/EVIDENCE_CHECKLIST.md`
- `phases/phase-01/HANDOFF_SUMMARY.md`
- `repo/manifest.json`
- a test output file if your workflow created one
- a changed markdown file that proves the work was updated

Bad evidence examples:

- `- pending`
- vague notes like “looks good”
- hidden chat history

## How To Advance

Use:

```bash
npm run next-phase -- --package=.tmp-family-task-app/manoa-method-workspace --evidence=phases/phase-01/VERIFICATION_REPORT.md
```

If the command fails, read the error closely. Common reasons:

- result is still `pending`
- recommendation is `revise` or `blocked`
- evidence files are missing
- the package still has blockers

## How To Resume Tomorrow

You do not need to remember everything.

To resume:

1. open `START_HERE.md`
2. run `status`
3. open the current phase folder
4. read `HANDOFF_SUMMARY.md`
5. read `NEXT_PHASE_CONTEXT.md`

The local files are your saved memory.

## What Not To Do

- Do not work multiple phases at once.
- Do not skip verification.
- Do not mark a phase complete just because the agent says it is done.
- Do not use `pass + proceed` without real evidence files.
- Do not rely on memory or hidden chat context.
- Do not assume `validate` means the package is ready to advance.
- Do not treat Manoa Method as a hosted workflow tool.

## Beginner Checklist

- [ ] I ran `npm install`
- [ ] I created a workspace with `create-project`
- [ ] I opened `START_HERE.md`
- [ ] I read the project context files
- [ ] I found the current phase
- [ ] I gave the current phase packet to one agent
- [ ] I reviewed the output
- [ ] I filled out `VERIFICATION_REPORT.md`
- [ ] I listed real evidence files
- [ ] I ran `validate`
- [ ] I ran `status`
- [ ] I advanced only if the package was truly ready
