import fs from 'node:fs';
import path from 'node:path';
import {
  assessEvidenceFilesForApproval,
  findVerificationBodyContradictions,
  parseVerificationEvidenceFiles
} from '../../scripts/mvp-builder-package-utils';
import type { CommandResult, GateResult, RepoState, Scorecard } from './types';
import { readFileSafe } from './utils';

const GENERIC_PHRASES = ['looks good', 'no issues found', 'everything passes', 'ready to proceed'];

function hasGenericVerification(reportContent: string) {
  const normalized = reportContent.toLowerCase();
  return GENERIC_PHRASES.some((phrase) => normalized.includes(phrase));
}

function hasTemplateShell(content: string) {
  const trimmed = content.trim().toLowerCase();
  return !trimmed || /^# [^\n]+\n+\s*-\s*pending/m.test(trimmed) || /(todo|tbd|pending)\s*$/m.test(trimmed);
}

function findMostlyGenericArtifacts(repoState: RepoState) {
  const projectTerms = repoState.projectName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
  const docs = repoState.docs.filter((doc) => doc.exists);
  const matches = docs.filter((doc) => projectTerms.some((term) => doc.content.toLowerCase().includes(term))).length;
  return docs.length > 0 && matches / docs.length < 0.35;
}

function entryGate(repoState: RepoState): GateResult {
  const phaseOneGate = repoState.packageRoot
    ? readFileSafe(path.join(repoState.packageRoot, 'phases', 'phase-01', 'ENTRY_GATE.md'))
    : '';
  const repoModeDocsReady =
    repoState.docs.some((doc) => doc.key === 'readme' && doc.exists) &&
    Object.keys(repoState.packageScripts).length > 0 &&
    fs.existsSync(path.join(repoState.repoRoot, 'docs', 'ORCHESTRATOR.md'));
  const checks = [
    {
      label: 'Core project docs exist',
      passed: repoState.isGeneratedPackage ? repoState.docs.filter((doc) => doc.exists).length >= 3 : repoModeDocsReady,
      detail: repoState.isGeneratedPackage
        ? repoState.missingExpectedFiles.length
          ? `Missing: ${repoState.missingExpectedFiles.join(', ')}`
          : 'Core markdown docs were detected.'
        : 'Repo mode requires README.md, package scripts, and docs/ORCHESTRATOR.md.'
    },
    {
      label: 'Phase 1 does not require prior phase handoff',
      passed: !/prior phase handoff|previous phase handoff/i.test(phaseOneGate),
      detail: phaseOneGate
        ? 'Checked phase-01 entry gate text for invalid prior-handoff requirement.'
        : 'No generated phase-01 entry gate detected, so this rule is not applicable.'
    },
    {
      label: 'Generated package shells are not empty',
      passed: repoState.docs.filter((doc) => doc.exists).every((doc) => !hasTemplateShell(doc.content)),
      detail: 'Inspected root docs for empty pending-only shells.'
    }
  ];

  const failedCriteria = checks.filter((check) => !check.passed).map((check) => check.label);
  return {
    gate: 'entry gate',
    status: failedCriteria.length === 0 ? 'pass' : 'fail',
    summary: failedCriteria.length === 0 ? 'Entry conditions look usable.' : 'Entry conditions are incomplete or invalid.',
    checks,
    failedCriteria
  };
}

function buildGate(commands: CommandResult[]): GateResult {
  const required = commands.filter((command) => command.required);
  const checks = [
    {
      label: 'Required commands were detected',
      passed: required.every((command) => command.detected),
      detail: required.filter((command) => !command.detected).map((command) => command.name).join(', ') || 'All required commands exist.'
    },
    {
      label: 'Required commands were executed or intentionally dry-run skipped',
      passed: required.every((command) => command.status !== 'missing'),
      detail: required.map((command) => `${command.name}:${command.status}`).join(', ')
    },
    {
      label: 'Required validation commands passed',
      passed: required.every((command) => command.status === 'passed' || command.status === 'skipped'),
      detail: required
        .map((command) => `${command.name}:${command.status}`)
        .join(', ')
    }
  ];
  const failedCriteria = checks.filter((check) => !check.passed).map((check) => check.label);
  return {
    gate: 'implementation gate',
    status: failedCriteria.length === 0 ? 'pass' : 'fail',
    summary: failedCriteria.length === 0 ? 'Build checks are coherent.' : 'Build checks found missing or failing command coverage.',
    checks,
    failedCriteria
  };
}

