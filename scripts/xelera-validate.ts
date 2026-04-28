#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessEvidenceFilesForApproval,
  getArg,
  getPhaseSlug,
  parseExitGateResult,
  parseVerificationEvidenceFiles,
  parseVerificationRecommendation,
  readJsonFile,
  readState,
  resolvePackageRoot
} from './xelera-package-utils';

export function runValidate() {
  const packageRoot = resolvePackageRoot(getArg('package'));
  const issues: string[] = [];

  let manifest: ReturnType<typeof readManifest> | undefined;
  let state: ReturnType<typeof readState> | undefined;

  try {
    manifest = readManifest(packageRoot);
  } catch (e) {
    issues.push(`Could not read repo/manifest.json: ${(e as Error).message}`);
  }

  try {
    state = readState(packageRoot);
  } catch (e) {
    issues.push(`Could not read repo/xelera-state.json: ${(e as Error).message}. Try regenerating the package or fixing JSON syntax.`);
  }

  if (!manifest || !state) {
    printIssues(packageRoot, issues);
    return;
  }

  // Validate state shape
  if (typeof state.currentPhase !== 'number') {
    issues.push('repo/xelera-state.json is missing currentPhase. Expected a number like 1.');
  }
  if (typeof state.lifecycleStatus !== 'string') {
    issues.push('repo/xelera-state.json is missing lifecycleStatus. Expected Draft, Blocked, ReviewReady, or ApprovedForBuild.');
  }
  if (!Array.isArray(state.completedPhases)) {
    issues.push('repo/xelera-state.json is missing completedPhases array.');
  }
  if (!Array.isArray(state.blockedPhases)) {
    issues.push('repo/xelera-state.json is missing blockedPhases array.');
  }
  if (!Array.isArray(state.unresolvedBlockers)) {
    issues.push('repo/xelera-state.json is missing unresolvedBlockers array.');
  }
  if (typeof state.phaseEvidence !== 'object' || state.phaseEvidence === null) {
    issues.push('repo/xelera-state.json is missing phaseEvidence object.');
  }
  if (state.lifecycleStatus !== manifest.lifecycleStatus) {
    issues.push(`Manifest and state lifecycle status are inconsistent. Manifest says "${manifest.lifecycleStatus}" but state says "${state.lifecycleStatus}".`);
  }
  if (state.currentPhase > manifest.phaseCount) {
    issues.push(`Current phase (${state.currentPhase}) is greater than the total phase count (${manifest.phaseCount}). The state may be corrupted.`);
  }
  if (manifest.blockedPhases && JSON.stringify(manifest.blockedPhases) !== JSON.stringify(state.blockedPhases)) {
    issues.push('Manifest and state blockedPhases are inconsistent. Run next-phase or fix the state manually.');
  }

  // Agent parity
  if (
    !Array.isArray(manifest.supportedAgents) ||
    !manifest.supportedAgents.includes('codex') ||
    !manifest.supportedAgents.includes('claude-code') ||
    !manifest.supportedAgents.includes('opencode')
  ) {
    issues.push('Manifest supportedAgents must include codex, claude-code, and opencode.');
  }

  if (
    !Array.isArray(manifest.generatedArtifacts) ||
    !manifest.generatedArtifacts.some((a) => /opencode/i.test(a))
  ) {
    issues.push('Manifest generatedArtifacts should include OpenCode files.');
  }

  // Required root files
  const requiredRootFiles = [
    'README.md',
    'QUICKSTART.md',
    'TROUBLESHOOTING.md',
    'START_HERE.md',
    '00_PROJECT_CONTEXT.md',
    '01_CONTEXT_RULES.md',
    '02_HOW_TO_USE_WITH_CODEX.md',
    '03_HOW_TO_USE_WITH_CLAUDE_CODE.md',
    '04_HOW_TO_USE_WITH_OPENCODE.md',
    'AGENTS.md',
    'CODEX_START_HERE.md',
    'CLAUDE_START_HERE.md',
    'OPENCODE_START_HERE.md',
    'CODEX_HANDOFF_PROMPT.md',
    'CLAUDE_HANDOFF_PROMPT.md',
    'OPENCODE_HANDOFF_PROMPT.md',
    '00_APPROVAL_GATE.md',
    'PROJECT_BRIEF.md',
    'PHASE_PLAN.md',
    'repo/manifest.json',
    'repo/xelera-state.json'
  ];

  for (const file of requiredRootFiles) {
    if (!fs.existsSync(path.join(packageRoot, file))) {
      issues.push(`Missing required file: ${file}. Regenerate the package or restore this file.`);
    }
  }

  // Phase-level validation
  for (let index = 1; index <= manifest.phaseCount; index += 1) {
    const slug = getPhaseSlug(index);
    const phaseFiles = [
      `phases/${slug}/PHASE_BRIEF.md`,
      `phases/${slug}/ENTRY_GATE.md`,
      `phases/${slug}/CODEX_BUILD_PROMPT.md`,
      `phases/${slug}/CLAUDE_BUILD_PROMPT.md`,
      `phases/${slug}/OPENCODE_BUILD_PROMPT.md`,
      `phases/${slug}/VERIFY_PROMPT.md`,
      `phases/${slug}/VERIFICATION_REPORT.md`,
      `phases/${slug}/EVIDENCE_CHECKLIST.md`,
      `phases/${slug}/EXIT_GATE.md`,
      `phases/${slug}/TEST_PLAN.md`,
      `phases/${slug}/HANDOFF_SUMMARY.md`,
      `phases/${slug}/NEXT_PHASE_CONTEXT.md`
    ];

    for (const file of phaseFiles) {
      if (!fs.existsSync(path.join(packageRoot, file))) {
        issues.push(`Missing required phase packet file: ${file}.`);
      }
    }

    const evidence = state.phaseEvidence[slug];
    if (!evidence) {
      issues.push(`State file is missing phaseEvidence for ${slug}. Regenerate the package.`);
      continue;
    }
    if (!Array.isArray(evidence.testsRun)) {
      issues.push(`Phase evidence for ${slug} is missing testsRun array.`);
    }
    if (!Array.isArray(evidence.changedFiles)) {
      issues.push(`Phase evidence for ${slug} is missing changedFiles array.`);
    }
    if (typeof evidence.verificationReportPath !== 'string') {
      issues.push(`Phase evidence for ${slug} is missing verificationReportPath string.`);
    } else if (!fs.existsSync(path.join(packageRoot, evidence.verificationReportPath))) {
      issues.push(`Phase evidence verification report path does not exist for ${slug}: ${evidence.verificationReportPath}`);
    }
    if (typeof evidence.exitGateReviewed !== 'boolean') {
      issues.push(`Phase evidence for ${slug} is missing exitGateReviewed boolean.`);
    }
    if (typeof evidence.approvedToProceed !== 'boolean') {
      issues.push(`Phase evidence for ${slug} is missing approvedToProceed boolean.`);
    }
    if (!Array.isArray(evidence.knownIssues)) {
      issues.push(`Phase evidence for ${slug} is missing knownIssues array.`);
    }
    if (!Array.isArray(evidence.evidenceFiles)) {
      issues.push(`Phase evidence for ${slug} is missing evidenceFiles array.`);
    }
    if (typeof evidence.reviewerRecommendation !== 'string') {
      issues.push(`Phase evidence for ${slug} is missing reviewerRecommendation string.`);
    }

    // Validate verification report content
    const reportPath = path.join(packageRoot, evidence.verificationReportPath);
    if (fs.existsSync(reportPath)) {
      const reportContent = fs.readFileSync(reportPath, 'utf8');

      let result: string | undefined;
      let recommendation: string | undefined;

      try {
        result = parseExitGateResult(reportContent);
      } catch (e) {
        issues.push(`Verification report for ${slug} has an invalid result: ${(e as Error).message}`);
      }

      try {
        recommendation = parseVerificationRecommendation(reportContent);
      } catch (e) {
        issues.push(`Verification report for ${slug} has an invalid recommendation: ${(e as Error).message}`);
      }

      if (result && recommendation) {
        if (result === 'fail' && recommendation === 'proceed') {
          issues.push(`Verification report for ${slug} is inconsistent: result is "fail" but recommendation is "proceed". If the phase failed, recommendation should be "revise" or "blocked".`);
        }
        if (result === 'pass' && recommendation === 'blocked') {
          issues.push(`Verification report for ${slug} is inconsistent: result is "pass" but recommendation is "blocked". If the phase passed, recommendation should be "proceed" or "revise".`);
        }
        if (result === 'pass' && recommendation === 'proceed') {
          const reportEvidence = parseVerificationEvidenceFiles(reportContent);
          if (reportEvidence.length === 0) {
            issues.push(`Verification report for ${slug} claims pass + proceed but does not list any evidence files under ## evidence files.`);
          }
          const evidenceAssessment = assessEvidenceFilesForApproval(packageRoot, reportEvidence);
          for (const evidenceIssue of evidenceAssessment.issues) {
            issues.push(`Verification report for ${slug}: ${evidenceIssue}`);
          }
          for (const ef of evidence.evidenceFiles) {
            if (!fs.existsSync(path.join(packageRoot, ef))) {
              issues.push(`State evidenceFiles for ${slug} lists file that does not exist on disk: ${ef}`);
            }
          }
        }
      }
    }
  }

  // Completed phases must have approval or review
  for (const completedSlug of state.completedPhases) {
    const evidence = state.phaseEvidence[completedSlug];
    if (!evidence) {
      issues.push(`Completed phase ${completedSlug} is missing evidence.`);
      continue;
    }
    if (!evidence.approvedToProceed && !evidence.exitGateReviewed) {
      issues.push(`Completed phase ${completedSlug} does not have approval or reviewed exit gate evidence.`);
    }
  }

  // Previous phase must be approved if current > 1
  if (state.currentPhase > 1) {
    const previousSlug = getPhaseSlug(state.currentPhase - 1);
    const previousEvidence = state.phaseEvidence[previousSlug];
    if (!previousEvidence) {
      issues.push(`Previous phase evidence missing for ${previousSlug}.`);
    } else if (!previousEvidence.approvedToProceed) {
      issues.push(`Current phase advanced without approval or evidence for ${previousSlug}. Run validate and verify the previous phase before continuing.`);
    }
  }

  printIssues(packageRoot, issues);
}

