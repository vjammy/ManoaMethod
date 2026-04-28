export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type UserTrack = 'business' | 'technical';
export type ProfileKey = `${ExperienceLevel}-${UserTrack}`;
export type CritiqueSeverity = 'critical' | 'important' | 'nice-to-have';
export type WarningSeverity = 'info' | 'warning' | 'blocker';
export type LifecycleStatus = 'Draft' | 'Blocked' | 'ReviewReady' | 'ApprovedForBuild';

export type ProjectInput = {
  productName: string;
  level: ExperienceLevel;
  track: UserTrack;
  productIdea: string;
  targetAudience: string;
  problemStatement: string;
  constraints: string;
  desiredOutput: string;
  mustHaveFeatures: string;
  niceToHaveFeatures: string;
  dataAndIntegrations: string;
  risks: string;
  successMetrics: string;
  nonGoals: string;
  timeline: string;
  teamContext: string;
  questionnaireAnswers: Record<string, string>;
};

export type GeneratedFile = {
  path: string;
  content: string;
};

export type XeleraState = {
  currentPhase: number;
  lifecycleStatus: LifecycleStatus;
  completedPhases: string[];
  blockedPhases: string[];
  unresolvedBlockers: Array<{
    id: string;
    title: string;
    message: string;
    action: string;
  }>;
  lastHandoffSummary: string;
  phaseEvidence: Record<
    string,
    {
      testsRun: string[];
      changedFiles: string[];
      verificationReportPath: string;
      exitGateReviewed: boolean;
      approvedToProceed: boolean;
      knownIssues: string[];
      reviewerRecommendation: string;
      evidenceFiles: string[];
      manualApproval?: boolean;
    }
  >;
};

export type QuestionnaireItem = {
  id: string;
  prompt: string;
  helper: string;
  required: boolean;
  intent: string;
};

export type CritiqueItem = {
  severity: CritiqueSeverity;
  title: string;
  detail: string;
  followUpQuestion: string;
  signal: 'generated-from-current-input' | 'needs-user-confirmation' | 'inferred-assumption';
};

export type WarningItem = {
  id: string;
  severity: WarningSeverity;
  title: string;
  message: string;
  action: string;
  source:
    | 'brief'
    | 'questionnaire'
    | 'critique'
    | 'score'
    | 'approval'
    | 'generator';
  openQuestion?: string;
  assumption?: string;
};

export type PhasePlan = {
  index: number;
  slug: string;
  name: string;
  goal: string;
  focusSummary: string;
  riskFocus: string[];
  generatedFromInput: string[];
  needsConfirmation: string[];
  inferredAssumptions: string[];
  nextActions: string[];
  entryCriteria: string[];
  implementationChecklist: string[];
  businessAcceptanceCriteria: string[];
  technicalAcceptanceCriteria: string[];
  testingRequirements: string[];
  exitCriteria: string[];
  implementationPromptPlaceholder: string;
  reviewPromptPlaceholder: string;
};

export type ScoreCategory = {
  key:
    | 'problem-clarity'
    | 'target-user-clarity'
    | 'workflow-clarity'
    | 'constraint-clarity'
    | 'risk-coverage'
    | 'acceptance-quality'
    | 'implementation-readiness'
    | 'testability'
    | 'handoff-completeness';
  label: string;
  score: number;
  max: number;
  reasonsLost: string[];
  improvements: string[];
};

export type ScoreBreakdown = {
  categories: ScoreCategory[];
  total: number;
  rating: 'Not ready' | 'Needs work' | 'Build ready' | 'Strong handoff';
  blockers: string[];
  recommendations: string[];
};

export type ProfileConfig = {
  key: ProfileKey;
  label: string;
  description: string;
  wordingStyle: string;
  critiqueDepth: string;
  planningExpectation: string;
  technicalDepth: string;
  gateStrength: string;
  handoffDetail: string;
  languageMode: string;
  businessFocus: string;
  technicalFocus: string;
  checklistBias: string;
  validationFocus: string;
  minimumPhaseCount: number;
};

export type ProjectBundle = {
  exportRoot: string;
  profile: ProfileConfig;
  questionnaire: QuestionnaireItem[];
  critique: CritiqueItem[];
  warnings: WarningItem[];
  phases: PhasePlan[];
  score: ScoreBreakdown;
  lifecycleStatus: LifecycleStatus;
  unresolvedWarnings: WarningItem[];
  warningCounts: Record<WarningSeverity, number>;
  blockingWarnings: WarningItem[];
  approvalRequired: boolean;
  approvedForBuild: boolean;
  files: GeneratedFile[];
};
