# GLOSSARY

## Xelera Method

A local, markdown-first planning and gating system for AI-assisted builds.

## package

The generated set of markdown and JSON files that describes a project, its phases, gates, verification, and handoff state.

## workspace

The local folder created by `create-project`. In practice, “package” and “workspace” are often used together.

## project context

The root files that explain what the project is, what rules matter, and what blockers or assumptions already exist.

## phase

One chunk of work in the project plan. You should normally work one phase at a time.

## phase brief

The file `PHASE_BRIEF.md`. It explains the goal of the current phase, why it exists, and what files to give the coding agent.

## entry gate

The checklist that must be true before you start work on a phase.

## exit gate

The checklist that must be true before you call a phase complete.

## verification

The review step where you check whether the phase really meets its goal and gates.

## evidence

The real files or records you reviewed to justify your verification decision.

## handoff

The summary and context you leave for the next builder, next agent, or your future self.

## next phase context

The file `NEXT_PHASE_CONTEXT.md`. It tells the next phase what it should inherit from the current one.

## status

The CLI command that explains the current phase, lifecycle state, verification state, evidence state, and next recommended action.

## validate

The CLI command that checks whether the generated package has the files and verification structure it needs.

## next-phase

The CLI command that advances the project to the next phase after the current one has passed its gate.

## approved for build

A lifecycle meaning that says the package has explicit approval metadata and is ready for build execution.

## blocked

A status that means the package or phase has unresolved blockers and cannot safely advance yet.

## pending

A status that means review or completion is still in progress.

## proceed

A verification recommendation that says the phase is ready to move forward.

## revise

A verification recommendation that says the phase needs more work before advancing.

## pass

A verification result that says the reviewed phase met its checks.

## fail

A verification result that says the reviewed phase did not meet its checks.

## agent-agnostic

Designed to work with different coding agents instead of being locked to only one.

## markdown-first

The main source of truth is plain markdown files that humans and agents can read easily.

## local-first

The workspace lives on your machine and does not depend on a hosted SaaS workflow.
