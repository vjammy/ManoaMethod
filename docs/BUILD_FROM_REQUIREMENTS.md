# Build From Attached Requirements

## Purpose

This guide explains how to use Manoa Method when you already have a requirements document and want a coding agent to build from it.

This is the workflow behind prompts like:

"Requirements attached. Pull repo https://github.com/vjammy/manoa-method and use the Manoa Method step-by-step instructions to build the repo in the root."

## Recommended Operator Workflow

### 1. Prepare the input

Bring one or more of the following:

- product requirements document
- brief
- user stories
- scope notes
- constraints
- acceptance criteria

The clearer the input, the stronger the generated plan.

### 2. Give the agent the repo and the requirements

The agent should:

- pull `https://github.com/vjammy/manoa-method`
- read the repo guidance
- treat the markdown workflow as the source of truth
- build directly in the repo root

### 3. Require method compliance

The agent should not:

- skip the step-by-step workflow
- jump ahead across phases
- ignore gates
- rely on hidden chat context
- mark phases complete without evidence

### 4. Require a final handoff

The final output should state:

- what was built
- what passed
- what is deferred
- what the next action should be

## Strong Default Prompt

Use this when you are attaching requirements to Codex, Claude Code, or OpenCode:

```text
Requirements attached.

Pull repo: https://github.com/vjammy/manoa-method

Use the Manoa Method exactly as documented in the repository. Treat the repository’s markdown workflow as the source of truth. Do not rely on hidden chat context. Do not skip phase entry gates, exit gates, validation steps, or handoff updates.

Build directly in the repo root, not in a separate build folder.

Required workflow:
1. Read the start files and current-status guidance first.
2. Confirm the brief, scope, requirements, risks, and phase plan before implementation.
3. Work one phase at a time.
4. Keep changes inside the current phase scope.
5. Run the required validation, test, regression, and gate checks before advancing.
6. Record evidence, verification results, and handoff notes in the repo as you go.
7. Do not mark any phase complete without real pass/proceed evidence.
8. Finish with a final handoff summary that clearly states what was built, what passed, what remains deferred, and the next recommended action.
```

## Shorter Business-Friendly Prompt

Use this when the operator wants something simpler:

```text
Requirements attached.

Pull repo: https://github.com/vjammy/manoa-method

Use the Manoa Method step-by-step instructions in the repo to build this project in the repo root. Follow the phase workflow, do not skip gates, and keep the markdown files updated so the handoff is clear.
```

## What The Agent Should Read First

Inside the repo or generated workspace, the agent should start with:

1. `README.md`
2. `START_HERE.md` or the generated workspace start file
3. `CURRENT_STATUS.md`
4. `STEP_BY_STEP_BUILD_GUIDE.md`
5. `PROJECT_BRIEF.md`
6. `PHASE_PLAN.md`
7. the current phase packet

## What A Good Run Looks Like

A good agent run:

- restates the problem and scope clearly
- names blockers early
- follows the current phase
- keeps evidence updated
- explains what changed
- leaves the repo easier for the next builder to trust

## What A Bad Run Looks Like

A bad agent run:

- starts coding immediately from the raw requirements
- ignores the package structure
- spreads changes across unrelated areas
- claims completion without proof
- leaves no usable handoff

## Notes For Teams

If you are rolling this out across a team:

- keep the strong default prompt as the standard starting instruction
- require the final handoff summary in every build session
- ask reviewers to inspect evidence quality, not just output quality

That keeps the method from degrading into "prompt once and hope."
