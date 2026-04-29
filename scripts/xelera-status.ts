#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getArg,
  getPhaseSlug,
  parseExitGateResult,
  parseVerificationEvidenceFiles,
  parseVerificationRecommendation,
  readJsonFile,
  readState,
  resolvePackageRoot
} from './xelera-package-utils';

function getPhaseTitle(packageRoot: string, slug: string): string {
  const readmePath = path.join(packageRoot, 'phases', slug, 'README.md');
  if (fs.existsSync(readmePath)) {
    const firstLine = fs.readFileSync(readmePath, 'utf8').split('\n')[0] || '';
    const match = firstLine.match(/^#\s*(.+)/);
    if (match) return match[1].trim();
  }
  const briefPath = path.join(packageRoot, 'phases', slug, 'PHASE_BRIEF.md');
  if (fs.existsSync(briefPath)) {
    const content = fs.readFileSync(briefPath, 'utf8');
    const match = content.match(/##\s*Phase\s*\n(.+)/);
    if (match) return match[1].trim();
  }
  return slug;
}

function getProjectName(packageRoot: string): string {
  const briefPath = path.join(packageRoot, 'PROJECT_BRIEF.md');
  if (fs.existsSync(briefPath)) {
    const content = fs.readFileSync(briefPath, 'utf8');
    const match = content.match(/##\s*Product\s*\n(.+)/);
    if (match) return match[1].trim();
  }
  return 'Unknown Project';
}

function countExistingEvidenceFiles(packageRoot: string, evidenceFiles: string[]): number {
  return evidenceFiles.filter((ef) => fs.existsSync(path.join(packageRoot, ef))).length;
}

function splitEvidenceFilesByDiskState(packageRoot: string, evidenceFiles: string[]) {
  const existing: string[] = [];
  const missing: string[] = [];

  for (const evidenceFile of evidenceFiles) {
    if (fs.existsSync(path.join(packageRoot, evidenceFile))) {
      existing.push(evidenceFile);
    } else {
      missing.push(evidenceFile);
    }
  }

  return { existing, missing };
}

function readVerificationReport(packageRoot: string, reportPath: string): string | null {
  const fullPath = path.join(packageRoot, reportPath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf8');
}

export function runStatus() {
  const packageRoot = resolvePackageRoot(getArg('package'));
  const state = readState(packageRoot);
  const manifest = readJsonFile<{
    warningCounts: Record<string, number>;
    approvedForBuild: boolean;
    phaseCount: number;
    lifecycleStatus: string;
  }>(path.join(packageRoot, 'repo', 'manifest.json'));

  const currentSlug = getPhaseSlug(state.currentPhase);
  const currentEvidence = state.phaseEvidence[currentSlug];
  const phaseTitle = getPhaseTitle(packageRoot, currentSlug);
  const projectName = getProjectName(packageRoot);

  // Determine verification status from report
  let verificationStatus = 'pending';
  let resultText = 'not reviewed';
  let recommendationText = 'none';
  let scaffoldEvidencePresent = 0;
  let scaffoldEvidenceTotal = 0;
  let listedEvidenceFiles: string[] = [];
  let listedEvidencePresent: string[] = [];
  let missingListedEvidenceFiles: string[] = [];
  let evidenceReadiness = 'Not ready: verification report has not been reviewed yet.';

  if (currentEvidence) {
    scaffoldEvidenceTotal = currentEvidence.evidenceFiles.length;
    scaffoldEvidencePresent = countExistingEvidenceFiles(packageRoot, currentEvidence.evidenceFiles);

    const reportContent = readVerificationReport(packageRoot, currentEvidence.verificationReportPath);
    if (reportContent) {
      listedEvidenceFiles = parseVerificationEvidenceFiles(reportContent);
      const evidenceByDiskState = splitEvidenceFilesByDiskState(packageRoot, listedEvidenceFiles);
      listedEvidencePresent = evidenceByDiskState.existing;
      missingListedEvidenceFiles = evidenceByDiskState.missing;

      try {
        const result = parseExitGateResult(reportContent);
        const recommendation = parseVerificationRecommendation(reportContent);
        resultText = result;
        recommendationText = recommendation;

        if (result === 'pending' || recommendation === 'pending') {
          verificationStatus = 'pending';
        } else if (result === 'fail') {
          verificationStatus = 'failed';
        } else if (recommendation === 'blocked') {
          verificationStatus = 'blocked';
        } else if (recommendation === 'revise') {
          verificationStatus = 'requires-revision';
        } else if (result === 'pass' && recommendation === 'proceed') {
          verificationStatus = 'passed';
        } else {
          verificationStatus = 'unclear';
        }
      } catch {
        verificationStatus = 'malformed-report';
      }

      if (listedEvidenceFiles.length === 0) {
        evidenceReadiness = 'Not ready: scaffold files exist, but the verification report does not list any evidence files yet.';
      } else if (missingListedEvidenceFiles.length > 0) {
        evidenceReadiness = 'Not ready: the verification report lists evidence files, but some are missing on disk.';
      } else if (resultText === 'pass' && recommendationText === 'proceed') {
        evidenceReadiness = 'Verification report is complete and the listed evidence files exist on disk.';
      } else {
        evidenceReadiness =
          'Evidence is cited and present on disk, but phase advancement still depends on the verification result and recommendation.';
      }
    }
  }

  const hasBlockers = manifest.warningCounts.blocker > 0 || state.blockedPhases.length > 0;
  const entryGateSatisfied = !state.blockedPhases.includes(currentSlug) && !hasBlockers;
  const finalPhaseComplete =
    state.currentPhase === manifest.phaseCount &&
    state.completedPhases.includes(currentSlug) &&
    currentEvidence?.approvedToProceed;
  const lifecycleComplete =
    manifest.approvedForBuild &&
    state.lifecycleStatus === 'ApprovedForBuild' &&
    !hasBlockers &&
    finalPhaseComplete;

  if (hasBlockers && resultText === 'pass' && recommendationText === 'proceed') {
    evidenceReadiness =
      'Verification is complete, but the package is still blocked. Resolve the blocker warnings before trying to advance.';
  }

  // Next action
  let nextAction = '';
  if (lifecycleComplete) {
    nextAction =
      'Lifecycle complete. Maintain release evidence, keep CURRENT_STATUS.md and final reports synchronized, and use FINAL_HANDOFF.md for the next operator handoff.';
  } else if (hasBlockers) {
    nextAction = 'Resolve blocker warnings before continuing. Review SCORECARD.md and 00_APPROVAL_GATE.md.';
  } else if (state.currentPhase > 1 && !state.completedPhases.includes(getPhaseSlug(state.currentPhase - 1))) {
    nextAction = `Previous phase (${getPhaseSlug(state.currentPhase - 1)}) is not marked complete. Verify and advance it first.`;
  } else if (missingListedEvidenceFiles.length > 0) {
    nextAction = `Fix the missing evidence files listed in ${currentSlug} before proceeding, then update the verification report if the evidence list changed.`;
  } else if (currentEvidence && listedEvidenceFiles.length === 0) {
    nextAction = `Complete the verification for ${currentSlug}: run tests, fill out VERIFICATION_REPORT.md with result and recommendation, and list the evidence files you are relying on under ## evidence files.`;
  } else if (verificationStatus === 'pending') {
    nextAction = `Complete the verification for ${currentSlug}: run tests, fill out VERIFICATION_REPORT.md with result and recommendation, and check EVIDENCE_CHECKLIST.md.`;
  } else if (verificationStatus === 'failed') {
    nextAction = `Fix the issues that caused the fail result in ${currentSlug}, then re-run verification and update the report.`;
  } else if (verificationStatus === 'blocked') {
    nextAction = `Address the blockers in ${currentSlug} before proceeding. Update the verification report to reflect resolution.`;
  } else if (verificationStatus === 'requires-revision') {
    nextAction = `Revise the work in ${currentSlug} based on the review feedback, then re-verify.`;
  } else if (verificationStatus === 'malformed-report') {
    nextAction = `Fix the verification report for ${currentSlug}. Use valid values: result must be pass|fail|pending, recommendation must be proceed|revise|blocked|pending.`;
  } else if (verificationStatus === 'passed' && state.currentPhase === manifest.phaseCount) {
    nextAction =
      'Final phase verification is complete. Record final approval artifacts, confirm lifecycle state, and keep the release handoff synchronized before closing the package.';
  } else if (verificationStatus === 'passed') {
    nextAction = `Advance to the next phase with: npm run next-phase -- --package=${packageRoot} --evidence=${currentEvidence?.verificationReportPath || `phases/${currentSlug}/VERIFICATION_REPORT.md`}`;
  } else {
    nextAction = 'Review the current phase and verification report to determine the next step.';
  }

  if (currentEvidence?.manualApproval && !lifecycleComplete) {
    nextAction = `This phase was manually approved. You may still advance with: npm run next-phase -- --package=${packageRoot} --approve=true`;
  }

  console.log('');
  console.log('========================================');
  console.log('  Xelera Method Package Status');
  console.log('========================================');
  console.log('');
  console.log(`Project:        ${projectName}`);
  console.log(`Current phase:  ${state.currentPhase} - ${phaseTitle}`);
  console.log(`Phase slug:     ${currentSlug}`);
  console.log(`Lifecycle:      ${state.lifecycleStatus}`);
  console.log(`Approved build: ${manifest.approvedForBuild ? 'Yes' : 'No'}`);
  console.log('');
  console.log('Phase State');
  console.log('----------------------------------------');
  console.log(`Entry gate:          ${entryGateSatisfied ? 'Satisfied' : 'Blocked or unresolved warnings'}`);
  console.log(`Exit verification:   ${verificationStatus}`);
  console.log(`Result:              ${resultText}`);
  console.log(`Recommendation:      ${recommendationText}`);
  console.log(`Evidence scaffold files on disk:   ${scaffoldEvidencePresent} of ${scaffoldEvidenceTotal} present`);
  console.log(
    `Evidence listed in verification report: ${listedEvidenceFiles.length === 0 ? 'none yet' : `${listedEvidencePresent.length} of ${listedEvidenceFiles.length} listed file(s) present`}`
  );
  console.log(`Evidence readiness:               ${evidenceReadiness}`);
  console.log(`Missing listed evidence files:    ${missingListedEvidenceFiles.join(', ') || 'none'}`);
  console.log(`Exit gate reviewed:  ${currentEvidence?.exitGateReviewed ? 'Yes' : 'No'}`);
  console.log(`Approved to proceed: ${currentEvidence?.approvedToProceed ? 'Yes' : 'No'}`);
  console.log(`Manual approval:     ${currentEvidence?.manualApproval ? 'Yes' : 'No'}`);
  console.log('');
  console.log('Package Health');
  console.log('----------------------------------------');
  console.log(`Blockers:         ${manifest.warningCounts.blocker || 0}`);
  console.log(`Warnings:         ${manifest.warningCounts.warning || 0}`);
  console.log(`Info notes:       ${manifest.warningCounts.info || 0}`);
  console.log(`Completed phases: ${state.completedPhases.join(', ') || 'none'}`);
  console.log(`Blocked phases:   ${state.blockedPhases.join(', ') || 'none'}`);
  console.log('');
  console.log('Next Recommended Action');
  console.log('----------------------------------------');
  console.log(nextAction);
  console.log('');
  console.log('========================================');
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    runStatus();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