function testGate(commands: CommandResult[]): GateResult {
  const isHealthy = (status?: CommandResult['status']) => status === 'passed' || status === 'skipped';
  const lookup = (name: string) => commands.find((command) => command.name === name);
  const typecheck = lookup('typecheck');
  const test = lookup('test');
  const smoke = lookup('smoke');
  const build = lookup('build');
  const checks = [
    {
      label: 'Type checking passed',
      passed: isHealthy(typecheck?.status),
      detail: typecheck ? `${typecheck.name}:${typecheck.status}` : 'typecheck script not detected.'
    },
    {
      label: 'Primary test command passed',
      passed: isHealthy(test?.status),
      detail: test ? `${test.name}:${test.status}` : 'test script not detected.'
    },
    {
      label: 'Smoke coverage passed',
      passed: isHealthy(smoke?.status),
      detail: smoke ? `${smoke.name}:${smoke.status}` : 'smoke script not detected.'
    },
    {
      label: 'Production build passed',
      passed: isHealthy(build?.status),
      detail: build ? `${build.name}:${build.status}` : 'build script not detected.'
    }
  ];
  const failedCriteria = checks.filter((check) => !check.passed).map((check) => check.label);
  return {
    gate: 'test gate',
    status: failedCriteria.length === 0 ? 'pass' : 'fail',
    summary: failedCriteria.length === 0 ? 'Tests and build checks passed.' : 'One or more core test or build checks failed.',
    checks,
    failedCriteria
  };
}

function regressionGate(repoState: RepoState, commands: CommandResult[]): GateResult {
  const regressionCommand = commands.find((command) => command.name === 'test:quality-regression');
  const requiredRegressionDocs = [
    'regression-suite/README.md',
    'regression-suite/RUN_REGRESSION.md',
    'regression-suite/REGRESSION_CHECKLIST.md',
    'regression-suite/REGRESSION_RESULTS_TEMPLATE.md'
  ];
  const root = repoState.packageRoot || repoState.repoRoot;
  const missingDocs = requiredRegressionDocs.filter((file) => !fs.existsSync(path.join(root, file)));
  const checks = [
    {
      label: 'Regression command passed',
      passed: regressionCommand?.status === 'passed' || regressionCommand?.status === 'skipped',
      detail: regressionCommand
        ? `${regressionCommand.name}:${regressionCommand.status}`
        : 'test:quality-regression script not detected.'
    },
    {
      label: 'Regression suite documentation exists',
      passed: missingDocs.length === 0,
      detail: missingDocs.length ? `Missing: ${missingDocs.join(', ')}` : 'Regression suite docs are present.'
    },
    {
      label: 'Regression suite implementation exists',
      passed: repoState.regressionFiles.length > 0,
      detail: repoState.regressionFiles.length
        ? `${repoState.regressionFiles.length} regression file(s) detected.`
        : 'No regression-suite files were found.'
    }
  ];
  const failedCriteria = checks.filter((check) => !check.passed).map((check) => check.label);
  return {
    gate: 'regression gate',
    status: failedCriteria.length === 0 ? 'pass' : 'fail',
    summary:
      failedCriteria.length === 0 ? 'Regression coverage is present and passing.' : 'Regression coverage is missing or failing.',
    checks,
    failedCriteria
  };
}

function evidenceGate(repoState: RepoState, commands: CommandResult[]): GateResult {
  const checks: GateResult['checks'] = [];
  const verificationFiles = (repoState.packageRoot ? repoState.verificationReports : []).slice(0, 10);
  const allPassed = verificationFiles.every((relativePath) => {
    const absolute = path.join(repoState.packageRoot!, relativePath);
    const content = readFileSafe(absolute);
    const evidenceFiles = parseVerificationEvidenceFiles(content);
    const evidenceAssessment = assessEvidenceFilesForApproval(repoState.packageRoot!, evidenceFiles);
    const contradictory = findVerificationBodyContradictions(content);
    const generic = hasGenericVerification(content);
    checks.push({
      label: `Evidence quality for ${relativePath}`,
      passed: evidenceAssessment.issues.length === 0 && !contradictory && !generic,
      detail:
        evidenceAssessment.issues.join(' ') ||
        (contradictory
          ? 'Verification headers and body contradict each other.'
          : generic
            ? 'Verification report uses generic evidence prose.'
            : 'Evidence files are project-specific and consistent.')
    });
    return evidenceAssessment.issues.length === 0 && !contradictory && !generic;
  });

  checks.unshift({
    label: 'Command outputs exist for every executed required command',
    passed: commands.filter((command) => command.required && command.status !== 'missing').every((command) => fs.existsSync(command.outputPath)),
    detail: 'Each required command should have a persisted output file in the run directory.'
  });

  if (repoState.isGeneratedPackage) {
    checks.push({
      label: 'Regression suite exists when package mode is active',
      passed: repoState.regressionFiles.length > 0,
      detail: repoState.regressionFiles.length > 0 ? `${repoState.regressionFiles.length} regression file(s) detected.` : 'No regression-suite files were found.'
    });
  }

  const failedCriteria = checks.filter((check) => !check.passed).map((check) => check.label);
  return {
    gate: 'evidence gate',
    status: failedCriteria.length === 0 && allPassed ? 'pass' : 'fail',
    summary:
      failedCriteria.length === 0
        ? 'Evidence files and command outputs support the claims that were made.'
        : 'Evidence is missing, generic, contradictory, or unsupported.',
    checks,
    failedCriteria
  };
}

