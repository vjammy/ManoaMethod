# Novice Guide

A slower-paced version of [QUICKSTART.md](QUICKSTART.md). Same destination, more hand-holding.

## What MVP Builder is, in plain English

You give it a rough product idea. It generates a folder full of markdown files that explain the project, break it into small phases, and tell an AI coding agent exactly what to build, what to test, and what to prove before moving on.

The goal: keep the plan in **files**, not in chat history. The next person (or agent) should be able to pick up the project without asking you anything.

## What you need

- A computer with Node 20+ and `npm` installed.
- A terminal open in this repo.
- A coding agent you want to use: Codex, Claude Code, or OpenCode.

## One-time setup

```bash
npm install
npm run typecheck
```

Both should finish without errors.

## The three things you'll do over and over

1. **Generate** a workspace from a project idea (or example).
2. **Drive** an AI agent through one phase.
3. **Verify** the phase passed before advancing.

Once you've shipped enough phases that the app actually runs, you also start running the **auto-regression loop** (step 9) to score it 0–100.

## First run — generate the family-task example

```bash
npm run create-project -- --input=examples/family-task-app.json --out=.tmp-demo
```

You'll see:

```
Created artifact package at .tmp-demo/mvp-builder-workspace
```

Open that folder. The most important file is **`START_HERE.md`** — it tells you what else to read.

## What to actually read first

In order:

1. `START_HERE.md` — the master entry point.
2. `BUSINESS_USER_START_HERE.md` — plain-English overview if you're not technical.
3. `PROJECT_BRIEF.md` — what is being built.
4. `PHASE_PLAN.md` — the phase sequence.
5. `SAMPLE_DATA.md` — sample inputs the tests will use.

## How phases work

Inside the workspace there's a folder `phases/phase-01/` (then `phase-02/`, `phase-03/`, ...). Each phase folder contains:

- **What to do** — `PHASE_BRIEF.md`.
- **When you can start** — `ENTRY_GATE.md`.
- **What the agent should do** — `CODEX_BUILD_PROMPT.md`, `CLAUDE_BUILD_PROMPT.md`, `OPENCODE_BUILD_PROMPT.md`.
- **How to test it** — `TEST_PLAN.md`, `TEST_SCRIPT.md`.
- **Where to record results** — `TEST_RESULTS.md`.
- **How to verify** — `VERIFY_PROMPT.md`, `EVIDENCE_CHECKLIST.md`, `VERIFICATION_REPORT.md`.
- **What to leave for the next phase** — `HANDOFF_SUMMARY.md`, `NEXT_PHASE_CONTEXT.md`.

You only ever work on **one phase at a time**.

## Driving phase 1 with an AI agent

1. Pick your agent and open `CODEX_START_HERE.md` (or `CLAUDE_START_HERE.md` / `OPENCODE_START_HERE.md`) at the workspace root.
2. Paste `CODEX_HANDOFF_PROMPT.md` (or the matching one) into the agent as your first message.
3. Tell the agent which phase you're on and attach the phase folder files.
4. Let it build.

## Verifying that phase 1 actually passed

After the agent says "done":

1. Open `phases/phase-01/VERIFY_PROMPT.md`. Follow it.
2. Run or follow `phases/phase-01/TEST_SCRIPT.md`. There's a "Requirement-driven scenario tests" section — every REQ-ID listed must be exercised once with the happy-path sample from `SAMPLE_DATA.md` and once with the negative-path sample.
3. Open `phases/phase-01/TEST_RESULTS.md`. Replace the pending values:
   - `## Final result: pass` (if it passed).
   - For each REQ exercised, paste your observation under a `Scenario evidence: REQ-N` heading.
4. Open `phases/phase-01/VERIFICATION_REPORT.md`. Set `result`, `recommendation`, and list the evidence files you produced.

## Advancing

```bash
npm run next-phase -- --package=.tmp-demo/mvp-builder-workspace --evidence=phases/phase-01/VERIFICATION_REPORT.md
```

If it refuses, the error tells you what's missing. Common causes:

- Result is still `pending`.
- Evidence files don't exist on disk.
- The recommendation is `revise` or `blocked`.

Fix and re-run.

## When you have something running

Once the app actually runs (usually after the first implementation phase), you can run the auto-regression loop:

```bash
npm run auto-regression -- --package=.tmp-demo/mvp-builder-workspace
```

It will:

- Build the app.
- Run every phase's `TEST_SCRIPT.md` bash commands.
- Hit the URL declared in `RUNTIME_TARGET.md`.
- (If Playwright is installed) drive a real browser and check that every requirement's sample data shows up on the page.
- Score it 0–100.
- If below 90, write a fix prompt and tell you which phase to go back to.

If you want the browser layer:

```bash
npm install --save-dev playwright
npx playwright install chromium
```

(Inside the workspace, not in the MVP Builder repo.)

## What if something breaks

Open [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Common symptoms have direct fixes there.

## What to read next

- [QUICKSTART.md](QUICKSTART.md) — the same flow, faster.
- [WORKFLOW.md](WORKFLOW.md) — what each step produces.
- [WORKSPACE.md](WORKSPACE.md) — what every file is for.
- [GLOSSARY.md](GLOSSARY.md) — look up any term.
