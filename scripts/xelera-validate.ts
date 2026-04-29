#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessEvidenceFilesForApproval,
  findVerificationBodyContradictions,
  getArg,
  getPhaseSlug,
  parseExitGateResult,
  parseVerificationEvidenceFiles,
  parseVerificationRecommendation,
  readJsonFile,
  readState,
  resolvePackageRoot
} from './xelera-package-utils';

const GENERIC_TEST_PHRASES = [
  'run the tests and confirm everything works',
  'verify implementation is correct',
  'check all files',
  'all tests passed',
  'evidence: completed',
  'no issues found',
  'looks good',
  'everything passes',
  'ready to proceed'
];

const DISALLOWED_TEST_RESULT_DEFAULTS = ['pass', 'passed', 'complete', 'ready', 'approved'];

function containsGenericTestContent(content: string) {
  const normalized = content.toLowerCase();
  return GENERIC_TEST_PHRASES.some((phrase) => normalized.includes(phrase));
}

function parseTestResult(content: string): string | undefined {
  const headerMatch = content.match(/##\s*Final result:\s*(.+)/i);
  const raw = headerMatch?.[1]?.trim().toLowerCase();
  return raw;
}

function hasRealTestEvidence(content: string): boolean {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const templateIndicators = [
    (line: string) => line.startsWith('#'),
    (line: string) => line === '-',
    (line: string) => line === 'pending',
    (line: string) => line.startsWith('Allowed:'),
    (line: string) => line.startsWith('## Final result:'),
    (line: string) => line.startsWith('## Recommendation:'),
    (line: string) => line.startsWith('## Overall result:'),
    (line: string) => line.startsWith('## Date'),
    (line: string) => line.startsWith('## Phase name'),
    (line: string) => line.startsWith('## Tester/agent'),
    (line: string) => line.startsWith('## Runner'),
    (line: string) => line.startsWith('## Suite version'),
    (line: string) => line.startsWith('- [ ]'),
    (line: string) => /^-\s+\w+[-\s\w]*:\s+pending$/.test(line),
    (line: string) => line.toLowerCase().includes('do not pre-fill'),
    (line: string) => line.toLowerCase().includes('record the test results for this phase here'),
    (line: string) => line.toLowerCase().includes('record the results of running the regression suite here'),
    (line: string) => line.toLowerCase().includes('what this file is for'),
    (line: string) => line.toLowerCase().includes('generated with project package')
  ];
  // Require at least a few non-template lines to count as real evidence
  const nonTemplateLines = lines.filter((line) => !templateIndicators.some((fn) => fn(line)));
  return nonTemplateLines.length >= 2 && nonTemplateLines.join(' ').length >= 40;
}

function parseRegressionResult(content: string): string | undefined {
  const headerMatch = content.match(/##\s*Overall result:\s*(.+)/i);
  const raw = headerMatch?.[1]?.trim().toLowerCase();
  return raw;
}

const REQUIRED_MODULE_FILES = {
  'product-strategy': [
    'PRODUCT_STRATEGY_START_HERE.md',
    'PRODUCT_NORTH_STAR.md',
    'TARGET_USERS.md',
    'MVP_SCOPE.md',
    'OUT_OF_SCOPE.md',
    'SUCCESS_METRICS.md',
    'TRADEOFF_LOG.md',
    'PRODUCT_STRATEGY_GATE.md'
  ],
  requirements: [
    'REQUIREMENTS_START_HERE.md',
    'FUNCTIONAL_REQUIREMENTS.md',
    'NON_FUNCTIONAL_REQUIREMENTS.md',
    'ACCEPTANCE_CRITERIA.md',
    'OPEN_QUESTIONS.md',
    'REQUIREMENTS_RISK_REVIEW.md',
    'REQUIREMENTS_GATE.md'
  ],
  'security-risk': [
    'SECURITY_START_HERE.md',
    'DATA_CLASSIFICATION.md',
    'SECRET_MANAGEMENT.md',
    'PRIVACY_RISK_REVIEW.md',
    'AUTHORIZATION_REVIEW.md',
    'DEPENDENCY_RISK_CHECKLIST.md',
    'SECURITY_GATE.md'
  ],
  integrations: [
    'INTEGRATION_START_HERE.md',
    'EXTERNAL_SERVICES.md',
    'API_KEYS_AND_SECRETS.md',
    'ENVIRONMENT_VARIABLES.md',
    'WEBHOOKS.md',
    'FAILURE_MODES.md',
    'MOCKING_STRATEGY.md',
    'INTEGRATION_TEST_PLAN.md',
    'INTEGRATION_GATE.md'
  ],
  architecture: [
    'ARCHITECTURE_START_HERE.md',
    'SYSTEM_OVERVIEW.md',
    'DATA_MODEL.md',
    'API_CONTRACTS.md',
    'STATE_MANAGEMENT.md',
    'ARCHITECTURE_DECISIONS.md',
    'ARCHITECTURE_GATE.md'
  ]
} as const;

function readOptionalInput(packageRoot: string) {
  const inputPath = path.join(packageRoot, 'repo', 'input.json');
  if (!fs.existsSync(inputPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(inputPath, 'utf8')) as {
      productName?: string;
      productIdea?: string;
      problemStatement?: string;
      mustHaveFeatures?: string;
      dataAndIntegrations?: string;
      nonGoals?: string;
      constraints?: string;
      risks?: string;
      targetAudience?: string;
    };
  } catch {
    return undefined;
  }
}

function fileContainsAll(filePath: string, patterns: RegExp[]) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  return patterns.every((pattern) => pattern.test(content));
}

function projectNeedsSecurity(input?: ReturnType<typeof readOptionalInput>) {
  const source = Object.values(input || {}).join(' ');
  return /private|privacy|sensitive|medical|health|financial|money|legal|family|child|student|role|permission|record|document/i.test(source);
}

function projectNeedsIntegration(input?: ReturnType<typeof readOptionalInput>) {
  const source = Object.values(input || {}).join(' ');
  return /api|external service|integration|payment|email|oauth|webhook|storage|database|calendar|slack|crm/i.test(source) && !/future .*integration/i.test(source);
}

function architectureLooksOverbuilt(systemOverview: string, outOfScope: string, input?: ReturnType<typeof readOptionalInput>) {
  const complexitySignals = /(microservices|kubernetes|service mesh|event bus|multi-region|data lake|distributed system)/i;
  const simpleMvpSignals = /(local-first|markdown-first|no database|no auth|first release|mvp)/i;
  return complexitySignals.test(systemOverview) && (simpleMvpSignals.test(outOfScope) || simpleMvpSignals.test(Object.values(input || {}).join(' ')));
}

export function runValidate() {
  const packageRoot = resolvePackageRoot(getArg('package'));
  const issues: string[] = [];
  const input = readOptionalInput(packageRoot);

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
    'BUSINESS_USER_START_HERE.md',
    'CURRENT_STATUS.md',
    'COPY_PASTE_PROMPTS.md',
    'MODULE_MAP.md',
    'WHAT_TO_IGNORE_FOR_NOW.md',
    'FINAL_CHECKLIST.md',
    'BUILD_TARGET.md',
    'PRODUCTION_SCOPE.md',
    'DEPLOYMENT_PLAN.md',
    'ENVIRONMENT_SETUP.md',
    'PRODUCTION_READINESS_CHECKLIST.md',
    'OPERATIONS_RUNBOOK.md',
    'INCIDENT_RESPONSE_GUIDE.md',
    'ROLLBACK_PLAN.md',
    'SECURITY_REVIEW.md',
    'PERFORMANCE_PLAN.md',
    'RELEASE_CHECKLIST.md',
    'PRODUCTION_GATE.md',
    'FINAL_RELEASE_REPORT.md',
    'FINAL_HANDOFF.md',
    'FINAL_GATE_REPORT.md',
    'FINAL_SCORECARD.md',
    'FINAL_RECOVERY_SUMMARY.md',
    'FINAL_DEPLOYMENT_STATUS.md',
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

  // Required root testing files
  const requiredRootTestingFiles = [
    'TESTING_STRATEGY.md',
    'REGRESSION_TEST_PLAN.md',
    'TEST_SCRIPT_INDEX.md',
    'auto-improve/PROGRAM.md',
    'auto-improve/QUALITY_RUBRIC.md',
    'auto-improve/SCORECARD.md',
    'auto-improve/RUN_LOOP.md',
    'auto-improve/results.tsv'
  ];
  for (const file of requiredRootTestingFiles) {
    if (!fs.existsSync(path.join(packageRoot, file))) {
      issues.push(`Missing required root testing file: ${file}.`);
    }
  }

  // Required regression suite files
  const requiredRegressionFiles = [
    'regression-suite/README.md',
    'regression-suite/RUN_REGRESSION.md',
    'regression-suite/REGRESSION_CHECKLIST.md',
    'regression-suite/REGRESSION_RESULTS_TEMPLATE.md',
    'regression-suite/scripts/README.md',
    'regression-suite/scripts/run-all.md',
    'regression-suite/scripts/run-regression.ts',
    'regression-suite/scripts/artifact-integrity.md',
    'regression-suite/scripts/gate-consistency.md',
    'regression-suite/scripts/evidence-quality.md',
    'regression-suite/scripts/handoff-continuity.md',
    'regression-suite/scripts/agent-rules.md',
    'regression-suite/scripts/local-first.md'
  ];
  for (const file of requiredRegressionFiles) {
    if (!fs.existsSync(path.join(packageRoot, file))) {
      issues.push(`Missing required regression suite file: ${file}.`);
    }
  }

  for (const [folder, files] of Object.entries(REQUIRED_MODULE_FILES)) {
    for (const file of files) {
      const fullPath = path.join(packageRoot, folder, file);
      if (!fs.existsSync(fullPath)) {
        issues.push(`Missing required module file: ${folder}/${file}.`);
      }
    }
  }

  const productNorthStarPath = path.join(packageRoot, 'product-strategy/PRODUCT_NORTH_STAR.md');
  if (
    !fileContainsAll(productNorthStarPath, [
      /Plain-English product goal/i,
      /Target user/i,
      /Main problem/i,
      /Desired outcome/i,
      /What success looks like/i,
      /What failure looks like/i
    ])
  ) {
    issues.push('product-strategy/PRODUCT_NORTH_STAR.md is missing one or more required sections.');
  }

  const mvpScopePath = path.join(packageRoot, 'product-strategy/MVP_SCOPE.md');
  if (
    !fileContainsAll(mvpScopePath, [
      /Must-have features/i,
      /Should-have features/i,
      /Later features/i,
      /Explicit non-goals/i
    ])
  ) {
    issues.push('product-strategy/MVP_SCOPE.md must include must-have, should-have, later, and explicit non-goal sections.');
  }

  const outOfScopePath = path.join(packageRoot, 'product-strategy/OUT_OF_SCOPE.md');
  if (
    !fileContainsAll(outOfScopePath, [
      /Features not to build yet/i,
      /Architecture not to add yet/i,
      /Integrations not to add yet/i,
      /Reasons these items are out of scope/i
    ])
  ) {
    issues.push('product-strategy/OUT_OF_SCOPE.md is missing one or more required sections.');
  }

  const acceptanceCriteriaPath = path.join(packageRoot, 'requirements/ACCEPTANCE_CRITERIA.md');
  if (
    !fileContainsAll(acceptanceCriteriaPath, [
      /Clear pass\/fail check/i,
      /Evidence required/i,
      /Test or manual verification method/i,
      /Related files/i
    ])
  ) {
    issues.push('requirements/ACCEPTANCE_CRITERIA.md is missing required acceptance evidence sections.');
  }

  const openQuestionsPath = path.join(packageRoot, 'requirements/OPEN_QUESTIONS.md');
  if (
    !fileContainsAll(openQuestionsPath, [/Unresolved assumption/i, /Owner/i, /Priority/i, /Impact if unanswered/i, /When it must be answered/i])
  ) {
    issues.push('requirements/OPEN_QUESTIONS.md is missing required open-question fields.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'security-risk/DATA_CLASSIFICATION.md'), [
      /Data types handled/i,
      /Sensitivity level/i,
      /Where data is stored/i,
      /Who can access it/i,
      /Retention notes/i,
      /Risk notes/i
    ])
  ) {
    issues.push('security-risk/DATA_CLASSIFICATION.md is missing required data classification fields.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'security-risk/SECRET_MANAGEMENT.md'), [
      /Expected secrets/i,
      /Where secrets should live/i,
      /What must never be committed/i,
      /Local development handling/i,
      /Deployment handling if applicable/i
    ])
  ) {
    issues.push('security-risk/SECRET_MANAGEMENT.md is missing required secret-management sections.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'integrations/ENVIRONMENT_VARIABLES.md'), [
      /Variable name/i,
      /Purpose/i,
      /Required or optional/i,
      /Example placeholder/i,
      /Local setup notes/i
    ])
  ) {
    issues.push('integrations/ENVIRONMENT_VARIABLES.md is missing required environment-variable sections.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'integrations/MOCKING_STRATEGY.md'), [
      /What to mock before real credentials exist/i,
      /Mock data/i,
      /Local test behavior/i,
      /When to replace mocks with real services/i
    ])
  ) {
    issues.push('integrations/MOCKING_STRATEGY.md is missing required mocking strategy sections.');
  }

  const systemOverviewPath = path.join(packageRoot, 'architecture/SYSTEM_OVERVIEW.md');
  if (
    !fileContainsAll(systemOverviewPath, [
      /Simple architecture summary/i,
      /Main components/i,
      /Data flow/i,
      /User flow/i,
      /Integration points/i,
      /What is intentionally not included/i
    ])
  ) {
    issues.push('architecture/SYSTEM_OVERVIEW.md is missing required system overview sections.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'architecture/DATA_MODEL.md'), [
      /Entities/i,
      /Fields/i,
      /Relationships/i,
      /Validation rules/i,
      /Sample records/i,
      /Risks/i
    ])
  ) {
    issues.push('architecture/DATA_MODEL.md is missing required data-model sections.');
  }

  if (projectNeedsSecurity(input) && !fs.existsSync(path.join(packageRoot, 'security-risk/SECURITY_GATE.md'))) {
    issues.push('This project appears to handle private or sensitive data, but /security-risk/ is incomplete.');
  }

  if (projectNeedsIntegration(input) && !fs.existsSync(path.join(packageRoot, 'integrations/INTEGRATION_GATE.md'))) {
    issues.push('This project appears to need external services, but /integrations/ is incomplete.');
  }

  const systemOverviewContent = fs.existsSync(systemOverviewPath) ? fs.readFileSync(systemOverviewPath, 'utf8') : '';
  const outOfScopeContent = fs.existsSync(outOfScopePath) ? fs.readFileSync(outOfScopePath, 'utf8') : '';
  if (architectureLooksOverbuilt(systemOverviewContent, outOfScopeContent, input)) {
    issues.push('architecture/SYSTEM_OVERVIEW.md appears more complex than the approved MVP scope.');
  }

  const startHereContent = fs.existsSync(path.join(packageRoot, 'START_HERE.md'))
    ? fs.readFileSync(path.join(packageRoot, 'START_HERE.md'), 'utf8')
    : '';
  if (!/do not need to open every folder/i.test(startHereContent)) {
    issues.push('START_HERE.md must tell the user they do not need to open every folder.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'BUILD_TARGET.md'), [
      /Planning package only/i,
      /Runnable MVP/i,
      /Production application/i,
      /Selected target/i
    ])
  ) {
    issues.push('BUILD_TARGET.md must distinguish planning-only, runnable MVP, and production application targets and include a selected target record.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'PRODUCTION_SCOPE.md'), [
      /What production means/i,
      /In scope for production mode/i,
      /Still out of scope/i,
      /Production-specific completion checks/i
    ])
  ) {
    issues.push('PRODUCTION_SCOPE.md is missing one or more required production-scope sections.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'DEPLOYMENT_PLAN.md'), [
      /Release objective/i,
      /Intended runtime/i,
      /Environment flow/i,
      /Deployment steps/i,
      /Ownership/i
    ])
  ) {
    issues.push('DEPLOYMENT_PLAN.md is missing one or more required deployment sections.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'ENVIRONMENT_SETUP.md'), [
      /Required environment variables/i,
      /Local prerequisites/i,
      /Production environment notes/i,
      /Validation rule/i
    ])
  ) {
    issues.push('ENVIRONMENT_SETUP.md is missing one or more required environment setup sections.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'OPERATIONS_RUNBOOK.md'), [
      /Service overview/i,
      /Daily or regular checks/i,
      /Operational commands/i,
      /Escalation path/i
    ])
  ) {
    issues.push('OPERATIONS_RUNBOOK.md is missing one or more required operations sections.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'INCIDENT_RESPONSE_GUIDE.md'), [
      /Initial response steps/i,
      /Severity guide/i,
      /Required incident evidence/i,
      /Post-incident follow-up/i
    ])
  ) {
    issues.push('INCIDENT_RESPONSE_GUIDE.md is missing one or more required incident-response sections.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'ROLLBACK_PLAN.md'), [
      /Rollback triggers/i,
      /Rollback steps/i,
      /Preconditions/i,
      /Ownership/i
    ])
  ) {
    issues.push('ROLLBACK_PLAN.md is missing one or more required rollback sections.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'SECURITY_REVIEW.md'), [
      /Product risk context/i,
      /Review areas/i,
      /Security release checks/i,
      /Result/i
    ])
  ) {
    issues.push('SECURITY_REVIEW.md is missing one or more required security review sections.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'PERFORMANCE_PLAN.md'), [
      /Critical paths/i,
      /Expected checks/i,
      /Constraints/i,
      /Result tracking/i
    ])
  ) {
    issues.push('PERFORMANCE_PLAN.md is missing one or more required performance sections.');
  }

  if (
    !fileContainsAll(path.join(packageRoot, 'PRODUCTION_GATE.md'), [
      /This gate passes only when/i,
      /This gate must fail when/i,
      /Required evidence/i
    ])
  ) {
    issues.push('PRODUCTION_GATE.md is missing one or more required production gate sections.');
  }

  const stepGuideContent = fs.existsSync(path.join(packageRoot, 'STEP_BY_STEP_BUILD_GUIDE.md'))
    ? fs.readFileSync(path.join(packageRoot, 'STEP_BY_STEP_BUILD_GUIDE.md'), 'utf8')
    : '';
  if (!/## 1\. Decide/i.test(stepGuideContent) || !/## 2\. Plan/i.test(stepGuideContent) || !/## 3\. Design/i.test(stepGuideContent) || !/## 4\. Build/i.test(stepGuideContent) || !/## 5\. Test/i.test(stepGuideContent) || !/## 6\. Handoff/i.test(stepGuideContent)) {
    issues.push('STEP_BY_STEP_BUILD_GUIDE.md must keep the Decide / Plan / Design / Build / Test / Handoff journey.');
  }

  const moduleMapContent = fs.existsSync(path.join(packageRoot, 'MODULE_MAP.md'))
    ? fs.readFileSync(path.join(packageRoot, 'MODULE_MAP.md'), 'utf8')
    : '';
  for (const phrase of [
    'Product Goal and Scope',
    'What the App Must Do',
    'Private Data and Safety Check',
    'External Services and Setup',
    'Technical Plan'
  ]) {
    if (!moduleMapContent.includes(phrase)) {
      issues.push(`MODULE_MAP.md must include "${phrase}".`);
    }
  }

  const promptsContent = fs.existsSync(path.join(packageRoot, 'COPY_PASTE_PROMPTS.md'))
    ? fs.readFileSync(path.join(packageRoot, 'COPY_PASTE_PROMPTS.md'), 'utf8')
    : '';
  for (const phrase of [
    'Confirm Product Goal and Scope',
    'Confirm What the App Must Do',
    'Review Private Data and Safety',
    'Review External Services and Setup',
    'Review Technical Plan'
  ]) {
    if (!promptsContent.includes(phrase)) {
      issues.push(`COPY_PASTE_PROMPTS.md must include "${phrase}".`);
    }
  }

  const businessStartContent = fs.existsSync(path.join(packageRoot, 'BUSINESS_USER_START_HERE.md'))
    ? fs.readFileSync(path.join(packageRoot, 'BUSINESS_USER_START_HERE.md'), 'utf8')
    : '';
  if (!/plain english/i.test(businessStartContent) || !/do not need to open every folder/i.test(businessStartContent)) {
    issues.push('Beginner-facing docs should stay plain-English and remind the user they do not need to open every folder.');
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

    // Per-phase testing files
    const testScriptPath = path.join(packageRoot, `phases/${slug}/TEST_SCRIPT.md`);
    const testResultsPath = path.join(packageRoot, `phases/${slug}/TEST_RESULTS.md`);

    if (!fs.existsSync(testScriptPath)) {
      issues.push(`Missing required phase testing file: phases/${slug}/TEST_SCRIPT.md.`);
    } else {
      const testScriptContent = fs.readFileSync(testScriptPath, 'utf8');
      const requiredSections = [
        '## What this file is for',
        '## Commands or manual procedures',
        '## Manual review checks',
        '## Pass/fail criteria',
        '## Failure handling',
        '## Evidence recording'
      ];
      for (const section of requiredSections) {
        if (!testScriptContent.includes(section)) {
          issues.push(`TEST_SCRIPT.md for ${slug} is missing required section: ${section}`);
        }
      }
      if (containsGenericTestContent(testScriptContent)) {
        issues.push(`TEST_SCRIPT.md for ${slug} contains generic or fake test content. Replace vague instructions with concrete, phase-specific checks.`);
      }
    }

    if (!fs.existsSync(testResultsPath)) {
      issues.push(`Missing required phase testing file: phases/${slug}/TEST_RESULTS.md.`);
    } else {
      const testResultsContent = fs.readFileSync(testResultsPath, 'utf8');
      const testResult = parseTestResult(testResultsContent);
      if (testResult && DISALLOWED_TEST_RESULT_DEFAULTS.includes(testResult) && !hasRealTestEvidence(testResultsContent)) {
        issues.push(`TEST_RESULTS.md for ${slug} defaults to "${testResult}". Newly generated test results must start as pending.`);
      }
      if (containsGenericTestContent(testResultsContent)) {
        issues.push(`TEST_RESULTS.md for ${slug} contains generic or fake evidence. Replace vague claims with concrete, recorded results.`);
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
          if (findVerificationBodyContradictions(reportContent)) {
            issues.push(
              `Verification report for ${slug} headers say pass/proceed, but the report body appears to describe a blocked or failed phase.`
            );
          }
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

      // Lifecycle contradiction: verification pass but test results pending
      if (result === 'pass' && fs.existsSync(testResultsPath)) {
        const testResultsContent = fs.readFileSync(testResultsPath, 'utf8');
        const testResult = parseTestResult(testResultsContent);
        if (testResult === 'pending') {
          issues.push(`Verification report for ${slug} says pass, but TEST_RESULTS.md is still pending. Run the test script and record real results before claiming pass.`);
        }
        if (testResult === 'fail') {
          issues.push(`Verification report for ${slug} says pass, but TEST_RESULTS.md says fail. Resolve the test failure or update the verification report to reflect the actual state.`);
        }
      }

      // Lifecycle contradiction: verification fail/revise but next-phase context suggests readiness
      if ((result === 'fail' || recommendation === 'blocked' || recommendation === 'revise') && fs.existsSync(testResultsPath)) {
        const testResultsContent = fs.readFileSync(testResultsPath, 'utf8');
        const testResult = parseTestResult(testResultsContent);
        if (testResult === 'pass') {
          issues.push(`TEST_RESULTS.md for ${slug} says pass, but the verification report says ${result}/${recommendation}. These files must agree before the phase can advance.`);
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

  const scorecardPath = path.join(packageRoot, 'SCORECARD.md');
  if (fs.existsSync(scorecardPath)) {
    const scorecard = fs.readFileSync(scorecardPath, 'utf8');
    if (manifest.lifecycleStatus === 'Blocked' && /## Rating\s+Build ready/i.test(scorecard)) {
      issues.push('SCORECARD.md says "Build ready" even though the package lifecycle is Blocked.');
    }
    if (manifest.lifecycleStatus === 'Blocked' && /\|\s+\*\*Total\*\*\s+\|\s+\*\*(\d+)\/100\*\*\s+\|/i.test(scorecard)) {
      const match = scorecard.match(/\|\s+\*\*Total\*\*\s+\|\s+\*\*(\d+)\/100\*\*\s+\|/i);
      const total = Number(match?.[1] || '0');
      if (total >= 72) {
        issues.push(`SCORECARD.md shows ${total}/100 even though blocked packages must stay below the build-ready threshold.`);
      }
    }
  }

  // Regression results validation
  const regressionResultsPath = path.join(packageRoot, 'regression-suite/REGRESSION_RESULTS_TEMPLATE.md');
  if (fs.existsSync(regressionResultsPath)) {
    const regressionContent = fs.readFileSync(regressionResultsPath, 'utf8');
    const regressionResult = parseRegressionResult(regressionContent);
    if (regressionResult && DISALLOWED_TEST_RESULT_DEFAULTS.includes(regressionResult) && !hasRealTestEvidence(regressionContent)) {
      issues.push('REGRESSION_RESULTS_TEMPLATE.md defaults to pass. Regression results must start as pending until the suite is actually run.');
    }
    if (containsGenericTestContent(regressionContent)) {
      issues.push('REGRESSION_RESULTS_TEMPLATE.md contains generic or fake evidence. Replace vague claims with concrete, recorded results.');
    }
  }

  const autoImproveProgramPath = path.join(packageRoot, 'auto-improve/PROGRAM.md');
  if (
    !fileContainsAll(autoImproveProgramPath, [
      /## Editable files/i,
      /## Fixed files/i,
      /Never weaken the rubric/i,
      /## Validation commands/i,
      /## Keep or discard loop/i,
      /## Simplicity criterion/i,
      /## Stop conditions/i
    ])
  ) {
    issues.push(
      'auto-improve/PROGRAM.md must define editable and fixed boundaries, validation commands, keep or discard rules, the simplicity criterion, stop conditions, and a prohibition on weakening the evaluator.'
    );
  }

  const autoImproveRubricPath = path.join(packageRoot, 'auto-improve/QUALITY_RUBRIC.md');
  if (
    !fileContainsAll(autoImproveRubricPath, [
      /Use-case specificity/i,
      /Phase usefulness/i,
      /Beginner clarity/i,
      /Agent executability/i,
      /Verification strength/i,
      /Regression and test coverage/i,
      /Handoff quality/i,
      /Simplicity/i,
      /Hard caps/i
    ])
  ) {
    issues.push('auto-improve/QUALITY_RUBRIC.md is missing the required scoring categories or hard caps.');
  }

  const autoImproveResultsPath = path.join(packageRoot, 'auto-improve/results.tsv');
  if (fs.existsSync(autoImproveResultsPath)) {
    const header = fs.readFileSync(autoImproveResultsPath, 'utf8').split(/\r?\n/)[0] || '';
    if (!/^timestamp\titeration\toverall_score\thard_cap\tdecision\tcommands_run\tchanged_files\tnotes$/i.test(header)) {
      issues.push('auto-improve/results.tsv must start with the required header row.');
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
