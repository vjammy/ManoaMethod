# Example: Family Task Board

A realistic worked example. Generate it, then walk through the artifacts to see what every file looks like in practice.

## Generate it

```bash
npm run create-project -- --input=examples/family-task-app.json --out=.tmp-family-task-app
```

You'll get `.tmp-family-task-app/mvp-builder-workspace/` with:

- 12 phases under `phases/phase-01/` through `phases/phase-12/`
- 15 numbered requirements in `requirements/FUNCTIONAL_REQUIREMENTS.md`
- 5 entities in `architecture/DATA_MODEL.md` and `SAMPLE_DATA.md` (Family Workspace, Family Member, Household Task, Completion Review, Reminder Rule)
- The full set of support folders: product-strategy, requirements, security-risk, integrations, architecture, ui-ux, recursive-test, auto-improve

## What the project is

A mobile-friendly web app for families to assign and track household tasks with:

- Parent and co-parent roles, plus child profiles managed by parents.
- Child-safe views (kids only see their own tasks).
- Parent approval for kid-completed tasks.
- Email reminder planning, mocked until live integration is approved.

It's a useful test case because it exercises:

- **Privacy and visibility rules** (children are sensitive users)
- **Role boundaries** (parent vs co-parent vs caregiver vs child)
- **Workflow states** (created → assigned → in-progress → awaiting-approval → done)
- **Mocked integrations** (email reminder service stays mocked in v1)

## Things to look at

### `PHASE_PLAN.md`
12 phases, mix of planning, design, implementation, verification, and finalization. Each phase has a `Requirement IDs:` line. Verification phases own all 15 REQs; design and implementation phases each own a subset.

### `requirements/ACCEPTANCE_CRITERIA.md`
15 requirements with Given/When/Then scenarios using sample fields like `workspaceId=family-home-001, householdName=Rivera Household`. Each criterion has:

- `Requirement ID: REQ-N`
- `Sample data: see SAMPLE_DATA.md "<entity>" section`
- `Inline reference: <field=value, ...>`

### `SAMPLE_DATA.md`
5 entities. Each has a "Used by requirements: REQ-X, REQ-Y" line, an "Owning phases" line, a happy-path JSON sample, and a negative-path JSON sample. For example, **Family Workspace**:

```json
{
  "workspaceId": "family-home-001",
  "householdName": "Rivera Household",
  "timezone": "America/New_York",
  "defaultVisibility": "assigned-only"
}
```

### `phases/phase-02/TEST_SCRIPT.md`
Phase 2 owns REQ-1, REQ-7, REQ-13. Open the file and look for the "Requirement-driven scenario tests" section — three blocks, each citing the relevant entity, the happy-path inputs, and the Given/When/Then.

### `phases/phase-04/TEST_SCRIPT.md`
Phase 4 is a verification phase, so it owns all 15 REQs. The "Executable verification" bash block is `npm run typecheck`, `npm run validate`, `npm run traceability` — different from implementation phases.

### `phases/phase-06/TEST_SCRIPT.md`
Phase 6 is an implementation phase. The bash block is `npm run typecheck && npm run build && npm run smoke && npm run validate`.

## Walk it as a user would

```bash
npm run validate -- --package=.tmp-family-task-app/mvp-builder-workspace
npm run status -- --package=.tmp-family-task-app/mvp-builder-workspace
npm run traceability -- --package=.tmp-family-task-app/mvp-builder-workspace
```

After traceability, open `repo/TRACEABILITY.md` — every REQ-ID is mapped to phases. No unmapped requirements.

## What it does NOT include

This example is the **planning workspace**, not a built application. There's no React code, no database, no running server. To build the actual app:

1. Hand the workspace to an AI agent (see [AGENTS.md](AGENTS.md)).
2. Walk phases sequentially.
3. Run `npm run auto-regression` once anything is buildable.

The auto-regression loop then drives the actual implementation against the requirements + sample data, scoring 0–100 and writing fix prompts back into the failing phase folders.
