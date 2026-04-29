# Build from Attached Requirements

How to use MVP Builder when you already have a requirements document (PDF, Notion, Confluence, README, ticket dump, etc.) and want an AI agent to build the actual solution.

## High-level flow

1. Hand the agent the requirements doc and the URL to this repo.
2. Ask the agent to use MVP Builder to plan the project before coding.
3. The agent translates your requirements into a `ProjectInput` JSON, runs `npm run create-project`, and starts walking phases.
4. Once anything is buildable, the agent runs `npm run auto-regression` to score the build against the requirements.

## What to give the agent

- The requirements (attach the file, paste the contents, or link to it).
- This repo URL: `https://github.com/vjammy/mvp-builder`.
- These instructions:

> Use MVP Builder to turn the attached requirements into a robust production-ready application. Build in the repo root. Follow the MVP Builder phase, gate, validation, and handoff workflow. Use `npm run auto-regression` to score the result.

## What the agent should do

1. **Translate the requirements into a `ProjectInput` JSON.** Format matches `examples/family-task-app.json`. Required fields: `productName`, `level`, `track`, `productIdea`, `targetAudience`, `problemStatement`, `mustHaveFeatures`, `desiredOutput`, `questionnaireAnswers`.
2. **Generate the workspace:** `npm run create-project -- --input=<file> --out=<dir>`.
3. **Validate it:** `npm run validate -- --package=<dir>/mvp-builder-workspace`.
4. **Walk the phases sequentially** per [AGENTS.md](AGENTS.md). For each phase: read brief, build, run `TEST_SCRIPT.md`, record evidence in `TEST_RESULTS.md`, advance.
5. **Run auto-regression** once any implementation phase produces runnable code. See [AUTO_REGRESSION.md](AUTO_REGRESSION.md).
6. **On rework:** read `phases/phase-NN/REWORK_PROMPT_*.md` and the appended "Auto-regression failures" block in `TEST_RESULTS.md`. Fix the code, re-record evidence, re-run.

## Translating loose requirements

Requirements docs vary. Map them like this:

| Source content | Goes into ProjectInput field |
|---|---|
| Project name / title | `productName` |
| One-line elevator pitch | `productIdea` |
| Background / context | `problemStatement` |
| Stakeholders, personas | `targetAudience` |
| MVP scope | `mustHaveFeatures` |
| Deferred / future scope | `niceToHaveFeatures` |
| Out of scope | `nonGoals` |
| Constraints / non-functional | `constraints` |
| Risks | `risks` |
| Success criteria / KPIs | `successMetrics` |
| Ship date / phasing | `timeline` |
| Team setup | `teamContext` |

If something doesn't map cleanly, stash it in `questionnaireAnswers` under the matching key (`north-star`, `primary-workflow`, `data-boundaries`, etc.). See `lib/templates.ts > buildQuestionPrompts` for the full set of question IDs.

## When the requirements are vague

Ask the user for clarification before generating the workspace. The generator will produce a usable plan even from sparse input, but vague briefs trigger blocker warnings and the package will land in `lifecycleStatus: Blocked`. That's a feature — vague input shouldn't silently produce a confident plan.

## Production target

Set `BUILD_TARGET.md` to `Production application` if the requirements imply a live deployment. The generator emits `PRODUCTION_SCOPE.md`, `DEPLOYMENT_PLAN.md`, `OPERATIONS_RUNBOOK.md`, `INCIDENT_RESPONSE_GUIDE.md`, `ROLLBACK_PLAN.md`, `RELEASE_CHECKLIST.md`, and `PRODUCTION_GATE.md` — all part of the same workspace. See `MVP_BUILDER_PRODUCTION_BUILD_PROMPT.md` for the reusable production prompt.

## See also

- [WORKFLOW.md](WORKFLOW.md) — the 9 steps end-to-end.
- [AGENTS.md](AGENTS.md) — driving Codex / Claude Code / OpenCode.
- [MVP_BUILDER_PRODUCTION_BUILD_PROMPT.md](MVP_BUILDER_PRODUCTION_BUILD_PROMPT.md) — full production prompt.
