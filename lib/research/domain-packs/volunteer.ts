import type { DomainPack } from './types';

export const volunteer: DomainPack = {
  id: 'volunteer',
  name: 'Volunteer / Community Service',
  matchKeywords: ['volunteer', 'food pantry', 'donation', 'shift', 'church volunteer', 'pet rescue', 'community garden', 'rsvp shift', 'service hours', 'mentorship program'],
  matchAudience: ['volunteer', 'volunteer coordinator', 'church admin', 'pantry manager', 'rescue coordinator'],
  industryName: 'Volunteer coordination / community service',
  industryTerminology: ['shift', 'roster', 'sign-up', 'background check', 'service hours', 'opportunity', 'capacity'],
  regulatoryHints: ['Background-check policy (varies by program)', 'Minor-protection rules where applicable'],
  successMetricSeeds: [
    { metric: 'Shifts filled at least 24h before start', target: '≥85%', cadence: 'D1' },
    { metric: 'No-show rate', target: '<10%', cadence: 'D7' },
    { metric: 'Volunteer return rate (sign up again within 30d)', target: '≥40%', cadence: 'D30' }
  ],
  competingAlternatives: [
    { name: 'Sign-up Genius / Doodle', whyInsufficient: 'No background check tracking, no service-hour history, weak coordinator side.' }
  ],
  ideaCritiqueSeeds: [
    { weakSpot: 'Programs with vulnerable populations (kids, food security) often need background checks before shift.', mitigation: 'Background-check status is a required gate before a volunteer can sign up for restricted shifts.' }
  ],
  actorArchetypes: [
    {
      idHint: 'volunteer',
      name: 'Volunteer',
      type: 'primary-user',
      responsibilities: ['Browse available shifts', 'Sign up for shifts', 'See own service hours and history'],
      visibility: ['Public open shifts', 'Own sign-ups', 'Own service hours'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When I want to volunteer this weekend', motivation: 'I want to find a shift that fits and sign up in one click', expectedOutcome: 'So that I show up to a confirmed slot and my hours track automatically', currentWorkaround: 'Email the coordinator and wait for a reply', hireForCriteria: ['Mobile-friendly shift list', 'Service-hours running total', 'One-click sign up'] }
      ]
    },
    {
      idHint: 'coordinator',
      name: 'Volunteer Coordinator',
      type: 'primary-user',
      responsibilities: ['Open and close shifts', 'Verify volunteers (background checks, training)', 'Track service hours and recognize regulars'],
      visibility: ['All shifts in their program', 'All volunteer records', 'Service-hour totals'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When the next service week\'s shifts need coverage', motivation: 'I want to publish shifts and watch them fill without hand-holding', expectedOutcome: 'So that no shift goes unstaffed and I save coordinator time', currentWorkaround: 'Email blast + paper sign-up sheet', hireForCriteria: ['Live fill-rate dashboard', 'Background-check reminder list', 'Auto-close on full'] }
      ]
    },
    {
      idHint: 'program-lead',
      name: 'Program Lead',
      type: 'reviewer',
      responsibilities: ['Set program policies (background-check requirements, age limits)', 'Audit service-hour records'],
      visibility: ['All programs', 'Audit log', 'Aggregate metrics'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When the board asks for service-hour totals', motivation: 'I want one place that shows reliable totals', expectedOutcome: 'So that I report numbers I can defend', currentWorkaround: 'Cross-checking three spreadsheets', hireForCriteria: ['One-click report by program', 'Anomaly alerts for backfilled hours'] }
      ]
    }
  ],
  entityArchetypes: [
    {
      idHint: 'opportunity',
      name: 'Volunteer Opportunity',
      description: 'A program of volunteer work (e.g., Saturday food pantry shifts).',
      ownerActorIdHints: ['coordinator'],
      riskTypes: ['operational'],
      fields: [
        { name: 'opportunityId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'opp-pantry-saturdays', description: 'Stable opportunity id.' },
        { name: 'name', dbType: 'TEXT', required: true, sample: 'Saturday Pantry Distribution', description: 'Display name.' },
        { name: 'description', dbType: 'TEXT', required: true, sample: 'Help distribute groceries to families in need every Saturday morning.', description: 'Summary for volunteers.' },
        { name: 'requiresBackgroundCheck', dbType: 'BOOLEAN', required: true, defaultValue: 'false', sample: true, description: 'If true, volunteers need active background-check status to sign up.' },
        { name: 'minimumAge', dbType: 'INTEGER', required: false, sample: 16, description: 'Minimum volunteer age, if any.' },
        { name: 'isActive', dbType: 'BOOLEAN', required: true, defaultValue: 'true', sample: true, description: 'Whether new shifts can be created.' }
      ]
    },
    {
      idHint: 'shift',
      name: 'Shift',
      description: 'A specific time block volunteers can sign up for.',
      ownerActorIdHints: ['coordinator'],
      riskTypes: ['operational'],
      fields: [
        { name: 'shiftId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'shift-pantry-2026-05-04-am', description: 'Stable shift id.' },
        { name: 'opportunityId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'opportunity', fieldName: 'opportunityId', onDelete: 'CASCADE' }, sample: 'opp-pantry-saturdays', description: 'Parent opportunity.' },
        { name: 'startsAt', dbType: 'TIMESTAMPTZ', required: true, indexed: true, sample: '2026-05-04T08:00:00Z', description: 'Shift start.' },
        { name: 'endsAt', dbType: 'TIMESTAMPTZ', required: true, sample: '2026-05-04T11:00:00Z', description: 'Shift end.' },
        { name: 'capacity', dbType: 'INTEGER', required: true, defaultValue: '4', sample: 6, description: 'Volunteers needed.' },
        { name: 'filled', dbType: 'INTEGER', required: true, defaultValue: '0', sample: 4, description: 'Number signed up so far.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['open', 'full', 'closed', 'cancelled'], defaultValue: 'open', indexed: true, sample: 'open', description: 'Shift status.' }
      ]
    },
    {
      idHint: 'signup',
      name: 'Sign-up',
      description: 'A volunteer holding a slot on a shift.',
      ownerActorIdHints: ['volunteer'],
      riskTypes: ['operational'],
      fields: [
        { name: 'signupId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'sign-pantry-2026-05-04-001', description: 'Sign-up id.' },
        { name: 'shiftId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'shift', fieldName: 'shiftId', onDelete: 'CASCADE' }, sample: 'shift-pantry-2026-05-04-am', description: 'Shift.' },
        { name: 'volunteerActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'CASCADE' }, sample: 'mem-volunteer-12', description: 'Volunteer.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['confirmed', 'cancelled', 'attended', 'no-show'], defaultValue: 'confirmed', indexed: true, sample: 'confirmed', description: 'Sign-up state.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-04-25T19:00:00Z', description: 'When signed up.' }
      ]
    },
    {
      idHint: 'service-hours',
      name: 'Service Hours Record',
      description: 'Aggregated service hours per volunteer per opportunity.',
      ownerActorIdHints: ['program-lead'],
      riskTypes: ['operational'],
      fields: [
        { name: 'recordId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'sh-pantry-mem-volunteer-12-2026', description: 'Record id.' },
        { name: 'volunteerActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-volunteer-12', description: 'Volunteer.' },
        { name: 'opportunityId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'opportunity', fieldName: 'opportunityId', onDelete: 'RESTRICT' }, sample: 'opp-pantry-saturdays', description: 'Opportunity.' },
        { name: 'totalHours', dbType: 'DECIMAL', required: true, defaultValue: '0', sample: 24.0, description: 'Sum of attended hours.' },
        { name: 'lastUpdated', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-05-04T11:30:00Z', description: 'Last roll-up timestamp.' }
      ]
    }
  ],
  workflowArchetypes: [
    {
      idHint: 'sign-up-and-attend',
      name: 'Sign up for and attend a shift',
      primaryActorIdHint: 'volunteer',
      secondaryActorIdHints: ['coordinator'],
      acceptancePattern: 'Given an open shift and a verified volunteer, when they sign up, attend, and the coordinator marks attendance, then the volunteer\'s service-hours total updates and the shift fill metrics reflect the attendance.',
      steps: [
        { actorIdHint: 'volunteer', action: 'Browse open shifts and select one', systemResponse: 'Show shift detail with capacity, requirements (e.g. background check).' },
        { actorIdHint: 'volunteer', action: 'Sign up for the shift', systemResponse: 'Verify background-check status if required; create Signup; increment Shift.filled.', branchOn: 'Background check missing → block + offer initiation flow' },
        { actorIdHint: 'coordinator', action: 'Confirm shift roster the day before', systemResponse: 'Show confirmed sign-ups; send reminders to volunteers.' },
        { actorIdHint: 'coordinator', action: 'Mark each volunteer attended or no-show after the shift', systemResponse: 'Update Signup.status; recompute Service Hours Record.', branchOn: 'Attended / No-show' }
      ],
      failureModes: [
        { trigger: 'Volunteer signs up for a shift requiring a background check they haven\'t completed', effect: 'Vulnerable population exposed to unvetted volunteer', mitigation: 'Block sign-up at validator with clear path to start the check; coordinator gets alerted on attempts.' },
        { trigger: 'Shift over-fills due to race condition', effect: 'Coordinator overcommits and has to turn volunteers away', mitigation: 'Atomic capacity decrement; surplus goes to waitlist; volunteer sees clear waitlist status.' }
      ]
    },
    {
      idHint: 'service-hours-reporting',
      name: 'Service-hours reporting',
      primaryActorIdHint: 'program-lead',
      secondaryActorIdHints: ['coordinator'],
      acceptancePattern: 'Given a quarter ending, when the program lead runs the report, then every attended shift contributes to a volunteer\'s service hours and the report matches the audit trail line-for-line.',
      steps: [
        { actorIdHint: 'program-lead', action: 'Open the quarterly service-hours dashboard', systemResponse: 'Aggregate attended sign-ups per volunteer per opportunity.' },
        { actorIdHint: 'program-lead', action: 'Drill into anomalies (unusually high hours)', systemResponse: 'Show contributing shifts with timestamps and coordinator attribution.' },
        { actorIdHint: 'program-lead', action: 'Export the report to PDF for the board', systemResponse: 'Produce signed PDF; mark export run.' }
      ],
      failureModes: [
        { trigger: 'Coordinator backfills attendance days later without justification', effect: 'Hours appear retroactively; raises trust questions', mitigation: 'Audit-log every backfill with attribution and time delta; surface "backfilled" badge.' },
        { trigger: 'Volunteer claims hours not recorded', effect: 'Coordinator and volunteer disagree on totals', mitigation: 'Volunteer can flag a missing shift; coordinator must confirm or deny in audit log.' }
      ]
    }
  ]
};
