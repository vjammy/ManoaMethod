import type { ProjectInput, ScoreBreakdown } from './types';

function hasEnough(value: string, minWords: number) {
  return value.trim().split(/\s+/).filter(Boolean).length >= minWords;
}
function scorePart(value: string, minWords: number, weight: number) {
  if (!value.trim()) return 0;
  return hasEnough(value, minWords) ? weight : Math.ceil(weight * 0.55);
}
export function scoreProject(input: ProjectInput): ScoreBreakdown {
  const discovery = scorePart(input.oneLineIdea + ' ' + input.primaryOutcome, 18, 20);
  const workflow = scorePart(input.targetUsers, 15, 15);
  const scope = scorePart(input.mustHaveFeatures + ' ' + input.niceToHaveFeatures, 22, 20);
  const data = scorePart(input.dataAndIntegrations, 14, 15);
  const risk = scorePart(input.risks + ' ' + input.constraints, 20, 15);
  const handoff = input.productName.trim() && input.level && input.track ? 15 : 5;
  const total = discovery + workflow + scope + data + risk + handoff;
  const rating = total >= 90 ? 'Strong handoff' : total >= 75 ? 'Build ready' : total >= 55 ? 'Needs work' : 'Not ready';
  const recommendations: string[] = [];
  if (discovery < 16) recommendations.push('Sharpen the north star, success metric, and non-goals.');
  if (workflow < 12) recommendations.push('Add user workflows, role differences, edge cases, and support paths.');
  if (scope < 16) recommendations.push('Separate v1 must-haves from future scope.');
  if (data < 12) recommendations.push('Define entities, permissions, integrations, events, and retention assumptions.');
  if (risk < 12) recommendations.push('Add security, privacy, operational, and testing risks.');
  if (!recommendations.length) recommendations.push('Ready to hand off. Keep gates strict and update docs after every phase.');
  return { discovery, workflow, scope, data, risk, handoff, total, rating, recommendations };
}
