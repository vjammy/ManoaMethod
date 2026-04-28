# /xelera-validate

## Purpose
Inspect lifecycle status, blockers, warnings, approval gate, current phase readiness, and verification state.

## When to use
- Before starting work on a phase
- After completing a phase
- When something feels inconsistent

## Files to read
- `repo/manifest.json`
- `repo/xelera-state.json`
- `00_APPROVAL_GATE.md`
- Current phase `PHASE_BRIEF.md`
- Current phase `ENTRY_GATE.md`

## What to do
1. Read the manifest and state files.
2. Check for unresolved blockers.
3. Verify warning counts match expectations.
4. Confirm the current phase is ready for work.
5. Report any inconsistencies.

## What not to do
- Do not modify files during validation unless fixing a clear inconsistency.
- Do not ignore blocker warnings.

## Success criteria
- All verification files exist.
- State file has phaseEvidence fields.
- Manifest and state are consistent.
- Current phase has not advanced without approval/evidence.
- Supported agents includes codex, claude-code, and opencode.
- OpenCode root files and phase files exist.
