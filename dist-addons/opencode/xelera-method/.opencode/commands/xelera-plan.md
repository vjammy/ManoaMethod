# /xelera-plan

## Purpose
Create or update the planning package before coding begins.

## When to use
- At the start of a new project
- When the brief has changed significantly
- Before handing off to another agent or session

## Files to read
- `00_PROJECT_CONTEXT.md`
- `01_CONTEXT_RULES.md`
- `PROJECT_BRIEF.md`
- `PHASE_PLAN.md`
- `00_APPROVAL_GATE.md`
- `repo/manifest.json`
- `repo/xelera-state.json`

## What to do
1. Read the project context and brief.
2. Confirm the selected profile and mode.
3. Verify the phase plan matches the current scope.
4. Update any planning artifacts that are stale or incomplete.
5. Record the planning state in `repo/xelera-state.json`.

## What not to do
- Do not start implementation during planning.
- Do not skip the approval gate review.
- Do not modify phase files for future phases.

## Success criteria
- Planning package is current and consistent.
- All root context files exist and are readable.
- Lifecycle status is recorded.
