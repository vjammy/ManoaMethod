export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type UserTrack = 'business' | 'technical';
export type ProjectInput = {
  productName: string;
  oneLineIdea: string;
  targetUsers: string;
  primaryOutcome: string;
  mustHaveFeatures: string;
  niceToHaveFeatures: string;
  risks: string;
  dataAndIntegrations: string;
  constraints: string;
  level: ExperienceLevel;
  track: UserTrack;
};
export type GeneratedFile = { path: string; content: string };
export type ScoreBreakdown = {
  discovery: number; workflow: number; scope: number; data: number; risk: number; handoff: number;
  total: number; rating: 'Not ready' | 'Needs work' | 'Build ready' | 'Strong handoff'; recommendations: string[];
};