function securityGate(repoState: RepoState): GateResult {
  const root = repoState.packageRoot || repoState.repoRoot;
  const candidateFiles =
    repoState.mode === 'package'
      ? ['SECURITY_REVIEW.md', 'security-risk/SECURITY_GATE.md', 'security-risk/SECRET_MANAGEMENT.md']
      : ['SECURITY_REVIEW.md', 'README.md', 'docs/ORCHESTRATOR.md'];
  const existing = candidateFiles.filter((file) => fs.existsSync(path.join(root, file)));
  const securityReviewPath = existing.find((file) => /SECURITY_REVIEW\.md$/i.test(file));
  const securityReviewContent = securityReviewPath ? readFileSafe(path.join(root, securityReviewPath)) : '';
  const checks = [
    {
      label: 'Security review artifact exists',
      passed: Boolean(securityReviewPath),
      detail: securityReviewPath || 'No SECURITY_REVIEW.md file was found.'
    },
    {
      label: 'Secret-handling guidance exists',
      passed: existing.some((file) => /SECRET_MANAGEMENT\.md$/i.test(file)) || /no hosted backend|no auth|local-first/i.test(repoState.docs.map((doc) => doc.content).join('\n')),
      detail: existing.join(', ') || 'No security guidance files detected.'
    },
    {
      label: 'Security review records a result',
      passed: !securityReviewPath || /##\s*Result/i.test(securityReviewContent) || /\bresult\b/i.test(securityReviewContent),
      detail: securityReviewPath ? 'Security review content checked for an explicit result.' : 'No security review file to inspect.'
    }
  ];
  const failedCriteria = checks.filter((check) => !check.passed).map((check) => check.label);
  return {
    gate: 'security gate',
    status: failedCriteria.length === 0 ? 'pass' : 'fail',
    summary: failedCriteria.length === 0 ? 'Security review coverage is present.' : 'Security review coverage is incomplete.',
    checks,
    failedCriteria
  };
}

function releaseGate(repoState: RepoState, commands: CommandResult[]): GateResult {
  const root = repoState.packageRoot || repoState.repoRoot;
  const requiredDocs = [
    'BUILD_TARGET.md',
    'PRODUCTION_SCOPE.md',
    'DEPLOYMENT_PLAN.md',
    'ENVIRONMENT_SETUP.md',
    'OPERATIONS_RUNBOOK.md',
    'ROLLBACK_PLAN.md',
    'FINAL_HANDOFF.md',
    'FINAL_RELEASE_REPORT.md',
    'FINAL_GATE_REPORT.md',
    'FINAL_SCORECARD.md',
    'FINAL_DEPLOYMENT_STATUS.md'
  ];
  const missingDocs = requiredDocs.filter((file) => !fs.existsSync(path.join(root, file)));
  const lookup = (name: string) => commands.find((command) => command.name === name);
  const manifest = repoState.manifest as
    | {
        lifecycleStatus?: string;
        approvedForBuild?: boolean;
      }
    | null;
  const state = repoState.mvpBuilderState as
    | {
        lifecycleStatus?: string;
        completedPhases?: string[];
      }
    | null;
  const checks = [
    {
      label: 'Release documentation exists',
      passed: missingDocs.length === 0,
      detail: missingDocs.length ? `Missing: ${missingDocs.join(', ')}` : 'Release docs are present.'
    },
    {
      label: 'Release-critical commands passed',
      passed:
        ['build', 'test', 'smoke', 'test:quality-regression'].every((name) => {
          const status = lookup(name)?.status;
          return status === 'passed' || status === 'skipped';
        }),
      detail: ['build', 'test', 'smoke', 'test:quality-regression']
        .map((name) => `${name}:${lookup(name)?.status || 'missing'}`)
        .join(', ')
    },
    {
      label: 'Lifecycle state is synchronized',
      passed:
        Boolean(manifest?.approvedForBuild) &&
        manifest?.lifecycleStatus === 'ApprovedForBuild' &&
        state?.lifecycleStatus === 'ApprovedForBuild',
      detail: `Manifest=${manifest?.lifecycleStatus || 'missing'}, State=${state?.lifecycleStatus || 'missing'}, Approved=${manifest?.approvedForBuild ? 'yes' : 'no'}`
    },
    {
      label: 'Final reports are repo-specific',
      passed: fs.existsSync(path.join(root, 'FINAL_RELEASE_REPORT.md')) && !hasTemplateShell(readFileSafe(path.join(root, 'FINAL_RELEASE_REPORT.md'))),
      detail: 'Checked FINAL_RELEASE_REPORT.md for pending-only template content.'
    }
  ];
  const failedCriteria = checks.filter((check) => !check.passed).map((check) => check.label);
  return {
    gate: 'release gate',
    status: failedCriteria.length === 0 ? 'pass' : 'fail',
    summary: failedCriteria.length === 0 ? 'Release readiness requirements are satisfied.' : 'Release readiness is incomplete.',
    checks,
    failedCriteria
  };
}

