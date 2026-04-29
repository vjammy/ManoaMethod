#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessEvidenceFilesForApproval,
  fileExists,
  findVerificationBodyContradictions,
  getArg,
  getPhaseSlug,
  parseExitGateResult,
  parseVerificationBullets,
  parseVerificationEvidenceFiles,
  parseVerificationRecommendation,
  readJsonFile,
  readState,
  readTextFile,
  resolveEvidencePath,
  resolvePackageRoot,
  writeJsonFile
} from './manoa-package-utils';
import type { ManoaState } from '../lib/types';

export function runNextPhase() {
  const packageRoot = resolvePackageRoot(getArg('package'));
  const state = readState(packageRoot);
  const manifest = readJsonFile<{ phaseCount: number; lifecycleStatus: string }>(
    path.join(packageRoot, 'repo', 'manifest.json')
  );
  const approve = (getArg('approve') || '').toLowerCase() === 'true';
  const evidenceArg = getArg('evidence');

  if (state.blockedPhases.length) {
    throw new Error(`Cannot move to the next phase while blocked phases exist: ${state.blockedPhases.join(', ')}`);
  }

  if (!approve && !evidenceArg) {
    throw new Error('next-phase requires either --approve=true or --evidence=phases/phase-XX/VERIFICATION_REPORT.md');
  }

  const currentSlug = getPhaseSlug(state.currentPhase);
  const phaseRecord = state.phaseEvidence[currentSlug];
  if (!phaseRecord) {
    throw new Error(`Missing phase evidence record for ${currentSlug}`);
  }

  let verificationReportPath = phaseRecord.verificationReportPath;
  let approvedToProceed = approve;
  let exitGateReviewed = phaseRecord.exitGateReviewed;
  let knownIssues = phaseRecord.knownIssues;
  let testsRun = phaseRecord.testsRun;
  let changedFiles = phaseRecord.changedFiles;
  let evidenceFiles = phaseRecord.evidenceFiles;
  let reviewerRecommendation = phaseRecord.reviewerRecommendation;
  let manualApproval = false;

  if (evidenceArg) {
    const absoluteEvidencePath = resolveEvidencePath(packageRoot, evidenceArg);
    if (!fileExists(absoluteEvidencePath)) {
      throw new Error(`Verification evidence file not found: ${evidenceArg}`);
    }

    const reportContent = readTextFile(absoluteEvidencePath);
    const recommendation = parseVerificationRecommendation(reportContent);
    const exitGateResult = parseExitGateResult(reportContent);

    // Reject pending reviews
    if (recommendation === 'pending') {
      throw new Error('Cannot advance phase because verification recommendation is still pending. Complete the review and set recommendation to proceed, revise, or blocked.');
    }
    if (exitGateResult === 'pending') {
      throw new Error('Cannot advance phase because verification result is still pending. Complete the review and set result to pass or fail.');
    }

    // Reject negative recommendations
    if (recommendation === 'blocked') {
      throw new Error('Cannot advance phase because verification recommends blocked.');
    }
    if (recommendation === 'revise') {
      throw new Error('Cannot advance phase because verification recommends revise.');
    }
    if (recommendation !== 'proceed') {
      throw new Error('Cannot advance phase because verification report does not contain a proceed recommendation.');
    }

    // Reject failed results and enforce consistency
    if (exitGateResult === 'fail') {
      throw new Error('Cannot advance phase because verification result is fail. A failed result with a proceed recommendation is inconsistent. If the phase failed, recommendation should be revise or blocked.');
    }
    if (exitGateResult !== 'pass') {
      throw new Error('Cannot advance phase because verification report does not contain a pass result.');
    }
    if (findVerificationBodyContradictions(reportContent)) {
      throw new Error('Verification report headers say pass/proceed, but the report body appears to describe a blocked or failed phase.');
    }

    const reportEvidenceFiles = parseVerificationEvidenceFiles(reportContent);
    if (reportEvidenceFiles.length === 0) {
      throw new Error('Cannot advance phase because the verification report does not list any evidence files. Add at least one file under ## evidence files.');
    }
    const evidenceAssessment = assessEvidenceFilesForApproval(packageRoot, reportEvidenceFiles);
    if (evidenceAssessment.issues.length > 0) {
      throw new Error(`Cannot advance phase because the listed evidence is not strong enough: ${evidenceAssessment.issues.join(' ')}`);
    }

    verificationReportPath = path.relative(packageRoot, absoluteEvidencePath).replace(/\\/g, '/');
    approvedToProceed = true;
    exitGateReviewed = true;
    reviewerRecommendation = recommendation;
    knownIssues = parseVerificationBullets(reportContent, 'Unresolved issues').concat(parseVerificationBullets(reportContent, 'defects found'));
    testsRun = parseVerificationBullets(reportContent, 'Commands run').concat(parseVerificationBullets(reportContent, 'commands run'));
    changedFiles = parseVerificationBullets(reportContent, 'Files changed').concat(parseVerificationBullets(reportContent, 'files changed'));
    evidenceFiles = Array.from(new Set(evidenceFiles.concat([verificationReportPath]).concat(reportEvidenceFiles)));
  }

  if (approve && !evidenceArg) {
    manualApproval = true;
    approvedToProceed = true;
  }

  if (!approvedToProceed) {
    throw new Error('Cannot advance phase because the current phase is not approved to proceed.');
  }

  const nextPhaseNumber = Math.min(state.currentPhase + 1, manifest.phaseCount);
  const nextSlug = getPhaseSlug(nextPhaseNumber);
  const handoff = getArg('handoff') || state.lastHandoffSummary;

  const nextState: ManoaState = {
    ...state,
    completedPhases: state.completedPhases.includes(currentSlug)
      ? state.completedPhases
      : state.completedPhases.concat(currentSlug),
    currentPhase: nextPhaseNumber,
    lastHandoffSummary: handoff,
    lifecycleStatus: manifest.lifecycleStatus as ManoaState['lifecycleStatus'],
    blockedPhases: state.currentPhase >= manifest.phaseCount ? state.blockedPhases : [],
    phaseEvidence: {
      ...state.phaseEvidence,
      [currentSlug]: {
        ...phaseRecord,
        verificationReportPath,
        approvedToProceed,
        exitGateReviewed,
        knownIssues,
        testsRun,
        changedFiles,
        evidenceFiles,
        reviewerRecommendation,
        manualApproval
      }
    }
  };

  writeJsonFile(path.join(packageRoot, 'repo', 'manoa-state.json'), nextState);
  writeJsonFile(path.join(packageRoot, 'repo', 'manifest.json'), {
    ...manifest,
    currentPhase: nextState.currentPhase,
    blockedPhases: nextState.blockedPhases
  });
  console.log(`Moved package to ${nextSlug}. Updated repo/manoa-state.json with verification evidence.`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    runNextPhase();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
