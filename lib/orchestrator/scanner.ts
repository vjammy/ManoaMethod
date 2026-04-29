import fs from 'node:fs';
import path from 'node:path';
import type { PhaseInfo, RepoDocument, RepoState, ReportDocKey } from './types';
import { firstMatch, getNowRunId, listFilesRecursive, readFileSafe, readJsonSafe, unique } from './utils';

const PACKAGE_KEYED_DOCS: Array<{ key: ReportDocKey; candidates: string[] }> = [
  { key: 'readme', candidates: ['README.md'] },
  { key: 'startHere', candidates: ['START_HERE.md', 'BUSINESS_USER_START_HERE.md'] },
  { key: 'projectContext', candidates: ['00_PROJECT_CONTEXT.md', 'PROJECT_BRIEF.md'] },
  { key: 'contextRules', candidates: ['01_CONTEXT_RULES.md', 'AGENTS.md'] },
  { key: 'scorecard', candidates: ['SCORECARD.md'] },
  { key: 'currentStatus', candidates: ['CURRENT_STATUS.md'] },
  { key: 'testingStrategy', candidates: ['TESTING_STRATEGY.md', 'TEST_SCRIPT_INDEX.md'] },
  { key: 'regressionPlan', candidates: ['REGRESSION_TEST_PLAN.md', 'regression-suite/RUN_REGRESSION.md'] }
];

const REPO_KEYED_DOCS: Array<{ key: ReportDocKey; candidates: string[] }> = [
  { key: 'readme', candidates: ['README.md'] },
  { key: 'startHere', candidates: ['docs/ORCHESTRATOR.md', 'README.md'] },
  { key: 'projectContext', candidates: ['ORCHESTRATOR_IMPLEMENTATION_REPORT.md', 'README.md'] },
  { key: 'contextRules', candidates: ['docs/ORCHESTRATOR.md', 'README.md'] },
  { key: 'scorecard', candidates: ['orchestrator/reports/OBJECTIVE_SCORECARD.md', 'ORCHESTRATOR_IMPLEMENTATION_REPORT.md'] },
  { key: 'currentStatus', candidates: ['orchestrator/reports/FINAL_ORCHESTRATOR_REPORT.md', 'ORCHESTRATOR_IMPLEMENTATION_REPORT.md'] },
  { key: 'testingStrategy', candidates: ['docs/ORCHESTRATOR.md', 'README.md'] },
  { key: 'regressionPlan', candidates: ['ORCHESTRATOR_IMPLEMENTATION_REPORT.md', 'docs/ORCHESTRATOR.md'] }
];

const PACKAGE_IMPORTANT_FILES = [
  'README.md',
  'START_HERE.md',
  '00_PROJECT_CONTEXT.md',
  '01_CONTEXT_RULES.md',
  'SCORECARD.md',
  'CURRENT_STATUS.md',
  'TESTING_STRATEGY.md',
  'REGRESSION_TEST_PLAN.md'
];

const REPO_IMPORTANT_FILES = [
  'README.md',
  'docs/ORCHESTRATOR.md',
  'ORCHESTRATOR_IMPLEMENTATION_REPORT.md',
  'package.json'
];

function detectPackageRoot(repoRoot: string) {
  return fs.existsSync(path.join(repoRoot, 'repo', 'manifest.json')) ? repoRoot : null;
}

function readDocs(root: string, mode: RepoState['mode']): RepoDocument[] {
  const docSet = mode === 'package' ? PACKAGE_KEYED_DOCS : REPO_KEYED_DOCS;
  return docSet.map(({ key, candidates }) => {
    const relativePath = candidates.find((candidate) => fs.existsSync(path.join(root, candidate))) || candidates[0];
    const absolutePath = path.join(root, relativePath);
    return {
      key,
      path: relativePath,
      exists: fs.existsSync(absolutePath),
      content: readFileSafe(absolutePath)
    };
  });
}