function readManifest(packageRoot: string) {
  return readJsonFile<{
    phaseCount: number;
    lifecycleStatus: string;
    warningCounts: Record<string, number>;
    currentPhase?: number;
    blockedPhases?: string[];
    supportedAgents?: string[];
    generatedArtifacts?: string[];
    approvedForBuild?: boolean;
  }>(path.join(packageRoot, 'repo', 'manifest.json'));
}

function printIssues(packageRoot: string, issues: string[]) {
  if (issues.length === 0) {
    const manifest = readManifest(packageRoot);
    const state = readState(packageRoot);
    console.log(
      `Validated ${packageRoot}. File structure and verification fields are valid. Lifecycle=${manifest.lifecycleStatus}, phases=${manifest.phaseCount}, blockerWarnings=${manifest.warningCounts.blocker}, currentPhase=${state.currentPhase}.`
    );
    if (manifest.lifecycleStatus === 'Blocked' || manifest.warningCounts.blocker > 0) {
      console.log('Validation passed, but this package is still blocked and cannot advance until the blocker warnings are resolved.');
    }
    return;
  }

  console.log(`Validation found ${issues.length} issue(s) in ${packageRoot}:\n`);
  for (const issue of issues) {
    console.log(`- ${issue}`);
  }
  console.log('\nTip: Fix the listed files and run validate again. For verification issues, update the VERIFICATION_REPORT.md with correct result and recommendation values.');
  process.exit(1);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    runValidate();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
