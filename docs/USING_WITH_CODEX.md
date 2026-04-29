# Using with Codex

Codex-specific entry points. The universal rules and per-phase loop are in [AGENTS.md](AGENTS.md) — read that first.

## Inside a generated workspace

| File | When to use |
|---|---|
| `CODEX_START_HERE.md` | Read first; lists the read-order |
| `CODEX_HANDOFF_PROMPT.md` | Paste as the first message of a Codex session |
| `phases/phase-NN/CODEX_BUILD_PROMPT.md` | Hand to Codex when starting that phase |
| `02_HOW_TO_USE_WITH_CODEX.md` | Codex-specific operating notes |

## Recommended flow

1. Open the workspace in your editor and let Codex see it.
2. Paste `CODEX_HANDOFF_PROMPT.md` as the first message.
3. Tell Codex which phase you're on: "Work phase 1 from the file `phases/phase-01/CODEX_BUILD_PROMPT.md`."
4. After the build, run `npm run validate`, follow `phases/phase-NN/VERIFY_PROMPT.md`, then `npm run next-phase`.

## After implementation phases ship

Run `npm run auto-regression` to score the build 0–100 and let any failures flow back into specific phase folders for rework. See [AUTO_REGRESSION.md](AUTO_REGRESSION.md).

## See also

- [AGENTS.md](AGENTS.md) — universal agent rules.
- [WORKSPACE.md](WORKSPACE.md) — every file in a generated workspace.
- [WORKFLOW.md](WORKFLOW.md) — the 9 steps end-to-end.
