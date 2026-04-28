# AGENTS

## Xelera Method agent rules
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
- `.opencode/agents/xelera-planner.md` — planning and scoping
- `.opencode/agents/xelera-gatekeeper.md` — gate review and blocker management
- `.opencode/agents/xelera-builder.md` — implementation
- `.opencode/agents/xelera-reviewer.md` — verification and review

## Commands
- `/xelera-plan` — create or update the planning package
- `/xelera-validate` — inspect lifecycle status and blockers
- `/xelera-phase` — load the current phase packet
- `/xelera-verify` — review implementation against criteria
- `/xelera-handoff` — create a compact handoff summary
- `/xelera-next` — move to the next phase with evidence
