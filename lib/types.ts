export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type UserTrack = 'business' | 'technical';
export type ProfileKey = `${ExperienceLevel}-${UserTrack}`;
export type CritiqueSeverity = 'critical' | 'important' | 'nice-to-have';
export type WarningSeverity = 'info' | 'warning' | 'blocker';
export type LifecycleStatus =
  | 'Draft'
  | 'Blocked'
  | 'ReviewReady'
  | 'BuildReady'
  | 'ApprovedForBuild'
  | 'InRework';

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
  runtimeUrl?: string;
  runtimeStartCommand?: string;
  runtimeSmokeRoutes?: string[];
  runtimeStartTimeoutMs?: number;
};

export type RuntimeTarget = {
  url: string;
  startCommand: string;
  smokeRoutes: string[];
  startTimeoutMs: number;
};

export type GeneratedFile = {
  path: string;
  content: string;
};

export type MvpBuilderState = {
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
      attempts?: PhaseAttempt[];
    }
  >;
};

export type PhaseAttempt = {
  attempt: number;
  startedAt: string;
  resolvedAt?: string;
  status: 'pass' | 'fail' | 'pending';
  failedCriteria: string[];
  reworkPromptPath?: string;
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
    | 'generator'
    | 'schema';
  openQuestion?: string;
  assumption?: string;
};

export type PhasePlan = {
  index: number;
  slug: string;
  name: string;
  phaseType: 'planning' | 'design' | 'implementation' | 'verification' | 'handoff' | 'finalization';
  goal: string;
  focusSummary: string;
  riskFocus: string[];
  generatedFromInput: string[];
  needsConfirmation: string[];
  inferredAssumptions: string[];
  nextActions: string[];
  domainSignals: string[];
  entryCriteria: string[];
  implementationChecklist: string[];
  businessAcceptanceCriteria: string[];
  technicalAcceptanceCriteria: string[];
  testingRequirements: string[];
  exitCriteria: string[];
  expectedOutputs: string[];
  reviewChecklist: string[];
  evidenceExamples: string[];
  failureConditions: string[];
  scopeGuards: string[];
  continuityChecks: string[];
  repoTargets: string[];
  implementationPromptPlaceholder: string;
  reviewPromptPlaceholder: string;
  requirementIds?: string[];
};

export type ScoreCategoryKey =
  | 'problem-clarity'
  | 'target-user-clarity'
  | 'workflow-clarity'
  | 'constraint-clarity'
  | 'risk-coverage'
  | 'acceptance-quality'
  | 'implementation-readiness'
  | 'testability'
  | 'handoff-completeness'
  | 'semantic-fit';

export type ScoreBucket = 'build-readiness' | 'product-fit';

export type ScoreCategory = {
  key: ScoreCategoryKey;
  bucket: ScoreBucket;
  label: string;
  score: number;
  max: number;
  reasonsLost: string[];
  improvements: string[];
};

export type ScoreBreakdown = {
  categories: ScoreCategory[];
  total: number;
  buildReadiness: number;
  productFit: number;
  rating: 'Not ready' | 'Needs work' | 'Build ready' | 'Strong handoff';
  blockers: string[];
  recommendations: string[];
  adjustments: string[];
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

export type ArchetypeDetectionSummary = {
  archetype: string;
  confidence: number;
  method: 'keyword' | 'llm' | 'fallback';
  matchedKeyword?: string;
  rationale: string;
  antiMatched?: string;
  candidateScores: Array<{ archetype: string; score: number; topKeyword?: string }>;
};

export type SemanticFitSummary = {
  score: number;
  verdict: 'high' | 'low' | 'critical';
  inputTokenCount: number;
  outputTokenCount: number;
  overlapTokenCount: number;
  overlapTokens: string[];
  inputOnlyTokens: string[];
  outputOnlyTokens: string[];
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
  archetypeDetection: ArchetypeDetectionSummary;
  semanticFit: SemanticFitSummary;
  /**
   * True when the bundle was generated from research extractions
   * (research/extracted/*.json). Renders that previously assumed archetype
   * was the source of truth (FINAL_SCORECARD's "Domain archetype detection",
   * lifecycle warnings) gate on this so they don't emit misleading
   * archetype-warning copy on the research-driven path.
   */
  hasResearchExtractions?: boolean;
};
