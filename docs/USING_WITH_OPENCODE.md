# Using with OpenCode

OpenCode-specific entry points. The universal rules and per-phase loop are in [AGENTS.md](AGENTS.md) — read that first.

## Inside a generated workspace

| File | When to use |
|---|---|
| `OPENCODE_START_HERE.md` | Read first; lists the read-order |
| `OPENCODE_HANDOFF_PROMPT.md` | Paste as the first message of an OpenCode session |
| `phases/phase-NN/OPENCODE_BUILD_PROMPT.md` | Hand to OpenCode when starting that phase |
| `04_HOW_TO_USE_WITH_OPENCODE.md` | OpenCode-specific operating notes |

## Recommended flow

1. Open `OPENCODE_START_HERE.md` for the read-order list.
2. Paste `OPENCODE_HANDOFF_PROMPT.md` to start a session.
3. Drive each phase using the matching `OPENCODE_BUILD_PROMPT.md`.
4. Use `npm run validate` and `npm run next-phase` between phases.

## After implementation phases ship

Run `npm run auto-regression` to score the build 0–100 and let any failures flow back into specific phase folders for rework. See [AUTO_REGRESSION.md](AUTO_REGRESSION.md).

## See also

- [AGENTS.md](AGENTS.md) — universal agent rules.
- [WORKSPACE.md](WORKSPACE.md) — every file in a generated workspace.
- [WORKFLOW.md](WORKFLOW.md) — the 9 steps end-to-end.
