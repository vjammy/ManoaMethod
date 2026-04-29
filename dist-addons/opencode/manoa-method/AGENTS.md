# AGENTS

## Manoa Method agent rules
- Work one phase at a time.
- Read the current phase packet before editing anything.
- Do not skip entry gates.
- Do not bypass blockers.
- Do not silently mark phases complete.
- Run the phase test plan.
- Create or update verification evidence.
- Write or update the handoff summary before moving on.
- Do not modify future phase files unless explicitly instructed.

## Supported local agent workflows
- Codex
- Claude Code
- OpenCode

## Agent files
- `.opencode/agents/manoa-planner.md` — planning and scoping
- `.opencode/agents/manoa-gatekeeper.md` — gate review and blocker management
- `.opencode/agents/manoa-builder.md` — implementation
- `.opencode/agents/manoa-reviewer.md` — verification and review

## Commands
- `/manoa-plan` — create or update the planning package
- `/manoa-validate` — inspect lifecycle status and blockers
- `/manoa-phase` — load the current phase packet
- `/manoa-verify` — review implementation against criteria
- `/manoa-handoff` — create a compact handoff summary
- `/manoa-next` — move to the next phase with evidence
