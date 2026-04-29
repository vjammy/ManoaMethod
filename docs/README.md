# Documentation Guide

This folder explains Manoa Method from three angles:

- what the method is
- why the method uses gates, evidence, and handoffs
- how business users and technical builders should actually run it

## Start Here

If you are new to the repo, read these files in order:

1. [README.md](../README.md)
2. [METHODOLOGY.md](./METHODOLOGY.md)
3. [BEST_PRACTICES.md](./BEST_PRACTICES.md)
4. [BUILD_FROM_REQUIREMENTS.md](./BUILD_FROM_REQUIREMENTS.md)

## Pick Your Lane

- Business users: [BUSINESS_USER_WORKFLOW.md](./BUSINESS_USER_WORKFLOW.md)
- Technical builders: [TECHNICAL_BUILDER_WORKFLOW.md](./TECHNICAL_BUILDER_WORKFLOW.md)
- Codex: [USING_WITH_CODEX.md](./USING_WITH_CODEX.md)
- Claude Code: [USING_WITH_CLAUDE_CODE.md](./USING_WITH_CLAUDE_CODE.md)
- OpenCode: [USING_WITH_OPENCODE.md](./USING_WITH_OPENCODE.md)

## Core Concepts

- Method overview: [METHODOLOGY.md](./METHODOLOGY.md)
- Best practices: [BEST_PRACTICES.md](./BEST_PRACTICES.md)
- Orchestrator: [ORCHESTRATOR.md](./ORCHESTRATOR.md)
- Beginner guide: [NOVICE_GUIDE.md](./NOVICE_GUIDE.md)
- Quick commands: [QUICKSTART.md](./QUICKSTART.md)
- Troubleshooting: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- Glossary: [GLOSSARY.md](./GLOSSARY.md)

## Recommended Reading Order For Teams

1. Product owner or business lead reads [BUSINESS_USER_WORKFLOW.md](./BUSINESS_USER_WORKFLOW.md).
2. Technical lead reads [TECHNICAL_BUILDER_WORKFLOW.md](./TECHNICAL_BUILDER_WORKFLOW.md).
3. Both read [BEST_PRACTICES.md](./BEST_PRACTICES.md).
4. The actual builder reads the agent-specific guide plus the generated workspace start files.

## What This Documentation Is Trying To Prevent

These docs are designed to prevent the most common AI-assisted build failures:

- starting implementation before the requirements are specific
- letting scope expand silently
- treating agent output as proof
- skipping tests and calling the phase done anyway
- losing context between sessions
- leaving the next builder dependent on private chat history
