#!/usr/bin/env tsx
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createArtifactPackage } from './xelera-create-project';
import { USE_CASES } from './test-quality-regression';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const AUTORESEARCH_DIR = path.join(ROOT, 'autoresearch');
const REPORTS_DIR = path.join(AUTORESEARCH_DIR, 'reports');
const GENERATED_DIR = path.join(os.tmpdir(), 'xelera-autoresearch-generated');
const RESULTS_PATH = path.join(AUTORESEARCH_DIR, 'results.tsv');
const TARGET_SCORE = 95;

type CommandResult = {
  label: string;
  command: string;
  passed: boolean;
  stdout: string;
  stderr: string;
};

type UseCaseScore = {
  name: string;
  key: string;
  packageRoot: string;
  rawScore: number;
  finalScore: number;
  cap: number | null;
  triggeredCaps: string[];
  breakdown: Record<string, number>;
};

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureResultsHeader() {
  const header =
    'timestamp\trun_id\tgit_sha\toverall_score\tlowest_score\ttarget_score\tpackage_count\ttypecheck\tsmoke\tbuild\tquality_regression\tpackage_validation\tpackage_regression\treport_path\tnotes\n';
  if (!fs.existsSync(RESULTS_PATH) || !fs.readFileSync(RESULTS_PATH, 'utf8').startsWith('timestamp\t')) {
    fs.writeFileSync(RESULTS_PATH, header, 'utf8');
  }
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function npxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function runCommand(label: string, command: string, args: string[], cwd = ROOT): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32'
  });
  return {
    label,
    command: [command, ...args].join(' '),
    passed: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function readFileSafe(packageRoot: string, relativePath: string) {
  const fullPath = path.join(packageRoot, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function countMatches(content: string, patterns: RegExp[]) {
  return patterns.filter((pattern) => pattern.test(content)).length;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function scoreUseCase(packageRoot: string, useCase: (typeof USE_CASES)[number]): UseCaseScore {
  const startHere = readFileSafe(packageRoot, 'START_HERE.md');
  const brief = readFileSafe(packageRoot, 'PROJECT_BRIEF.md');
  const phasePlan = readFileSafe(packageRoot, 'PHASE_PLAN.md');
  const handoff = readFileSafe(packageRoot, 'HANDOFF.md');
  const testing = readFileSafe(packageRoot, 'TESTING_STRATEGY.md');
  const regression = readFileSafe(packageRoot, 'REGRESSION_TEST_PLAN.md');
  const businessStart = readFileSafe(packageRoot, 'BUSINESS_USER_START_HERE.md');
  const codexStart = readFileSafe(packageRoot, 'CODEX_START_HERE.md');
  const architecture = readFileSafe(packageRoot, 'architecture/SYSTEM_OVERVIEW.md');
  const acceptance = readFileSafe(packageRoot, 'requirements/ACCEPTANCE_CRITERIA.md');
  const verification = readFileSafe(packageRoot, 'phases/phase-01/VERIFY_PROMPT.md');
  const testScript = readFileSafe(packageRoot, 'phases/phase-01/TEST_SCRIPT.md');
  const handoffSummary = readFileSafe(packageRoot, 'phases/phase-01/HANDOFF_SUMMARY.md');
  const nextContext = readFileSafe(packageRoot, 'phases/phase-01/NEXT_PHASE_CONTEXT.md');
  const autoImproveProgram = readFileSafe(packageRoot, 'auto-improve/PROGRAM.md');

  const productSignals = [
    new RegExp(useCase.input.productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    ...useCase.input.mustHaveFeatures
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4)
      .map((item) => new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  ];
  const combinedCore = [brief, phasePlan, handoff, acceptance].join('\n');
  const specificityHits = countMatches(combinedCore, productSignals);
  const useCaseSpecificity = clamp(8 + specificityHits * 3, 0, 20);

  const phaseUsefulness = clamp(
    (/(## 1\. Decide|## Package status)/i.test(phasePlan) ? 4 : 0) +
      (/Entry gate:/i.test(startHere) ? 3 : 0) +
      (/Exit gate:/i.test(startHere) ? 3 : 0) +
      (/## What you should do now/i.test(readFileSafe(packageRoot, 'phases/phase-01/PHASE_BRIEF.md')) ? 3 : 0) +
      (/## Functional checks/i.test(verification) ? 2 : 0),
    0,
    15
  );

  const beginnerClarity = clamp(
    (/do not need to open every folder/i.test(startHere) ? 3 : 0) +
      (/## Commands to know/i.test(startHere) ? 3 : 0) +
      (/For you:/i.test(businessStart) ? 2 : 0) +
      (/What to paste into Codex/i.test(codexStart) ? 2 : 0),
    0,
    10
  );

  const agentExecutability = clamp(
    (/## Editable files/i.test(autoImproveProgram) ? 4 : 0) +
      (/## Fixed files/i.test(autoImproveProgram) ? 3 : 0) +
      (/## Validation commands/i.test(autoImproveProgram) ? 3 : 0) +
      (/## Keep or discard loop/i.test(autoImproveProgram) ? 3 : 0) +
      (/## Stop conditions/i.test(autoImproveProgram) ? 2 : 0),
    0,
    15
  );

  const verificationStrength = clamp(
    (/Evidence required/i.test(acceptance) ? 4 : 0) +
      (/## What evidence means/i.test(verification) ? 4 : 0) +
      (/## Final decision rules/i.test(verification) ? 4 : 0) +
      (/pass\/fail/i.test(testing) ? 3 : 0),
    0,
    15
  );

  const regressionCoverage = clamp(
    (fs.existsSync(path.join(packageRoot, 'regression-suite/scripts/run-regression.ts')) ? 3 : 0) +
      (/regression/i.test(regression) ? 3 : 0) +
      (/TEST_SCRIPT_INDEX/i.test(readFileSafe(packageRoot, 'TEST_SCRIPT_INDEX.md')) ? 2 : 0) +
      (/Recursive/i.test(readFileSafe(packageRoot, 'recursive-test/RECURSIVE_TEST_START_HERE.md')) ? 2 : 0),
    0,
    10
  );

  const handoffQuality = clamp(
    (/## What the builder should read first/i.test(handoff) ? 4 : 0) +
      (/## Completion update/i.test(handoffSummary) ? 3 : 0) +
      (/## What the next phase should inherit/i.test(nextContext) ? 3 : 0),
    0,
    10
  );

  const simplicity = clamp(
    (!/(?<!\bNo\s+|\bnot\s+|\bwithout\s+|\bavoid\s+)\b(microservices|kubernetes|multi-region|background workers|hosted backend)\b/i.test(architecture) ? 3 : 0) +
      (/Do not add hosted services, auth, databases, dashboards, background workers/i.test(autoImproveProgram) ? 2 : 0),
    0,
    5
  );

  const rawScore =
    useCaseSpecificity +
    phaseUsefulness +
    beginnerClarity +
    agentExecutability +
    verificationStrength +
    regressionCoverage +
    handoffQuality +
    simplicity;

  const triggeredCaps: string[] = [];
  let cap: number | null = null;
  const applyCap = (label: string, max: number, condition: boolean) => {
    if (!condition) return;
    triggeredCaps.push(`${label} (max ${max})`);
    cap = cap === null ? max : Math.min(cap, max);
  };

  applyCap('Mostly generic artifacts', 59, specificityHits < 3);
  applyCap('Fake or non-runnable test scripts', 69, !/Steps/i.test(testScript) || !fs.existsSync(path.join(packageRoot, 'regression-suite/scripts/run-regression.ts')));
  applyCap('Pass or proceed header but blocked body', 64, /## result:\s*pass/i.test(readFileSafe(packageRoot, 'phases/phase-01/VERIFICATION_REPORT.md')) && /blocked/i.test(readFileSafe(packageRoot, 'phases/phase-01/VERIFICATION_REPORT.md')));
  applyCap('Wrong domain archetype', 71, /patient|provider|clinic/i.test(combinedCore) && !/clinic|scheduler/i.test(useCase.input.productName + useCase.input.productIdea));
  applyCap('Blank or template-shaped handoff', 74, 
    /pending update|awaiting completion|awaiting reviewer assignment/i.test(handoffSummary) || 
    /Not recorded yet|Awaiting documentation/i.test(handoff)
  );
  applyCap('Beginner cannot tell what to do next', 79, !/## Commands to know/i.test(startHere) || !/Open these files first/i.test(startHere));
  applyCap('No regression suite', 84, !fs.existsSync(path.join(packageRoot, 'regression-suite/scripts/run-regression.ts')));
  applyCap('Useful but bloated or overbuilt', 89, /microservices|kubernetes|event bus|multi-region|dashboard/i.test(architecture));

  return {
    name: useCase.name,
    key: useCase.key,
    packageRoot,
    rawScore,
    finalScore: cap === null ? rawScore : Math.min(rawScore, cap),
    cap,
    triggeredCaps,
    breakdown: {
      useCaseSpecificity,
      phaseUsefulness,
      beginnerClarity,
      agentExecutability,
      verificationStrength,
      regressionCoverage,
      handoffQuality,
      simplicity
    }
  };
}

function formatCommandSection(results: CommandResult[]) {
  return results
    .map(
      (result) => `## ${result.label}

- Command: \`${result.command}\`
- Status: ${result.passed ? 'PASS' : 'FAIL'}

\`\`\`text
${(result.stdout + (result.stderr ? `\n${result.stderr}` : '')).trim() || '(no output)'}
\`\`\`
`
    )
    .join('\n');
}

async function main() {
  ensureDir(REPORTS_DIR);
  ensureDir(GENERATED_DIR);
  ensureResultsHeader();

  const timestamp = new Date().toISOString();
  const runId = timestamp.replace(/[:.]/g, '-');
  const runRoot = path.join(GENERATED_DIR, runId);
  ensureDir(runRoot);

  const gitSha = runCommand('git-sha', 'git', ['rev-parse', '--short', 'HEAD']).stdout.trim() || 'unknown';

  const rootCommands = [
    runCommand('typecheck', npmCommand(), ['run', 'typecheck']),
    runCommand('smoke', npmCommand(), ['run', 'smoke']),
    runCommand('build', npmCommand(), ['run', 'build']),
    runCommand('quality-regression', npmCommand(), ['run', 'test:quality-regression'])
  ];

  const useCaseScores: UseCaseScore[] = [];
  const packageValidationResults: CommandResult[] = [];
  const packageRegressionResults: CommandResult[] = [];

  for (const useCase of USE_CASES) {
    const outDir = path.join(runRoot, useCase.key);
    const created = await createArtifactPackage({
      input: useCase.input,
      outDir,
      zip: false
    });

    packageValidationResults.push(
      runCommand(
        `validate:${useCase.key}`,
        npxCommand(),
        ['tsx', 'scripts/xelera-validate.ts', `--package=${created.rootDir}`],
        ROOT
      )
    );
    packageRegressionResults.push(
      runCommand(
        `package-regression:${useCase.key}`,
        npxCommand(),
        ['tsx', path.join(created.rootDir, 'regression-suite', 'scripts', 'run-regression.ts'), created.rootDir],
        ROOT
      )
    );
    useCaseScores.push(scoreUseCase(created.rootDir, useCase));
  }

  const overallScore = Math.round(useCaseScores.reduce((sum, item) => sum + item.finalScore, 0) / useCaseScores.length);
  const lowestScore = Math.min(...useCaseScores.map((item) => item.finalScore));
  const allCommandsPassed =
    rootCommands.every((item) => item.passed) &&
    packageValidationResults.every((item) => item.passed) &&
    packageRegressionResults.every((item) => item.passed);

  const reportPath = path.join(REPORTS_DIR, `${runId}.md`);
  const report = `# Xelera Autoresearch Report

- Timestamp: ${timestamp}
- Run ID: ${runId}
- Git SHA: ${gitSha}
- Target score: ${TARGET_SCORE}
- Overall score: ${overallScore}
- Lowest use-case score: ${lowestScore}
- Root command status: ${rootCommands.every((item) => item.passed) ? 'PASS' : 'FAIL'}
- Package validation status: ${packageValidationResults.every((item) => item.passed) ? 'PASS' : 'FAIL'}
- Package regression status: ${packageRegressionResults.every((item) => item.passed) ? 'PASS' : 'FAIL'}

## Per-use-case scores
| Use case | Score | Raw | Cap | Triggered caps |
| --- | --- | --- | --- | --- |
${useCaseScores
  .map((item) => `| ${item.name} | ${item.finalScore} | ${item.rawScore} | ${item.cap ?? '-'} | ${item.triggeredCaps.join('; ') || '-'} |`)
  .join('\n')}

## Score breakdowns
${useCaseScores
  .map(
    (item) => `### ${item.name}

- Use-case specificity: ${item.breakdown.useCaseSpecificity}/20
- Phase usefulness: ${item.breakdown.phaseUsefulness}/15
- Beginner clarity: ${item.breakdown.beginnerClarity}/10
- Agent executability: ${item.breakdown.agentExecutability}/15
- Verification strength: ${item.breakdown.verificationStrength}/15
- Regression and test coverage: ${item.breakdown.regressionCoverage}/10
- Handoff quality: ${item.breakdown.handoffQuality}/10
- Simplicity and no overbuilding: ${item.breakdown.simplicity}/5
- Package root: \`${item.packageRoot}\``
  )
  .join('\n\n')}

## Root commands
${formatCommandSection(rootCommands)}

## Package validation commands
${formatCommandSection(packageValidationResults)}

## Package regression commands
${formatCommandSection(packageRegressionResults)}

## Outcome
- Target met: ${allCommandsPassed && lowestScore >= TARGET_SCORE ? 'yes' : 'no'}
- Notes: ${allCommandsPassed ? 'All required commands passed.' : 'One or more required commands failed.'}
`;

  fs.writeFileSync(reportPath, report, 'utf8');

  const row = [
    timestamp,
    runId,
    gitSha,
    String(overallScore),
    String(lowestScore),
    String(TARGET_SCORE),
    String(useCaseScores.length),
    rootCommands[0].passed ? 'pass' : 'fail',
    rootCommands[1].passed ? 'pass' : 'fail',
    rootCommands[2].passed ? 'pass' : 'fail',
    rootCommands[3].passed ? 'pass' : 'fail',
    packageValidationResults.every((item) => item.passed) ? 'pass' : 'fail',
    packageRegressionResults.every((item) => item.passed) ? 'pass' : 'fail',
    path.relative(ROOT, reportPath).replace(/\\/g, '/'),
    allCommandsPassed && lowestScore >= TARGET_SCORE ? 'target met' : 'target not met'
  ].join('\t');
  fs.appendFileSync(RESULTS_PATH, `${row}\n`, 'utf8');

  console.log(`Autoresearch report written to ${reportPath}`);
  console.log(`Overall score: ${overallScore}`);
  console.log(`Lowest use-case score: ${lowestScore}`);

  if (!allCommandsPassed || lowestScore < TARGET_SCORE) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
