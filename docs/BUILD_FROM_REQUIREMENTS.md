# Build From Attached Requirements

## Purpose

This guide explains how to use Manoa Method when you already have requirements and want a coding agent to build the actual solution from them.

This is the workflow behind prompts like:

"Requirements attached. Pull repo https://github.com/vjammy/manoa-method and use the Manoa Method workflow to build the production-ready application in the repo root."

The important clarification is this:

- the agent is not just reviewing the requirements
- the agent is not just generating planning notes
- the agent is building the real application

Manoa Method is the workflow used to take the project from raw requirements to a robust production-ready end state.

## Where The Requirements May Live

The requirements may be provided in any of these places:

- attached in the conversation
- written directly in the prompt
- stored in the repo root
- stored in another folder in the repository

The first job of the builder is to locate those requirements and treat them as the source input for the build.

## Recommended Operator Workflow

### 1. Prepare the input

Bring one or more of the following:

- product requirements document
- brief
- user stories
- scope notes
- constraints
- acceptance criteria

The clearer the input, the stronger the build.

### 2. Give the agent the repo and the requirements

The agent should:

- pull `https://github.com/vjammy/manoa-method`
- locate the requirements wherever they were provided
- treat those requirements as the source of truth for the solution
- read the repo guidance
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

## The End State

The intended end state is:

- the requirements are implemented
- the application is robust
- the application is production-ready
- the repo contains accurate phase, verification, and handoff records

The method is not the end product. The production-ready application is the end product. The method is how the team gets there with discipline.

## Strong Default Prompt

Use this when you are attaching requirements to Codex, Claude Code, or OpenCode:

```text
You are building the real solution, not just reviewing requirements or producing planning notes.

The product requirements are either:
- attached in this conversation
- written directly in this prompt
- or stored in the repo root or another folder in the repository

Your first job is to find and read those requirements.

Repository:
https://github.com/vjammy/manoa-method

Goal:
Build a robust production-ready application in the repo root based on those requirements.

Method:
Use the Manoa Method workflow in this repository to get from requirements to the finished application. Use the method as the delivery system for the build, not as a separate documentation exercise.

Instructions:
1. Locate and read the requirements wherever they were provided.
2. Treat those requirements as the source of truth for what must be built.
3. Read the repo start files and current-status guidance first.
4. Use the Manoa Method to clarify scope, plan phases, enforce gates, verify progress, and maintain handoff quality.
5. Build the actual application directly in the repo root.
6. Work phase by phase. Do not skip entry gates, exit gates, validation, testing, regression checks, or handoff updates.
7. Keep the markdown workflow files updated as you go so project state stays explicit and reusable.
8. Do not rely on hidden chat context. Put important decisions, blockers, scope changes, and verification results into the repo's documented workflow.
9. Finish with a final handoff summary that clearly states what was built, what passed, what remains deferred, and the next recommended action.

Definition of success:
- the requirements are implemented
- the application is production-ready
- the build is validated and tested
- the repo reflects real phase progress and evidence
- the final handoff clearly states what was built, what passed, what remains deferred, and the next recommended action
```

## Shorter Business-Friendly Prompt

Use this when the operator wants something simpler:

```text
You are building the actual solution.

The requirements are either attached here, written in this prompt, or stored somewhere in the repository.

Pull repo: https://github.com/vjammy/manoa-method

Find the requirements first, then use the Manoa Method workflow in the repo to build a production-ready application in the repo root. Follow the phase workflow, do not skip gates, and keep the markdown files updated so the handoff is clear.
```

## Why This Prompt Shape Works Better

This wording is stronger because it makes five things explicit:

1. the agent is expected to build the real product
2. the agent must first locate the requirements
3. the requirements may live in several places
4. the desired outcome is a production-ready application
5. Manoa Method is the workflow for reaching that end state

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

- identifies where the requirements actually live
- restates the problem and scope clearly
- explains that it is building the real application
- names blockers early
- follows the current phase
- keeps evidence updated
- explains what changed
- leaves the repo easier for the next builder to trust

## What A Bad Run Looks Like

A bad agent run:

- fails to identify where the real requirements live
- treats the task like a documentation exercise only
- starts coding without clarifying whether the requirements are in the prompt, attachments, root, or another folder
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