function readPhaseInfo(root: string): PhaseInfo[] {
  const phasesDir = path.join(root, 'phases');
  if (!fs.existsSync(phasesDir)) return [];

  return fs
    .readdirSync(phasesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^phase-\d+/i.test(entry.name))
    .map((entry) => {
      const phaseRoot = path.join(phasesDir, entry.name);
      const files = listFilesRecursive(phaseRoot, root);
      return {
        slug: entry.name,
        path: `phases/${entry.name}`,
        files,
        hasVerificationReport: files.includes(`phases/${entry.name}/VERIFICATION_REPORT.md`),
        hasHandoff: files.includes(`phases/${entry.name}/HANDOFF_SUMMARY.md`),
        hasEntryGate: files.includes(`phases/${entry.name}/ENTRY_GATE.md`),
        hasExitGate: files.includes(`phases/${entry.name}/EXIT_GATE.md`),
        hasTestScript: files.includes(`phases/${entry.name}/TEST_SCRIPT.md`),
        hasTestResults: files.includes(`phases/${entry.name}/TEST_RESULTS.md`)
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function guessProjectName(repoRoot: string, packageRoot: string | null, docs: RepoDocument[]) {
  const packageJson = readJsonSafe<{ name?: string }>(path.join(repoRoot, 'package.json'));
  const readme = docs.find((doc) => doc.key === 'readme')?.content || '';
  const brief = readFileSafe(path.join(packageRoot || repoRoot, 'PROJECT_BRIEF.md'));
  return (
    firstMatch(brief, [/##\s*Product\s*\n(.+)/i]) ||
    firstMatch(readme, [/^#\s+(.+)$/m]) ||
    packageJson?.name ||
    path.basename(repoRoot)
  );
}

export function buildRepoState(repoRoot: string, explicitPackageRoot?: string): RepoState {
  const normalizedRepoRoot = path.resolve(repoRoot);
  const packageRoot = explicitPackageRoot
    ? path.resolve(explicitPackageRoot)
    : detectPackageRoot(normalizedRepoRoot);
  const scanRoot = packageRoot || normalizedRepoRoot;
  const mode: RepoState['mode'] = packageRoot ? 'package' : 'repo';
  const docs = readDocs(scanRoot, mode);
  const phases = readPhaseInfo(scanRoot);
  const allFiles = listFilesRecursive(scanRoot, scanRoot);
  const packageJson = readJsonSafe<{ scripts?: Record<string, string> }>(path.join(normalizedRepoRoot, 'package.json'));
  const manifest = readJsonSafe<Record<string, unknown>>(path.join(scanRoot, 'repo', 'manifest.json'));
  const xeleraState = readJsonSafe<Record<string, unknown>>(path.join(scanRoot, 'repo', 'xelera-state.json'));
  const readme = docs.find((doc) => doc.key === 'readme')?.content || '';
  const projectName = guessProjectName(normalizedRepoRoot, packageRoot, docs);

  return {
    repoRoot: normalizedRepoRoot,
    packageRoot,
    runId: getNowRunId(),
    projectName,
    isGeneratedPackage: Boolean(packageRoot && manifest),
    mode,
    packageScripts: packageJson?.scripts || {},
    manifest,
    xeleraState,
    docs,
    phases,
    verificationReports: allFiles.filter((file) => /VERIFICATION_REPORT\.md$/i.test(file)),
    handoffFiles: allFiles.filter((file) => /(HANDOFF|NEXT_PHASE_CONTEXT)\.md$/i.test(file)),
    regressionFiles: allFiles.filter((file) => /regression-suite\//i.test(file)),
    reportFiles: allFiles.filter((file) => /\.md$/i.test(file) && /(REPORT|SCORECARD|RESULTS|STATUS)/i.test(file)),
    missingExpectedFiles: (mode === 'package' ? PACKAGE_IMPORTANT_FILES : REPO_IMPORTANT_FILES).filter((file) => !fs.existsSync(path.join(scanRoot, file))),
    localFirstSignals: unique(
      [
        readme,
        ...docs.map((doc) => doc.content)
      ]
        .join('\n')
        .match(/local-first|markdown-first|no database|no auth|no hosted backend/gi) || []
    ),
    blockerSignals: unique(
      [
        readme,
        ...docs.map((doc) => doc.content)
      ]
        .join('\n')
        .match(/blocked|blocker|do not proceed|do not advance|missing dependency/gi) || []
    )
  };
}
