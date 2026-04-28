# CONTEXT_MANAGEMENT

Xelera Method is designed around small, explicit context packets rather than long, growing chat sessions across Codex, Claude Code, and OpenCode.

## Root context files

- `00_PROJECT_CONTEXT.md`
- `01_CONTEXT_RULES.md`
- `AGENTS.md`
- `00_APPROVAL_GATE.md`
- `PROJECT_BRIEF.md`
- `PHASE_PLAN.md`
- `repo/manifest.json`
- `repo/xelera-state.json`

## Phase context packet

Each phase folder contains the minimum recommended packet for an implementation pass:

- `PHASE_BRIEF.md`
- `ENTRY_GATE.md`
- `CODEX_BUILD_PROMPT.md`
- `CLAUDE_BUILD_PROMPT.md`
- `OPENCODE_BUILD_PROMPT.md`
- `EXIT_GATE.md`
- `TEST_PLAN.md`
- `HANDOFF_SUMMARY.md`
- `NEXT_PHASE_CONTEXT.md`
- `VERIFY_PROMPT.md`
- `EVIDENCE_CHECKLIST.md`
- `VERIFICATION_REPORT.md`

## Verification artifacts

Three files govern whether a phase can advance:

- **VERIFY_PROMPT.md** — checklist-driven prompt for reviewing phase completion
- **EVIDENCE_CHECKLIST.md** — concrete required evidence, commands, and files
- **VERIFICATION_REPORT.md** — parser-friendly result and recommendation

Accepted values in `VERIFICATION_REPORT.md`:

- **result**: `pass` | `fail` | `pending`
- **recommendation**: `proceed` | `revise` | `blocked` | `pending`

Legacy `Selected result:` and `Selected recommendation:` lines are still accepted as fallback, but new reports should use the parser-friendly `## result:` and `## recommendation:` headers.

Phases advance only when `result: pass` and `recommendation: proceed` are present, with evidence files listed under `## evidence files` and present on disk. Manual approval (`--approve=true`) is recorded as `manualApproval: true` and remains auditable.

## Why this matters

- Smaller packets reduce context drift.
- Explicit phase handoffs make it easier to resume work later.
- The package stays usable in Codex, Claude Code, OpenCode, or a human-led implementation workflow without hidden state.
