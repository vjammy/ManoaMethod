import { checklistFor, phaseNames, profileDescriptions, slugify } from './templates';
import { scoreProject } from './scoring';
import type { GeneratedFile, ProjectInput } from './types';

function mdList(value: string) {
  const parts = value.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts.map((x) => `- ${x}`).join('\n') : '- TBD';
}
function phaseTitle(slug: string) {
  return slug.replace(/^\d+-/, '').split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
}
export function generateProjectFiles(input: ProjectInput): GeneratedFile[] {
  const profile = `${input.level}-${input.track}` as const;
  const score = scoreProject(input);
  const files: GeneratedFile[] = [];
  const add = (path: string, content: string) => files.push({ path, content: content.trimStart() + '\n' });

  add('README.md', `# ${input.productName}

Generated with **Xelera Method**.

## Product idea
${input.oneLineIdea || 'TBD'}

## Primary outcome
${input.primaryOutcome || 'TBD'}

## Selected profile
**${profile}** — ${profileDescriptions[profile]}

## Build readiness
**${score.total}/100 — ${score.rating}**
`);

  add('generated-artifacts/PROJECT_BRIEF.md', `# Project Brief

## Product name
${input.productName}

## One-line idea
${input.oneLineIdea}

## Primary outcome
${input.primaryOutcome}

## Target users
${input.targetUsers}
`);

  add('generated-artifacts/USER_PERSONAS.md', `# User Personas

## Primary users
${mdList(input.targetUsers)}

## Profile checklist
${checklistFor(profile).map((x) => `- ${x}`).join('\n')}
`);

  add('generated-artifacts/REQUIREMENTS.md', `# Requirements

## Must-have features
${mdList(input.mustHaveFeatures)}

## Nice-to-have features
${mdList(input.niceToHaveFeatures)}

## Constraints
${mdList(input.constraints)}
`);

  add('generated-artifacts/DATA_MODEL.md', `# Data Model

## Data and integrations
${mdList(input.dataAndIntegrations)}

## Core entities
- Project
- User profile
- Questionnaire response
- Generated artifact
- Phase
- Gate
- Review item
- Scorecard
- Handoff package
`);

  add('generated-artifacts/RISKS.md', `# Risks

${mdList(input.risks)}
`);

  add('generated-artifacts/OPEN_QUESTIONS.md', `# Open Questions

- What is the smallest useful v1?
- Which role has the strongest pain?
- What information must never be exposed to the wrong user?
- What tests must pass before launch?
`);

  add('generated-artifacts/PHASE_PLAN.md', `# Phase Plan

${phaseNames.map((name, index) => `${index + 1}. **${phaseTitle(name)}** — ${name}`).join('\n')}
`);

  add('generated-artifacts/GATES.md', `# Gates

Every phase has:
- ENTRY_CRITERIA.md
- WORK.md
- EXIT_CRITERIA.md
- REVIEW.md
- HANDOFF.md
`);

  for (const name of phaseNames) {
    const title = phaseTitle(name);
    add(`phases/${name}/ENTRY_CRITERIA.md`, `# ${title} — Entry Criteria

- Prior phase handoff has been reviewed, unless this is phase 1.
- Required inputs are present.
- Blockers are resolved or explicitly deferred.
`);
    add(`phases/${name}/WORK.md`, `# ${title} — Work

- Review artifacts.
- Identify gaps and edge cases.
- Update markdown files.
- Prepare proof that exit criteria are met.
`);
    add(`phases/${name}/EXIT_CRITERIA.md`, `# ${title} — Exit Criteria

- Output is understandable without chat history.
- Risks and open questions are updated.
- Review checklist has no unresolved critical blockers.
`);
    add(`phases/${name}/REVIEW.md`, `# ${title} — Review

- [ ] Preserves product north star
- [ ] Covers user needs and edge cases
- [ ] Clear enough for a coding agent
- [ ] Security/privacy assumptions visible
- [ ] Tests or acceptance criteria clear
`);
    add(`phases/${name}/HANDOFF.md`, `# ${title} — Handoff

## Completed
- TBD

## Changed files
- TBD

## Risks or blockers
- TBD

## Next phase instructions
- TBD
`);
  }

  add('scorecard/FINAL_SCORECARD.md', `# Final Scorecard

| Category | Score |
|---|---:|
| Discovery | ${score.discovery}/20 |
| Workflow clarity | ${score.workflow}/15 |
| Scope control | ${score.scope}/20 |
| Data/integrations | ${score.data}/15 |
| Risk handling | ${score.risk}/15 |
| Handoff completeness | ${score.handoff}/15 |
| **Total** | **${score.total}/100** |

## Rating
**${score.rating}**

## Recommendations
${score.recommendations.map((x) => `- ${x}`).join('\n')}
`);

  add('final-handoff/BUILD_HANDOFF.md', `# Build Handoff

## Product
${input.productName}

## Build objective
${input.primaryOutcome}

## Source of truth
Use this repo. Do not rely on chat history.

## Must build
${mdList(input.mustHaveFeatures)}

## Do not overbuild yet
${mdList(input.niceToHaveFeatures)}
`);

  add('final-handoff/STEP_BY_STEP_GUIDE.md', `# Step-by-Step Guide

1. Open README.md.
2. Review generated-artifacts/.
3. Resolve OPEN_QUESTIONS.md.
4. Complete phases in order.
5. Check entry criteria before work.
6. Validate exit criteria after work.
7. Fill review and handoff files.
8. Re-score before coding.
`);

  add('metadata/xelera-project.json', JSON.stringify({ slug: slugify(input.productName), input, score }, null, 2));
  return files;
}
