# Driving Agents

How to use a generated workspace with Codex, Claude Code, or OpenCode. The workflow is the same; only the entry files differ.

## Universal rules

Every agent should be told to:

1. Use the markdown files in the workspace as the **source of truth**. Do not rely on chat history.
2. **Work one phase at a time**. Do not jump ahead.
3. **Respect entry and exit gates**. Do not advance without recorded evidence.
4. **Use `SAMPLE_DATA.md`** for any test or demo input. Do not invent values.
5. **Record evidence** in `phases/phase-NN/TEST_RESULTS.md` under `Scenario evidence: REQ-N` blocks before claiming a REQ is done.
6. **Do not relax** `SAMPLE_DATA.md`, `TEST_SCRIPT.md`, or `RUNTIME_TARGET.md` to make a failing loop pass. Fix the application instead.

## The phase loop

For each phase NN:

1. Open `phases/phase-NN/PHASE_BRIEF.md` and `phases/phase-NN/ENTRY_GATE.md`.
2. Open the agent-specific build prompt (see below).
3. Build per the prompt + `phases/phase-NN/TEST_PLAN.md`.
4. Run `phases/phase-NN/TEST_SCRIPT.md` — every "Requirement-driven scenario test" must be exercised against the running app, with happy-path and negative-path inputs from `SAMPLE_DATA.md`.
5. Record results in `phases/phase-NN/TEST_RESULTS.md`. Set `## Final result: pass` only when every owned REQ has a populated `Scenario evidence: REQ-N` block.
6. Fill in `phases/phase-NN/VERIFICATION_REPORT.md` with `result`, `recommendation`, and `## evidence files` listing real on-disk files.
7. Run `npm run validate` and `npm run next-phase`.

## Codex

**Start file (root of workspace):** `CODEX_START_HERE.md`
**Per-phase build prompt:** `phases/phase-NN/CODEX_BUILD_PROMPT.md`
**Handoff prompt for a fresh session:** `CODEX_HANDOFF_PROMPT.md`

Recommended flow:

1. Open `CODEX_START_HERE.md`. It lists the read-first files.
2. Paste `CODEX_HANDOFF_PROMPT.md` as the first message of a session.
3. Attach the current phase folder (`phases/phase-NN/*`) plus root context (`PROJECT_BRIEF.md`, `PHASE_PLAN.md`, `01_CONTEXT_RULES.md`).
4. Run loops with the agent monitoring output.

## Claude Code

**Start file (root of workspace):** `CLAUDE_START_HERE.md`
**Per-phase build prompt:** `phases/phase-NN/CLAUDE_BUILD_PROMPT.md`
**Handoff prompt for a fresh session:** `CLAUDE_HANDOFF_PROMPT.md`

Recommended flow:

1. Run Claude Code from the workspace root so it has access to all files.
2. Paste the contents of `CLAUDE_HANDOFF_PROMPT.md` to bootstrap context.
3. Reference `phases/phase-NN/CLAUDE_BUILD_PROMPT.md` when starting a phase.
4. Use the loops directly — Claude Code can run `npm run validate`, `npm run loop`, `npm run auto-regression`.

If Claude Code has the chrome-devtools MCP server connected, `loop:browser` is not needed for ad-hoc UI checks; the agent can navigate directly. The loop is still the canonical 0–100 scorer — see [AUTO_REGRESSION.md](AUTO_REGRESSION.md).

## OpenCode

**Start file (root of workspace):** `OPENCODE_START_HERE.md`
**Per-phase build prompt:** `phases/phase-NN/OPENCODE_BUILD_PROMPT.md`
**Handoff prompt for a fresh session:** `OPENCODE_HANDOFF_PROMPT.md`

Recommended flow:

1. Open `OPENCODE_START_HERE.md` for the read-order list.
2. Paste `OPENCODE_HANDOFF_PROMPT.md` to start a session.
3. Drive each phase using the OpenCode build prompt.

## Browser automation

Auto-regression's browser layer is documented in `BROWSER_AUTOMATION_GUIDE.md` (inside every generated workspace). Two paths:

- **Chrome DevTools MCP** — best for agents with the MCP client (e.g. Claude Code with chrome-devtools MCP installed).
- **Playwright** — install in the workspace itself: `npm install --save-dev playwright && npx playwright install chromium`. Required for `npm run loop:browser`.

The mandatory assertion checklist is the same for both:

1. Base URL responds with status 200.
2. Page contains a non-empty title.
3. No uncaught console errors after first paint.
4. Each must-have feature reaches a visible success state.
5. Capture a snapshot or screenshot per state change.

## When the loop fails

After `npm run auto-regression` exits non-zero:

1. Read `evidence/runtime/AUTO_REGRESSION_FIX_PROMPT_iteration-NN.md` for the combined punch list.
2. Read `phases/phase-NN/REWORK_PROMPT_auto-regression-iteration-NN_attempt-MM.md` in each affected phase folder.
3. State has rolled back to the earliest failing phase. Resume work there.
4. Fix the code, re-record evidence in the phase's `TEST_RESULTS.md`, re-run auto-regression.

See [AUTO_REGRESSION.md](AUTO_REGRESSION.md) for the rework flow in detail.
