# XELERA_METHOD

## What is Xelera Method?

Xelera Method is a local, markdown-first planning, gating, handoff, verification, and context-management system for AI-assisted builds.

## Core principles
- **Local-first**: all artifacts are local markdown files
- **Deterministic**: same input produces same output
- **Agent-friendly**: optimized for Codex, Claude Code, and OpenCode
- **Evidence-based**: phase progression requires verification
- **No external dependencies**: no database, auth, or cloud required

## Workflow
1. Plan: create the project package with brief, phases, and gates
2. Validate: check lifecycle status, blockers, and readiness
3. Build: work one phase at a time with entry/exit gates
4. Verify: review implementation against criteria
5. Handoff: summarize work and prepare next phase context
6. Next: advance only with evidence or explicit approval

## Package structure
- Root context files: `00_PROJECT_CONTEXT.md`, `01_CONTEXT_RULES.md`, `AGENTS.md`
- Agent start files: `CODEX_START_HERE.md`, `CLAUDE_START_HERE.md`, `OPENCODE_START_HERE.md`
- Phase folders: `phases/phase-XX/` with brief, gates, prompts, tests, and verification
- State files: `repo/manifest.json`, `repo/xelera-state.json`

## Commands
- `/xelera-plan` — create or update planning package
- `/xelera-validate` — inspect status and blockers
- `/xelera-phase` — load current phase packet
- `/xelera-verify` — review implementation
- `/xelera-handoff` — create handoff summary
- `/xelera-next` — advance phase with evidence
