#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

const CHECKS = {
  pass: 0,
  fail: 0,
  issues: [] as string[]
};

function check(name: string, condition: boolean, message: string) {
  if (condition) {
    CHECKS.pass++;
  } else {
    CHECKS.fail++;
    CHECKS.issues.push(`FAIL: ${name}: ${message}`);
  }
}

function fileExists(packageRoot: string, filePath: string) {
  return fs.existsSync(path.join(packageRoot, filePath));
}

function readFile(packageRoot: string, filePath: string) {
  const fullPath = path.join(packageRoot, filePath);
  if (!fs.existsSync(fullPath)) return '';
  return fs.readFileSync(fullPath, 'utf8');
}

function runRegression(packageRoot: string) {
  console.log(`Running regression suite on ${packageRoot}...\n`);

  // Artifact completeness
  check(
    'Root files exist',
    fileExists(packageRoot, 'START_HERE.md') &&
      fileExists(packageRoot, 'PROJECT_BRIEF.md') &&
      fileExists(packageRoot, 'PHASE_PLAN.md') &&
      fileExists(packageRoot, 'SCORECARD.md') &&
      fileExists(packageRoot, 'TESTING_STRATEGY.md') &&
      fileExists(packageRoot, 'REGRESSION_TEST_PLAN.md') &&
      fileExists(packageRoot, 'TEST_SCRIPT_INDEX.md') &&
      fileExists(packageRoot, 'AGENTS.md'),
    'Missing required root files'
  );

  // AGENTS.md includes Core Agent Operating Rules
  const agentsMd = readFile(packageRoot, 'AGENTS.md');
  check(
    'AGENTS.md includes Core Agent Operating Rules',
    /## Core Agent Operating Rules/.test(agentsMd) &&
      /Don't assume/.test(agentsMd) &&
      /Minimum code/.test(agentsMd) &&
      /Touch only what you must/.test(agentsMd) &&
      /Define success criteria/.test(agentsMd),
    'AGENTS.md missing Core Agent Operating Rules'
  );

  // Phase folders and files
  const manifest = JSON.parse(readFile(packageRoot, 'repo/manifest.json') || '{}');
  const phaseCount = manifest.phaseCount || 0;
  check(
    'Manifest has phase count',
    phaseCount >= 10,
    `Phase count ${phaseCount} is below minimum of 10`
  );

  for (let i = 1; i <= phaseCount; i++) {
    const slug = `phase-${String(i).padStart(2, '0')}`;
    const phaseFolder = `phases/${slug}`;

    check(
      `Phase ${slug} has PHASE_BRIEF.md`,
      fileExists(packageRoot, `${phaseFolder}/PHASE_BRIEF.md`),
      `Missing ${phaseFolder}/PHASE_BRIEF.md`
    );
    check(
      `Phase ${slug} has ENTRY_GATE.md`,
      fileExists(packageRoot, `${phaseFolder}/ENTRY_GATE.md`),
      `Missing ${phaseFolder}/ENTRY_GATE.md`
    );
    check(
      `Phase ${slug} has EXIT_GATE.md`,
      fileExists(packageRoot, `${phaseFolder}/EXIT_GATE.md`),
      `Missing ${phaseFolder}/EXIT_GATE.md`
    );
    check(
      `Phase ${slug} has TEST_PLAN.md`,
      fileExists(packageRoot, `${phaseFolder}/TEST_PLAN.md`),
      `Missing ${phaseFolder}/TEST_PLAN.md`
    );
    check(
      `Phase ${slug} has TEST_SCRIPT.md`,
      fileExists(packageRoot, `${phaseFolder}/TEST_SCRIPT.md`),
      `Missing ${phaseFolder}/TEST_SCRIPT.md`
    );
    check(
      `Phase ${slug} has TEST_RESULTS.md`,
      fileExists(packageRoot, `${phaseFolder}/TEST_RESULTS.md`),
      `Missing ${phaseFolder}/TEST_RESULTS.md`
    );
    check(
      `Phase ${slug} has VERIFICATION_REPORT.md`,
      fileExists(packageRoot, `${phaseFolder}/VERIFICATION_REPORT.md`),
      `Missing ${phaseFolder}/VERIFICATION_REPORT.md`
    );
    check(
      `Phase ${slug} has EVIDENCE_CHECKLIST.md`,
      fileExists(packageRoot, `${phaseFolder}/EVIDENCE_CHECKLIST.md`),
      `Missing ${phaseFolder}/EVIDENCE_CHECKLIST.md`
    );
    check(
      `Phase ${slug} has HANDOFF_SUMMARY.md`,
      fileExists(packageRoot, `${phaseFolder}/HANDOFF_SUMMARY.md`),
      `Missing ${phaseFolder}/HANDOFF_SUMMARY.md`
    );
    check(
      `Phase ${slug} has NEXT_PHASE_CONTEXT.md`,
      fileExists(packageRoot, `${phaseFolder}/NEXT_PHASE_CONTEXT.md`),
      `Missing ${phaseFolder}/NEXT_PHASE_CONTEXT.md`
    );

    // Check TEST_RESULTS.md defaults to pending
    const testResults = readFile(packageRoot, `${phaseFolder}/TEST_RESULTS.md`);
    check(
      `Phase ${slug} TEST_RESULTS.md defaults to pending`,
      /## Final result: pending/.test(testResults),
      'TEST_RESULTS.md does not default to pending'
    );

    // Check VERIFICATION_REPORT.md has required headers
    const verificationReport = readFile(packageRoot, `${phaseFolder}/VERIFICATION_REPORT.md`);
    check(
      `Phase ${slug} VERIFICATION_REPORT.md has result field`,
      /## result: pending/.test(verificationReport),
      'VERIFICATION_REPORT.md missing result field'
    );
    check(
      `Phase ${slug} VERIFICATION_REPORT.md has recommendation field`,
      /## recommendation: pending/.test(verificationReport),
      'VERIFICATION_REPORT.md missing recommendation field'
    );
  }

  // Gate consistency
  const gate01Entry = readFile(packageRoot, 'gates/gate-01-entry.md');
  check(
    'Phase 1 entry gate does not require prior handoff',
    !/prior phase handoff/i.test(gate01Entry),
    'Phase 1 entry gate incorrectly mentions prior phase handoff'
  );

  if (phaseCount >= 2) {
    const gate02Entry = readFile(packageRoot, 'gates/gate-02-entry.md');
    check(
      'Phase 2 entry gate requires prior handoff',
      /Previous phase handoff complete/.test(gate02Entry),
      'Phase 2 entry gate missing prior handoff requirement'
    );
  }

  // Regression suite files
  check(
    'Regression suite README exists',
    fileExists(packageRoot, 'regression-suite/README.md'),
    'Missing regression-suite/README.md'
  );
  check(
    'Regression suite RUN_REGRESSION.md exists',
    fileExists(packageRoot, 'regression-suite/RUN_REGRESSION.md'),
    'Missing regression-suite/RUN_REGRESSION.md'
  );

  // Local-first checks
  const allFiles = manifest.generatedArtifacts || [];
  const hasCloudRefs = allFiles.some((f: string) =>
    /aws|azure|gcp|cloud|saas|hosted|database|auth0/i.test(f)
  );
  check(
    'No cloud dependency references in manifest',
    !hasCloudRefs,
    'Manifest references cloud/hosted services'
  );

  // Scorecard consistency
  const scorecard = readFile(packageRoot, 'SCORECARD.md');
  const lifecycle = manifest.lifecycleStatus;
  if (lifecycle === 'Blocked') {
    check(
      'Blocked package scorecard does not claim Build ready',
      !/## Rating\s+Build ready/i.test(scorecard),
      'Blocked package SCORECARD says Build ready'
    );
  }

  console.log(`\n========================================`);
  console.log(`  Regression Suite Results`);
  console.log(`========================================`);
  console.log(`Passed: ${CHECKS.pass}`);
  console.log(`Failed: ${CHECKS.fail}`);
  console.log(`Total:  ${CHECKS.pass + CHECKS.fail}`);
  console.log(`========================================`);

  if (CHECKS.issues.length > 0) {
    console.log('\nIssues:');
    for (const issue of CHECKS.issues) {
      console.log(`  ${issue}`);
    }
    process.exit(1);
  } else {
    console.log('\nAll regression checks passed.');
  }
}

function resolvePackageRootArg(): string {
  const flag = process.argv.find((arg) => arg.startsWith('--package='));
  if (flag) return flag.slice('--package='.length);
  const positional = process.argv[2];
  if (positional && !positional.startsWith('--')) return positional;
  if (process.env.INIT_CWD) return process.env.INIT_CWD;
  return process.cwd();
}

const packageRoot = resolvePackageRootArg();
runRegression(path.resolve(packageRoot));
