# Using with Claude Code

Claude Code-specific entry points. The universal rules and per-phase loop are in [AGENTS.md](AGENTS.md) — read that first.

## Inside a generated workspace

| File | When to use |
|---|---|
| `CLAUDE_START_HERE.md` | Read first; lists the read-order |
| `CLAUDE_HANDOFF_PROMPT.md` | Paste as the first message of a Claude Code session |
| `phases/phase-NN/CLAUDE_BUILD_PROMPT.md` | Hand to Claude Code when starting that phase |
| `03_HOW_TO_USE_WITH_CLAUDE_CODE.md` | Claude Code-specific operating notes |

## Recommended flow

1. Run Claude Code from the workspace root so it has full file access.
2. Paste `CLAUDE_HANDOFF_PROMPT.md` as the first message.
3. Reference `phases/phase-NN/CLAUDE_BUILD_PROMPT.md` when starting a phase.
4. Claude Code can run `npm run validate`, `npm run loop`, and `npm run auto-regression` directly — let it.

## With chrome-devtools MCP

If your Claude Code session has the chrome-devtools MCP server connected, Claude can navigate the running app, capture snapshots, and check console errors directly. That replaces the need to install Playwright in the workspace for ad-hoc UI checks.

For the canonical 0–100 score, you still want `npm run loop:browser` (which uses Playwright). They serve different purposes:

- **chrome-devtools MCP**: agent-driven exploration, ad-hoc checks.
- **`loop:browser`**: deterministic scoring against `requirements/ACCEPTANCE_CRITERIA.md` and `SAMPLE_DATA.md`.

## After implementation phases ship

Run `npm run auto-regression` to score the build 0–100 and let any failures flow back into specific phase folders for rework. See [AUTO_REGRESSION.md](AUTO_REGRESSION.md).

## See also

- [AGENTS.md](AGENTS.md) — universal agent rules.
- [WORKSPACE.md](WORKSPACE.md) — every file in a generated workspace.
- [WORKFLOW.md](WORKFLOW.md) — the 9 steps end-to-end.