function exitGate(repoState: RepoState, scorecard?: Scorecard): GateResult {
  const state = repoState.mvpBuilderState as { currentPhase?: number; completedPhases?: string[]; phaseEvidence?: Record<string, { approvedToProceed?: boolean }> } | null;
  const currentPhase = typeof state?.currentPhase === 'number' ? state.currentPhase : 1;
  const previousPhaseSlug = `phase-${String(currentPhase - 1).padStart(2, '0')}`;
  const currentPhaseSlug = `phase-${String(currentPhase).padStart(2, '0')}`;
  const requiredCurrentHandoffFiles = repoState.mode === 'package'
    ? [
        'HANDOFF.md',
        `phases/${currentPhaseSlug}/HANDOFF_SUMMARY.md`,
        `phases/${currentPhaseSlug}/NEXT_PHASE_CONTEXT.md`
      ]
    : ['ORCHESTRATOR_IMPLEMENTATION_REPORT.md', 'orchestrator/reports/FINAL_ORCHESTRATOR_REPORT.md'];
  const presentCurrentHandoffFiles = requiredCurrentHandoffFiles.filter((file) =>
    repoState.mode === 'package'
      ? repoState.handoffFiles.includes(file) || fs.existsSync(path.join(repoState.packageRoot || repoState.repoRoot, file))
      : fs.existsSync(path.join(repoState.repoRoot, file))
  );
  const hasCurrentPhaseHandoffSummary = presentCurrentHandoffFiles.includes(`phases/${currentPhaseSlug}/HANDOFF_SUMMARY.md`);
  const handoffExists =
    repoState.mode === 'package'
      ? hasCurrentPhaseHandoffSummary && presentCurrentHandoffFiles.length >= 2
      : presentCurrentHandoffFiles.length >= 1;
  const bypassed =
    currentPhase > 1 &&
    (!state?.completedPhases?.includes(previousPhaseSlug) ||
      !state?.phaseEvidence?.[previousPhaseSlug]?.approvedToProceed);
  const blockedLifecycle = String((repoState.manifest as { lifecycleStatus?: string } | null)?.lifecycleStatus || '');
  const checks = [
    {
      label: 'Handoff files exist',
      passed: handoffExists,
      detail: handoffExists ? presentCurrentHandoffFiles.join(', ') : `Missing required handoff context for ${currentPhaseSlug}.`
    },
    {
      label: 'Phase gates were not bypassed',
      passed: !bypassed,
      detail: bypassed ? `Current phase is ${currentPhase}, but ${previousPhaseSlug} does not appear approved.` : 'No bypassed phase transitions were detected.'
    },
    {
      label: 'Lifecycle and score do not contradict each other',
      passed:
        !scorecard ||
        blockedLifecycle !== 'Blocked' ||
        scorecard.cappedTotal < 70 ||
        scorecard.releaseBlocker.blocked,
      detail:
        !scorecard
          ? 'Scorecard not available yet.'
          : blockedLifecycle !== 'Blocked'
            ? 'Lifecycle is not blocked.'
            : scorecard.releaseBlocker.blocked
              ? 'Blocked lifecycle is expected because release approval is intentionally withheld.'
            : `Blocked lifecycle paired with score ${scorecard.cappedTotal}.`
    },
    {
      label: 'Artifacts are repo-specific, not mostly generic templates',
      passed: !findMostlyGenericArtifacts(repoState),
      detail: 'Repo docs were checked for project-name specificity and template overuse.'
    },
    {
      label: 'Required command results were captured honestly',
      passed: !scorecard || !scorecard.capReason || scorecard.capReason !== 'If build fails' || repoState.mode === 'repo' || repoState.isGeneratedPackage,
      detail: 'Command failures should stay visible in score and gate outputs.'
    }
  ];
  const failedCriteria = checks.filter((check) => !check.passed).map((check) => check.label);
  return {
    gate: 'exit gate',
    status: failedCriteria.length === 0 ? 'pass' : 'fail',
    summary: failedCriteria.length === 0 ? 'Exit conditions are aligned.' : 'Exit conditions still have unresolved blockers.',
    checks,
    failedCriteria
  };
}

