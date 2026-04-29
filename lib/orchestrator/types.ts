export type ReportDocKey =
  | 'readme'
  | 'startHere'
  | 'projectContext'
  | 'contextRules'
  | 'scorecard'
  | 'currentStatus'
  | 'testingStrategy'
  | 'regressionPlan'
  | 'verificationReport'
  | 'handoff'
  | 'phaseBrief';

export type RepoDocument = {
  key: ReportDocKey | 'other';
  path: string;
  exists: boolean;
  content: string;
};

export type PhaseInfo = {
  slug: string;
  path: string;
  files: string[];
  hasVerificationReport: boolean;
  hasHandoff: boolean;
  hasEntryGate: boolean;
  hasExitGate: boolean;
  hasTestScript: boolean;
  hasTestResults: boolean;
};

export type RepoState = {
  repoRoot: string;
  packageRoot: string | null;
  runId: string;
  projectName: string;
  isGeneratedPackage: boolean;
  mode: 'repo' | 'package';
  packageScripts: Record<string, string>;
  manifest: Record<string, unknown> | null;
  xeleraState: Record<string, unknown> | null;
  docs: RepoDocument[];
  phases: PhaseInfo[];
  verificationReports: string[];
  handoffFiles: string[];
  regressionFiles: string[];
  reportFiles: string[];
  missingExpectedFiles: string[];
  localFirstSignals: string[];
  blockerSignals: string[];
};

export type ObjectiveCriterion = {
  id: string;
  category:
    | 'objective-fit'
    | 'functional-correctness'
    | 'test-regression'
    | 'gates'
    | 'artifacts'
    | 'beginner-usability'
    | 'handoff-recovery'
    | 'local-first';
  title: string;
  description: string;
  evidencePaths: string[];
  measurableCheck: string;
};

export type AgentTask = {
  agent:
    | 'Planner Agent'
    | 'Builder Agent'
    | 'UI Agent'
    | 'Test Agent'
    | 'Verifier Agent'
    | 'Critic Agent'
    | 'Recovery Agent';
  fileName: string;
  prompt: string;
  likelyFilesToChange: string[];
};

export type CommandResultStatus = 'passed' | 'failed' | 'missing' | 'skipped';

export type CommandResult = {
  name: string;
  command: string;
  required: boolean;
  detected: boolean;
  status: CommandResultStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  outputPath: string;
};

export type GateResult = {
  gate:
    | 'entry gate'
    | 'implementation gate'
    | 'test gate'
    | 'regression gate'
    | 'evidence gate'
    | 'security gate'
    | 'release gate'
    | 'exit gate';
  status: 'pass' | 'fail';
  summary: string;
  checks: Array<{
    label: string;
    passed: boolean;
    detail: string;
  }>;
  failedCriteria: string[];
};

export type ScoreCategoryKey =
  | 'objectiveFit'
  | 'functionalCorrectness'
  | 'testRegressionCoverage'
  | 'gateEnforcement'
  | 'artifactUsefulness'
  | 'beginnerUsability'
  | 'handoffRecoveryQuality'
  | 'localFirstCompliance';

export type ScoreCategory = {
  key: ScoreCategoryKey;
  label: string;
  weight: number;
  awarded: number;
  rationale: string[];
};

export type Scorecard = {
  total: number;
  cappedTotal: number;
  verdict: 'PASS' | 'CONDITIONAL PASS' | 'NEEDS FIXES' | 'FAIL';
  categories: ScoreCategory[];
  hardCaps: Array<{
    reason: string;
    maxScore: number;
    triggered: boolean;
  }>;
  capReason: string | null;
  summary: string;
};

export type RecoveryPlan = {
  failedGate: GateResult['gate'] | 'none';
  failedCriteria: string[];
  evidenceInspected: string[];
  likelyFilesToChange: string[];
  commandsToRerun: string[];
  expectedProof: string[];
  exactProblems: string[];
  nextAgentPrompt: string;
  recoveryPrompt: string;
  broadRewriteRecommended: boolean;
};

export type StopReason =
  | 'target-score-reached'
  | 'max-rounds-reached'
  | 'same-critical-failure-twice'
  | 'missing-external-dependency'
  | 'violates-local-first'
  | 'no-meaningful-change-possible';

export type RoundResult = {
  round: number;
  repoState: RepoState;
  criteria: ObjectiveCriterion[];
  agentTasks: AgentTask[];
  commands: CommandResult[];
  gates: GateResult[];
  scorecard: Scorecard;
  recoveryPlan: RecoveryPlan;
  stopReason: StopReason | null;
};

export type OrchestratorOptions = {
  repoRoot: string;
  packageRoot?: string;
  targetScore: number;
  maxRounds: number;
  dryRun: boolean;
};

export type OrchestratorRun = {
  options: OrchestratorOptions;
  rounds: RoundResult[];
  finalRound: RoundResult;
  stopReason: StopReason;
};
