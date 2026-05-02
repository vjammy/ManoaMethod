import type { DomainPack } from './types';

export const fitness: DomainPack = {
  id: 'fitness',
  name: 'Fitness / Coaching / Class pass',
  matchKeywords: ['gym', 'fitness', 'workout', 'coach', 'trainer', 'class pass', 'personal training', 'fitness coach', 'membership'],
  matchAudience: ['member', 'coach', 'trainer', 'gym manager', 'client'],
  industryName: 'Fitness coaching and class scheduling',
  industryTerminology: ['member', 'session', 'plan', 'progression', 'PR', 'check-in', 'membership tier'],
  successMetricSeeds: [
    { metric: 'Members attending ≥2 sessions in week 1', target: '≥60%', cadence: 'D7' },
    { metric: 'Coach session note completion same-day', target: '≥90%', cadence: 'D7' }
  ],
  competingAlternatives: [
    { name: 'Mindbody / ClassPass', whyInsufficient: 'Heavy and expensive for a 1-2 coach studio.' }
  ],
  ideaCritiqueSeeds: [
    { weakSpot: 'Health/fitness data leans toward sensitive — keep visibility tight.', mitigation: 'Default visibility: members see own data, coaches see assigned roster only.' }
  ],
  actorArchetypes: [
    {
      idHint: 'member',
      name: 'Member',
      type: 'primary-user',
      responsibilities: ['Book sessions', 'See own progression and notes', 'Manage membership'],
      visibility: ['Own bookings', 'Own progression', 'Own membership'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When I want my next workout planned', motivation: 'I want to see what my coach prescribed', expectedOutcome: 'So that I show up ready and consistent', currentWorkaround: 'Notes app and asking the coach', hireForCriteria: ['Mobile session view', 'Progression visible per movement'] }
      ]
    },
    {
      idHint: 'coach',
      name: 'Coach / Trainer',
      type: 'primary-user',
      responsibilities: ['Plan sessions per member', 'Record session notes and progress', 'Assign PRs and progressions'],
      visibility: ['Assigned members', 'Own session library', 'Per-member progression'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When a member finishes a session', motivation: 'I want to log notes fast and adjust their next session', expectedOutcome: 'So that the next session reflects today\'s progress', currentWorkaround: 'Paper logbook', hireForCriteria: ['Per-movement note entry', 'Auto-progression suggestions'] }
      ]
    },
    {
      idHint: 'manager',
      name: 'Studio Manager',
      type: 'reviewer',
      responsibilities: ['Manage memberships', 'Audit coach engagement', 'Resolve booking disputes'],
      visibility: ['All members', 'All coaches', 'Aggregate metrics'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When membership renewals come up', motivation: 'I want to see who attended enough to retain', expectedOutcome: 'So that retention conversations are based on real data', currentWorkaround: 'Spreadsheet of check-ins', hireForCriteria: ['Per-member attendance trend', 'At-risk-member dashboard'] }
      ]
    }
  ],
  entityArchetypes: [
    {
      idHint: 'member',
      name: 'Member Profile',
      description: 'A gym/fitness client with assigned coach and membership tier.',
      ownerActorIdHints: ['member', 'manager'],
      riskTypes: ['privacy'],
      fields: [
        { name: 'memberId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'mem-fit-001', description: 'Stable member id.' },
        { name: 'displayName', dbType: 'TEXT', required: true, pii: true, sample: 'Avery R.', description: 'Display name.' },
        { name: 'assignedCoachActorId', dbType: 'TEXT', required: false, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'SET NULL' }, sample: 'mem-coach-01', description: 'Coach.' },
        { name: 'membershipTier', dbType: 'ENUM', required: true, enumValues: ['drop-in', 'monthly', 'unlimited'], defaultValue: 'monthly', sample: 'monthly', description: 'Membership level.' },
        { name: 'startedAt', dbType: 'DATE', required: true, sample: '2026-04-01', description: 'Membership start.' }
      ]
    },
    {
      idHint: 'session',
      name: 'Coaching Session',
      description: 'A scheduled or completed coaching session.',
      ownerActorIdHints: ['coach'],
      riskTypes: ['operational'],
      fields: [
        { name: 'sessionId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'sess-2026-05-02-001', description: 'Session id.' },
        { name: 'memberActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'CASCADE' }, sample: 'mem-fit-001', description: 'Member.' },
        { name: 'coachActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-coach-01', description: 'Coach.' },
        { name: 'scheduledAt', dbType: 'TIMESTAMPTZ', required: true, indexed: true, sample: '2026-05-02T07:00:00Z', description: 'Scheduled.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['scheduled', 'attended', 'no-show', 'cancelled'], defaultValue: 'scheduled', indexed: true, sample: 'attended', description: 'Session state.' }
      ]
    },
    {
      idHint: 'progression',
      name: 'Progression Note',
      description: 'A coach\'s record of progress on a movement, including loads and notes.',
      ownerActorIdHints: ['coach'],
      riskTypes: ['privacy'],
      fields: [
        { name: 'noteId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'prog-2026-05-02-001', description: 'Note id.' },
        { name: 'sessionId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'session', fieldName: 'sessionId', onDelete: 'CASCADE' }, sample: 'sess-2026-05-02-001', description: 'Session.' },
        { name: 'movement', dbType: 'TEXT', required: true, sample: 'Back squat', description: 'Movement name.' },
        { name: 'loadKg', dbType: 'DECIMAL', required: false, sample: 70.0, description: 'Load in kg.' },
        { name: 'note', dbType: 'TEXT', required: false, sample: 'Felt strong on third set; cue knees out.', description: 'Coach note.' }
      ]
    }
  ],
  workflowArchetypes: [
    {
      idHint: 'session-coaching',
      name: 'Coach a session and log progression',
      primaryActorIdHint: 'coach',
      secondaryActorIdHints: ['member'],
      acceptancePattern: 'Given a scheduled session, when the coach checks in the member and logs progression, then the member sees the notes on their dashboard and the next session prescribes adjusted loads.',
      steps: [
        { actorIdHint: 'coach', action: 'Open today\'s sessions for assigned members', systemResponse: 'Show roster sorted by start time.' },
        { actorIdHint: 'coach', action: 'Check in the member at session start', systemResponse: 'Status → attended.' },
        { actorIdHint: 'coach', action: 'Log progression notes per movement', systemResponse: 'Persist Progression Note rows with attribution.' },
        { actorIdHint: 'coach', action: 'Suggest next session load', systemResponse: 'Pre-fill next scheduled session with progressed loads; member sees prescription.' }
      ],
      failureModes: [
        { trigger: 'Member injured mid-session', effect: 'Coach has to deviate; without record the next plan repeats the same load', mitigation: 'Injury flag on session that suppresses automatic load progression and routes to manager for review.' },
        { trigger: 'Two coaches edit a member\'s progression simultaneously', effect: 'Lost edits', mitigation: 'Per-member progression locks; second coach gets a "currently coached by X" warning.' }
      ]
    }
  ]
};