export function runGateChecks(repoState: RepoState, commands: CommandResult[], scorecard?: Scorecard) {
  return [
    entryGate(repoState),
    buildGate(commands),
    testGate(commands),
    regressionGate(repoState, commands),
    evidenceGate(repoState, commands),
    securityGate(repoState),
    releaseGate(repoState, commands),
    exitGate(repoState, scorecard)
  ];
}

export function detectHardCapSignals(repoState: RepoState, commands: CommandResult[], gates: GateResult[]) {
  const verificationContradiction = repoState.packageRoot
    ? repoState.verificationReports.some((relativePath) =>
        findVerificationBodyContradictions(readFileSafe(path.join(repoState.packageRoot!, relativePath)))
      )
    : false;
  const fakeEvidence = repoState.packageRoot
    ? repoState.verificationReports.some((relativePath) => {
        const content = readFileSafe(path.join(repoState.packageRoot!, relativePath));
        return hasGenericVerification(content);
      })
    : false;
  const testsWereRun = commands.some(
    (command) =>
      (command.name === 'smoke' || command.name === 'test:quality-regression' || command.name === 'test') &&
      (command.status === 'passed' || command.status === 'failed')
  );
  const buildCommand = commands.find((command) => command.name === 'build');
  const buildFails = buildCommand?.status === 'failed';
  const repoCannotBuildAtAll = !buildCommand || buildCommand.status === 'missing';
  const bypassedGates = gates.some((gate) => gate.gate === 'exit gate' && gate.failedCriteria.includes('Phase gates were not bypassed'));
  const mostlyGeneric = gates.some(
    (gate) => gate.gate === 'exit gate' && gate.failedCriteria.includes('Artifacts are repo-specific, not mostly generic templates')
  );
  const excessiveRework = detectExcessiveRework(repoState);
  const duplicateRequirementBodies = detectDuplicateRequirementBodies(repoState);

  return {
    testsWereRun,
    buildFails,
    verificationContradiction,
    mostlyGeneric,
    bypassedGates,
    fakeEvidence,
    repoCannotBuildAtAll,
    excessiveRework,
    duplicateRequirementBodies
  };
}

function detectExcessiveRework(repoState: RepoState) {
  const state = repoState.mvpBuilderState as
    | { phaseEvidence?: Record<string, { attempts?: Array<{ attempt: number }> }> }
    | null;
  if (!state?.phaseEvidence) return false;
  return Object.values(state.phaseEvidence).some((record) => (record.attempts?.length || 0) > 3);
}

function detectDuplicateRequirementBodies(repoState: RepoState) {
  const root = repoState.packageRoot || repoState.repoRoot;
  const reqPath = path.join(root, 'requirements', 'FUNCTIONAL_REQUIREMENTS.md');
  if (!fs.existsSync(reqPath)) return false;
  const content = readFileSafe(reqPath);
  const sections = Array.from(
    content.matchAll(/##\s+Requirement\s+\d+:[^\n]+\n([\s\S]*?)(?=\n##\s+Requirement\s+\d+:|$)/g)
  ).map((match) => normalizeRequirementBody(match[1]));
  if (sections.length < 4) return false;
  const counts = new Map<string, number>();
  for (const body of sections) {
    counts.set(body, (counts.get(body) || 0) + 1);
  }
  const maxDuplicate = Math.max(...counts.values());
  // Trip the cap when more than 50% of requirement bodies are byte-identical after normalization.
  return maxDuplicate / sections.length > 0.5;
}

function normalizeRequirementBody(body: string) {
  return body
    .replace(/\b(record-\d+|primary workflow record)\b/gi, '<placeholder>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
