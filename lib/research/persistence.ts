/**
 * Read/write the research artifacts in a workspace.
 *
 * Layout under <workspace>/research/:
 *   USE_CASE_RESEARCH.md      DOMAIN_RESEARCH.md      CONVERGENCE_LOG.md
 *   passes/use-case/pass-NN-research.md, pass-NN-critique.json
 *   passes/domain/pass-NN-research.md, pass-NN-critique.json
 *   extracted/{actors,entities,workflows,integrations,risks,gates,antiFeatures,conflicts,_removed,meta}.json
 */

import fs from 'node:fs';
import path from 'node:path';
import type { LoopResult, PassRecord } from './loop';
import type { ResearchExtractions } from './schema';
import { validateExtractions } from './schema';

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJson(filePath: string, data: unknown) {
  writeFile(filePath, JSON.stringify(data, null, 2) + '\n');
}

export function writeResearchToWorkspace(workspaceRoot: string, result: LoopResult) {
  const issues = validateExtractions(result.extractions);
  if (issues.length > 0) {
    const summary = issues
      .slice(0, 10)
      .map((i) => `  - ${i.path}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Research extractions failed schema validation (${issues.length} issues):\n${summary}\n` +
        `Refusing to write invalid research to ${workspaceRoot}.`
    );
  }

  const root = path.join(workspaceRoot, 'research');

  writeFile(path.join(root, 'USE_CASE_RESEARCH.md'), result.useCase.finalMarkdown);
  writeFile(path.join(root, 'DOMAIN_RESEARCH.md'), result.domain.finalMarkdown);
  writeFile(path.join(root, 'CONVERGENCE_LOG.md'), buildConvergenceLog(result));

  for (const pass of result.useCase.passes) writePass(root, 'use-case', pass);
  for (const pass of result.domain.passes) writePass(root, 'domain', pass);

  writeJson(path.join(root, 'extracted', 'meta.json'), result.extractions.meta);
  writeJson(path.join(root, 'extracted', 'actors.json'), result.extractions.actors);
  writeJson(path.join(root, 'extracted', 'entities.json'), result.extractions.entities);
  writeJson(path.join(root, 'extracted', 'workflows.json'), result.extractions.workflows);
  writeJson(path.join(root, 'extracted', 'integrations.json'), result.extractions.integrations);
  writeJson(path.join(root, 'extracted', 'risks.json'), result.extractions.risks);
  writeJson(path.join(root, 'extracted', 'gates.json'), result.extractions.gates);
  writeJson(path.join(root, 'extracted', 'antiFeatures.json'), result.extractions.antiFeatures);
  writeJson(path.join(root, 'extracted', 'conflicts.json'), result.extractions.conflicts);
  writeJson(path.join(root, 'extracted', '_removed.json'), result.extractions.removed);
  // Phase E2: optional artifacts. Write empty arrays so downstream readers see the keys consistently.
  writeJson(path.join(root, 'extracted', 'screens.json'), result.extractions.screens ?? []);
  writeJson(path.join(root, 'extracted', 'uxFlow.json'), result.extractions.uxFlow ?? []);
}

function writePass(root: string, topic: 'use-case' | 'domain', pass: PassRecord) {
  const dir = path.join(root, 'passes', topic);
  const padded = String(pass.pass).padStart(2, '0');
  writeFile(path.join(dir, `pass-${padded}-research.md`), pass.markdown);
  writeJson(path.join(dir, `pass-${padded}-critique.json`), pass.critique);
}

function buildConvergenceLog(result: LoopResult): string {
  const summary = (topic: string, passes: PassRecord[], conv: boolean, stalled: boolean) => {
    const rows = passes
      .map(
        (p) =>
          `| ${p.pass} | ${p.critique.totalScore} | ${p.critique.verdict} | ${p.critique.gaps.length} | ${p.tokensUsed} | ${p.durationMs}ms |`
      )
      .join('\n');
    return `### ${topic}\n\nFinal verdict: ${conv ? 'converged early' : stalled ? 'stalled' : 'reached pass cap'}\n\n| Pass | Score | Verdict | Gaps | Tokens | Duration |\n|---|---|---|---|---|---|\n${rows}\n`;
  };

  return `# Research convergence log

Brief hash: \`${result.briefHash}\`
Started: ${result.startedAt}
Completed: ${result.completedAt}
Total tokens used: ${result.totalTokensUsed}

${summary('Use-case research', result.useCase.passes, result.useCase.convergedEarly, result.useCase.stalled)}

${summary('Domain research', result.domain.passes, result.domain.convergedEarly, result.domain.stalled)}
`;
}

export function readExtractions(workspaceRoot: string): ResearchExtractions | null {
  const root = path.join(workspaceRoot, 'research', 'extracted');
  if (!fs.existsSync(path.join(root, 'meta.json'))) return null;
  const read = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')) as T;
  const optional = <T>(name: string): T | undefined => {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
    } catch {
      return undefined;
    }
  };
  try {
    const e: ResearchExtractions = {
      meta: read('meta.json'),
      actors: read('actors.json'),
      entities: read('entities.json'),
      workflows: read('workflows.json'),
      integrations: read('integrations.json'),
      risks: read('risks.json'),
      gates: read('gates.json'),
      antiFeatures: read('antiFeatures.json'),
      conflicts: read('conflicts.json'),
      removed: read('_removed.json'),
      screens: optional('screens.json'),
      uxFlow: optional('uxFlow.json')
    };
    return e;
  } catch {
    return null;
  }
}
