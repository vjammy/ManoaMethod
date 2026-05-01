/**
 * Generate product-strategy/VALUE_PROPOSITION.md from research extractions.
 * Sources: meta.discovery.valueProposition + meta.discovery.whyNow.
 *
 * Phase E4 audit dimension `idea-clarity` rewards a non-generic headline,
 * a one-line problem statement that is not "the application helps users",
 * and three concrete outcomes.
 */
import type { ResearchExtractions } from '../research/schema';

const GENERIC_PHRASES = [
  /the application helps/i,
  /the system helps/i,
  /better experience/i,
  /improved efficiency/i,
  /streamline/i
];

function isGeneric(text: string): boolean {
  return GENERIC_PHRASES.some((p) => p.test(text));
}

export function renderValuePropositionMarkdown(ex: ResearchExtractions): string {
  const vp = ex.meta.discovery?.valueProposition;
  const wn = ex.meta.discovery?.whyNow;
  if (!vp && !wn) {
    return `# VALUE_PROPOSITION

> No value proposition was extracted. Run the recipe (Pass 0) to populate \`meta.discovery.valueProposition\` and \`meta.discovery.whyNow\`.
`;
  }

  const headline = vp?.headline || '_missing — fill before Phase 1 work begins_';
  const problem = vp?.oneLineProblem || '_missing_';
  const solution = vp?.oneLineSolution || '_missing_';
  const outcomes = vp?.topThreeOutcomes ?? [];
  const outcomesBlock = outcomes.length
    ? outcomes.map((o, i) => `${i + 1}. ${o}`).join('\n')
    : '_No outcomes extracted._';

  const headlineWarning = vp && isGeneric(vp.headline)
    ? `\n\n> ⚠️ The headline reads as generic. Rewrite with a concrete audience and a measurable outcome before Phase 1 begins. The audit \`idea-clarity\` dimension flags generic phrasing.`
    : '';

  const whyNowBlock = wn
    ? `## Why now

- **Driver:** ${wn.driver}
- **Recent change:** ${wn.recentChange}
- **Risks if delayed:** ${wn.risksIfDelayed}`
    : '## Why now\n\n_Not extracted._';

  return `# VALUE_PROPOSITION

> Generated from research extractions (\`meta.discovery.valueProposition\` and \`meta.discovery.whyNow\`). Read this before any phase work begins; if the framing is wrong, fix it here first.

## Headline

${headline}${headlineWarning}

## One-line problem

${problem}

## One-line solution

${solution}

## Top three outcomes

${outcomesBlock}

${whyNowBlock}

## Confirm before phase 1 begins

- [ ] The headline names a specific audience and a measurable outcome.
- [ ] The problem is something the audience said in the brief, not an inferred guess.
- [ ] The solution is what the must-have features actually deliver, not aspirational scope.
- [ ] The outcomes are observable post-shipping (not vague satisfaction language).
- [ ] The "why now" risks are real (would actually slip if we delay), not theatrical.
`;
}
