import type { DomainPack } from './types';

export const sales: DomainPack = {
  id: 'sales',
  name: 'Sales / SDR / Outbound',
  matchKeywords: ['sdr', 'sales', 'lead', 'cadence', 'pipeline', 'crm', 'prospect', 'outbound', 'account executive', 'quota', 'sales development'],
  matchAudience: ['sales', 'sdr', 'rep', 'account executive', 'sales manager'],
  industryName: 'B2B outbound sales / SDR operations',
  industryTerminology: ['lead', 'cadence', 'touch', 'qualified', 'disqualified', 'opt-out', 'enrichment', 'pipeline', 'fit score', 'hand-off', 'quota', 'sequence', 'reply rate'],
  regulatoryHints: ['CAN-SPAM', 'GDPR Art. 7 (consent for outreach)', 'CASL (Canadian Anti-Spam)'],
  integrationHints: [
    { name: 'SendGrid', vendor: 'Twilio', category: 'email', envVar: 'SENDGRID_API_KEY', required: false, purpose: 'Send cadence emails and detect bounce/unsubscribe.' },
    { name: 'Salesforce', vendor: 'Salesforce', category: 'erp', envVar: 'SALESFORCE_TOKEN', required: false, purpose: 'Optional CRM sync for hand-off to AEs.' }
  ],
  successMetricSeeds: [
    { metric: 'Leads contacted within 24h of import', target: '≥80%', cadence: 'D1' },
    { metric: 'Cadence completion rate', target: '≥60% reach last touch', cadence: 'D7' },
    { metric: 'SQL conversion rate (lead → AE accepted)', target: '≥15%', cadence: 'D30' },
    { metric: 'Opt-out detection latency', target: '<5 minutes from reply', cadence: 'leading' }
  ],
  competingAlternatives: [
    { name: 'Outreach.io', whyInsufficient: 'Heavyweight, multi-thousand-per-seat pricing; overkill for a 2-3 SDR team.' },
    { name: 'Spreadsheet + manual email', whyInsufficient: 'No audit trail, no opt-out enforcement, and territory conflicts go undetected.' }
  ],
  ideaCritiqueSeeds: [
    { weakSpot: 'No clear ownership graph means territory conflict between AE and SDR on the same account.', mitigation: 'Dedupe imports against the AE-owned-account graph and route conflicts to manager queue.' }
  ],
  actorArchetypes: [
    {
      idHint: 'sdr',
      name: 'Sales Development Rep',
      type: 'primary-user',
      responsibilities: [
        'Source leads from conferences, lists, and inbound forms',
        'Run multi-touch outbound cadences across email and call',
        'Qualify or disqualify leads and hand off accepted ones to AEs',
        'Log every touch outcome (replied, no-reply, bounced, opt-out)'
      ],
      visibility: ['Own assigned leads', 'Own activity history', 'Own sequences'],
      authMode: 'authenticated',
      jtbdSeeds: [
        {
          situation: 'When a fresh conference lead list arrives in the morning',
          motivation: 'I want to import, dedupe, and enroll the new leads in the right cadence',
          expectedOutcome: 'So that every new lead has a first touch within 24 hours and no overlap with AE-owned accounts',
          currentWorkaround: 'Spreadsheet uploads with manual VLOOKUP against the AE territory list',
          hireForCriteria: [
            'Time from list-receipt to first-touch <2 hours',
            'Zero duplicate-email collisions per import batch',
            'Audit trail for every cadence enrollment decision'
          ]
        },
        {
          situation: 'When a lead replies "remove me" or "unsubscribe"',
          motivation: 'I want them auto-suppressed across every cadence within minutes',
          expectedOutcome: 'So that we stay CAN-SPAM compliant and our sender reputation stays clean',
          currentWorkaround: 'Manual Slack ping + hope the rep remembers to remove from sequences',
          hireForCriteria: ['Opt-out applied across all cadences in <5 minutes', 'Zero post-opt-out emails sent']
        }
      ],
      personaPainPoints: ['Lists arrive with poor data quality', 'Cadence software hides failed sends', 'Territory rules live in someone else\'s head'],
      personaMotivations: ['Hit my activity quota daily', 'Trusted by AEs to hand off real-fit leads only'],
      personaSuccessSignals: ['Booked 8+ qualified meetings/week', 'Zero CAN-SPAM warnings from compliance']
    },
    {
      idHint: 'sales-manager',
      name: 'Sales Manager',
      type: 'reviewer',
      responsibilities: [
        'Audit pipeline activity across the SDR team',
        'Resolve territory conflicts on incoming lead lists',
        'Review qualified leads before hand-off to AE',
        'Adjust cadence templates and rep assignments'
      ],
      visibility: ['All SDR team leads', 'All cadences and templates', 'Pipeline aggregates and per-rep dashboards'],
      authMode: 'authenticated',
      jtbdSeeds: [
        {
          situation: 'When an SDR proposes a lead is qualified for hand-off',
          motivation: 'I want to confirm fit signals before the AE accepts the meeting',
          expectedOutcome: 'So that AE-accept rate stays above 70% and reps learn what "qualified" really means',
          currentWorkaround: 'Slack thread with screenshots; decisions get lost',
          hireForCriteria: ['Average review turnaround <4h', 'Decisions captured in audit trail', 'Per-rep accept-rate trend visible']
        }
      ],
      personaPainPoints: ['No central view of "who owns what"', 'Manual rolling-up of activity to leadership'],
      personaMotivations: ['Predictable pipeline contribution per quarter'],
      personaSuccessSignals: ['Pipeline coverage ≥3x quota', 'AE NPS of incoming SQLs >7/10']
    },
    {
      idHint: 'ae',
      name: 'Account Executive',
      type: 'secondary-user',
      responsibilities: [
        'Receive qualified leads from SDR hand-off',
        'Mark leads as accepted or kicked back to SDR',
        'Provide feedback on lead quality'
      ],
      visibility: ['Own territory accounts', 'Leads handed off to me', 'Hand-off feedback history'],
      authMode: 'authenticated',
      jtbdSeeds: [
        {
          situation: 'When a hand-off arrives in my queue',
          motivation: 'I want to accept or kick back with reason within one business day',
          expectedOutcome: 'So that SDRs learn what fit means and my pipeline reflects realistic conversion',
          currentWorkaround: 'CRM lookup + email thread',
          hireForCriteria: ['Hand-off decision captured in <24h', 'Kick-back reason structured (not free-text)']
        }
      ]
    }
  ],
  entityArchetypes: [
    {
      idHint: 'lead',
      name: 'Lead',
      description: 'A prospect record progressing through outbound cadences with sourcing, fit, and ownership metadata.',
      ownerActorIdHints: ['sdr'],
      riskTypes: ['privacy', 'compliance'],
      fields: [
        { name: 'leadId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'lead-acme-2026-001', description: 'Stable lead identifier (slug + sequence).' },
        { name: 'firstName', dbType: 'TEXT', required: true, pii: true, sample: 'Jordan', description: 'Lead first name.' },
        { name: 'lastName', dbType: 'TEXT', required: true, pii: true, sample: 'Park', description: 'Lead last name.' },
        { name: 'email', dbType: 'TEXT', required: true, unique: true, indexed: true, pii: true, sample: 'jordan.park@acme.example', description: 'Primary email — cadence sends use this.' },
        { name: 'company', dbType: 'TEXT', required: true, indexed: true, sample: 'Acme Corp', description: 'Lead company name.' },
        { name: 'title', dbType: 'TEXT', required: false, sample: 'VP Operations', description: 'Lead job title.' },
        { name: 'source', dbType: 'ENUM', required: true, enumValues: ['conference', 'inbound-form', 'list-purchase', 'referral'], defaultValue: 'inbound-form', sample: 'conference', description: 'How the lead entered the system.' },
        { name: 'fitScore', dbType: 'INTEGER', required: false, sample: 78, description: 'Numeric fit (0-100) based on enrichment signals.' },
        { name: 'stage', dbType: 'ENUM', required: true, enumValues: ['new', 'engaged', 'qualified', 'disqualified', 'handed-off'], defaultValue: 'new', indexed: true, sample: 'engaged', description: 'Current pipeline stage.' },
        { name: 'assignedActorId', dbType: 'TEXT', required: false, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'SET NULL' }, sample: 'mem-sdr-01', description: 'SDR who owns the lead.' },
        { name: 'optedOut', dbType: 'BOOLEAN', required: true, defaultValue: 'false', sample: false, description: 'True after a confirmed opt-out reply.' },
        { name: 'nextTouchAt', dbType: 'TIMESTAMPTZ', required: false, indexed: true, sample: '2026-05-03T15:00:00Z', description: 'When the next touch is scheduled.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-05-02T09:00:00Z', description: 'When the lead was first imported.' }
      ],
      negativeSample: { leadId: 'lead-bad-2026-099', email: 'not-an-email', stage: 'engaged', optedOut: true, source: 'list-purchase' }
    },
    {
      idHint: 'cadence',
      name: 'Cadence',
      description: 'A multi-touch outbound sequence (email + call) that a lead is enrolled in.',
      ownerActorIdHints: ['sdr', 'sales-manager'],
      riskTypes: ['operational', 'compliance'],
      fields: [
        { name: 'cadenceId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'cad-cold-v3', description: 'Cadence identifier.' },
        { name: 'name', dbType: 'TEXT', required: true, sample: 'Cold Outbound v3', description: 'Display name.' },
        { name: 'kind', dbType: 'ENUM', required: true, enumValues: ['cold', 'warm', 'event-follow-up', 'inbound-nurture'], defaultValue: 'cold', sample: 'cold', description: 'Cadence type.' },
        { name: 'touchCount', dbType: 'INTEGER', required: true, sample: 6, description: 'Total scheduled touches.' },
        { name: 'maxDurationDays', dbType: 'INTEGER', required: true, sample: 14, description: 'Max calendar days from enrollment to last touch.' },
        { name: 'createdByActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-mgr-01', description: 'Manager who authored the cadence.' },
        { name: 'isActive', dbType: 'BOOLEAN', required: true, defaultValue: 'true', sample: true, description: 'Whether the cadence accepts new enrollments.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-04-01T10:00:00Z', description: 'When the cadence was created.' }
      ]
    },
    {
      idHint: 'touch',
      name: 'Touch',
      description: 'A single outreach event (email send, call attempt, LinkedIn message) within a cadence.',
      ownerActorIdHints: ['sdr'],
      riskTypes: ['operational', 'compliance'],
      fields: [
        { name: 'touchId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'touch-2026-05-02-001', description: 'Touch identifier.' },
        { name: 'leadId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'lead', fieldName: 'leadId', onDelete: 'CASCADE' }, sample: 'lead-acme-2026-001', description: 'Which lead this touch belongs to.' },
        { name: 'cadenceId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'cadence', fieldName: 'cadenceId', onDelete: 'RESTRICT' }, sample: 'cad-cold-v3', description: 'Which cadence scheduled it.' },
        { name: 'channel', dbType: 'ENUM', required: true, enumValues: ['email', 'call', 'linkedin', 'sms'], defaultValue: 'email', sample: 'email', description: 'Outreach channel.' },
        { name: 'scheduledAt', dbType: 'TIMESTAMPTZ', required: true, indexed: true, sample: '2026-05-02T15:00:00Z', description: 'When the touch is scheduled.' },
        { name: 'sentAt', dbType: 'TIMESTAMPTZ', required: false, sample: '2026-05-02T15:01:12Z', description: 'When the touch was actually sent.' },
        { name: 'outcome', dbType: 'ENUM', required: false, enumValues: ['sent', 'replied', 'no-reply', 'bounced', 'opt-out'], sample: 'replied', description: 'What happened with the touch.' },
        { name: 'replyExcerpt', dbType: 'TEXT', required: false, sample: 'Thanks but please remove me', description: 'First 200 chars of the reply, used for opt-out detection.' }
      ]
    },
    {
      idHint: 'account',
      name: 'Account',
      description: 'A company-level record used to detect territory conflicts and group multiple leads.',
      ownerActorIdHints: ['ae', 'sales-manager'],
      riskTypes: ['operational'],
      fields: [
        { name: 'accountId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'acct-acme-001', description: 'Stable account identifier.' },
        { name: 'name', dbType: 'TEXT', required: true, indexed: true, sample: 'Acme Corp', description: 'Company name.' },
        { name: 'domain', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'acme.example', description: 'Email domain — used for dedupe.' },
        { name: 'ownerActorId', dbType: 'TEXT', required: false, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'SET NULL' }, sample: 'mem-ae-01', description: 'AE who owns the account.' },
        { name: 'tier', dbType: 'ENUM', required: true, enumValues: ['enterprise', 'mid-market', 'smb'], defaultValue: 'smb', sample: 'mid-market', description: 'Segmentation tier.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2025-11-15T00:00:00Z', description: 'When the account was first known to us.' }
      ]
    }
  ],
  workflowArchetypes: [
    {
      idHint: 'cadence-execution',
      name: 'Outbound cadence execution',
      primaryActorIdHint: 'sdr',
      secondaryActorIdHints: ['sales-manager'],
      acceptancePattern: 'Given an SDR with a fresh conference list, when they import 50 leads, dedupe against AE-owned accounts, enroll the survivors in a cold cadence, and log replies, then the next-step queue advances correctly and a single audit entry exists per touch with no post-opt-out sends.',
      steps: [
        { actorIdHint: 'sdr', action: 'Import a lead list from a conference event', systemResponse: 'Persist Lead records, deduplicate against existing accounts by email domain, flag conflicts with AE-owned territory.' },
        { actorIdHint: 'sdr', action: 'Resolve any conflict-flagged leads (skip vs. reassign)', systemResponse: 'Apply reviewer decision; surface remaining importable count.', branchOn: 'Conflict resolution: skip / reassign / escalate' },
        { actorIdHint: 'sdr', action: 'Enrich each lead with company context and fit score', systemResponse: 'Populate Lead.fitScore from enrichment provider; persist enrichment timestamp.' },
        { actorIdHint: 'sdr', action: 'Apply a cadence (cold / warm / event-follow-up) to the imported leads', systemResponse: 'Schedule Touch records; show next-step queue ordered by scheduledAt.' , branchOn: 'Cadence kind selection'},
        { actorIdHint: 'sdr', action: 'Log a touch outcome (replied, no-reply, bounced, opt-out)', systemResponse: 'Update Touch.outcome and Lead.stage; trigger next touch or auto-suppress on opt-out.' },
        { actorIdHint: 'sdr', action: 'Qualify or disqualify a lead based on advance/block signals', systemResponse: 'Move qualified leads to AE hand-off queue; record disqualification reason.', branchOn: 'Qualify / Disqualify decision' }
      ],
      failureModes: [
        { trigger: 'Lead opts out via reply ("unsubscribe", "remove me")', effect: 'If we keep emailing, we trigger CAN-SPAM exposure and damage sender reputation', mitigation: 'Detect opt-out keywords in reply text within 5 minutes; auto-set Lead.optedOut and cancel pending Touch records.' },
        { trigger: 'Imported list overlaps with existing AE-owned accounts', effect: 'Two reps email the same prospect; embarrassment and territory conflict', mitigation: 'Dedupe against ownership graph at import time; route conflicts to manager queue rather than auto-importing.' },
        { trigger: 'Bounce volume spikes above 5% on a cadence', effect: 'Domain reputation degrades; future deliverability collapses', mitigation: 'Pause cadence at 5% bounce rate; surface alert to manager with remediation hints.' }
      ]
    },
    {
      idHint: 'qualified-handoff',
      name: 'Qualified hand-off to AE',
      primaryActorIdHint: 'sales-manager',
      secondaryActorIdHints: ['sdr', 'ae'],
      acceptancePattern: 'Given a qualified lead pending hand-off, when the manager reviews and the AE accepts (or kicks back with reason), then the lead moves to handed-off stage with the AE owner stamped and the SDR sees the decision in their feedback log.',
      steps: [
        { actorIdHint: 'sdr', action: 'Mark a lead as qualified and propose hand-off to AE', systemResponse: 'Move Lead.stage to "qualified" and create a hand-off record awaiting manager review.' },
        { actorIdHint: 'sales-manager', action: 'Review the qualified lead\'s fit signals and activity history', systemResponse: 'Surface the lead, last 5 touches, fit score breakdown, and territory conflict status.' },
        { actorIdHint: 'sales-manager', action: 'Approve or send back to SDR with structured reason', systemResponse: 'Persist decision + reason; if approved, route to AE queue.', branchOn: 'Approve / Send back' },
        { actorIdHint: 'ae', action: 'Accept hand-off or kick back with reason', systemResponse: 'On accept: move stage to "handed-off"; assign AE owner; emit audit entry. On kick-back: notify SDR and surface reason in feedback log.', branchOn: 'Accept / Kick back' }
      ],
      failureModes: [
        { trigger: 'AE doesn\'t respond to hand-off within 24 hours', effect: 'Lead goes cold and SDR loses momentum; no learning signal back to SDR', mitigation: 'Auto-escalate to manager at 24h; SLA timer visible on hand-off card.' },
        { trigger: 'Manager and AE disagree on whether the lead is qualified', effect: 'SDRs learn inconsistent signals about fit', mitigation: 'Require manager to reconcile with the AE in the audit trail before re-routing.' }
      ]
    },
    {
      idHint: 'territory-management',
      name: 'Territory and account ownership management',
      primaryActorIdHint: 'sales-manager',
      secondaryActorIdHints: ['sdr', 'ae'],
      acceptancePattern: 'Given a manager managing the team\'s coverage, when they reassign accounts or update territory rules, then SDR imports correctly route conflicts and AEs see the updated ownership in their queue within 5 minutes.',
      steps: [
        { actorIdHint: 'sales-manager', action: 'Open the territory map showing AE-to-account assignments', systemResponse: 'Show all accounts grouped by current AE owner with tier and last-activity dates.' },
        { actorIdHint: 'sales-manager', action: 'Reassign an account to a new AE owner', systemResponse: 'Update Account.ownerActorId; emit audit entry; refresh dependent dashboards.' },
        { actorIdHint: 'sales-manager', action: 'Update territory rules (geography, tier, vertical)', systemResponse: 'Persist new rules; recompute conflict-flagging for in-flight imports.' },
        { actorIdHint: 'ae', action: 'See the updated account list', systemResponse: 'AE\'s accounts dashboard reflects the change.' }
      ],
      failureModes: [
        { trigger: 'Reassignment happens mid-cadence with active touches scheduled', effect: 'Touches go out from the wrong rep, breaking attribution', mitigation: 'Prompt manager to reroute or pause active cadences at reassignment time.' },
        { trigger: 'Two managers edit the same territory rules concurrently', effect: 'Last write wins silently; conflicting rules go live', mitigation: 'Optimistic concurrency check; surface "rules changed by X at time Y" inline.' }
      ]
    }
  ]
};
