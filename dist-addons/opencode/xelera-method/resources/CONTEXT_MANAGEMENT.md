# CONTEXT_MANAGEMENT

## Rule: markdown is the source of truth

All project context lives in markdown files. Do not rely on hidden chat history.

## Context packets

Each phase has a compact context packet:
- `PHASE_BRIEF.md` — what this phase is for
- `ENTRY_GATE.md` — what must be true before starting
- `EXIT_GATE.md` — what must be true before finishing
- `TEST_PLAN.md` — how to verify the phase
- `OPENCODE_BUILD_PROMPT.md` — OpenCode-specific build instructions

## Root context

Root files apply to every phase:
- `00_PROJECT_CONTEXT.md` — project anchors and current state
- `01_CONTEXT_RULES.md` — rules for all agents
- `AGENTS.md` — agent rules and responsibilities

## Handoff context

Between phases, use:
- `HANDOFF_SUMMARY.md` — what changed and what remains
- `NEXT_PHASE_CONTEXT.md` — what the next phase needs to know

## Keeping context small

- Only include files relevant to the current phase
- Do not paste unrelated earlier phase files
- Update state files after each phase
