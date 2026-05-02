import type { DomainPack } from './types';

export const community: DomainPack = {
  id: 'community',
  name: 'Community / HOA / Clubs',
  matchKeywords: ['hoa', 'condo', 'club', 'reading', 'mentorship', 'meetup', 'group', 'community garden', 'wedding rsvp', 'community class pass', 'condo board'],
  matchAudience: ['resident', 'board member', 'club member', 'neighbor', 'organizer', 'mentor', 'mentee'],
  industryName: 'Community / HOA / membership clubs',
  industryTerminology: ['member', 'household', 'announcement', 'meeting', 'agenda', 'minutes', 'dues'],
  successMetricSeeds: [
    { metric: 'Active member participation per month', target: '≥50%', cadence: 'D30' },
    { metric: 'Issue ticket time-to-acknowledge', target: '<24h', cadence: 'D1' }
  ],
  competingAlternatives: [
    { name: 'Facebook group / WhatsApp', whyInsufficient: 'No agenda or minutes; private to members but not searchable; no audit trail.' }
  ],
  ideaCritiqueSeeds: [
    { weakSpot: 'Members and non-member residents have different visibility expectations.', mitigation: 'Two-tier role: members see internal discussion, residents see only public announcements.' }
  ],
  actorArchetypes: [
    {
      idHint: 'member',
      name: 'Community Member',
      type: 'primary-user',
      responsibilities: ['Read announcements', 'RSVP to events / meetings', 'File issue tickets'],
      visibility: ['Internal members area', 'Own RSVPs and tickets'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When the next community meeting is announced', motivation: 'I want to RSVP and see the agenda fast', expectedOutcome: 'So that I show up prepared and informed', currentWorkaround: 'Email thread with conflicting information', hireForCriteria: ['Single calendar of meetings', 'Persistent agenda link'] }
      ]
    },
    {
      idHint: 'organizer',
      name: 'Organizer / Board Member',
      type: 'reviewer',
      responsibilities: ['Publish announcements and meeting minutes', 'Triage issue tickets', 'Manage roster'],
      visibility: ['All members', 'All tickets', 'Admin tools'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When a new ticket comes in', motivation: 'I want to triage and assign with a paper trail', expectedOutcome: 'So that residents see action and the board can audit decisions', currentWorkaround: 'Group text and forgetting which one is open', hireForCriteria: ['Ticket queue with statuses', 'Audit history per ticket'] }
      ]
    },
    {
      idHint: 'resident',
      name: 'Resident (non-member)',
      type: 'external',
      responsibilities: ['Read public announcements', 'File public tickets'],
      visibility: ['Public announcements only', 'Own ticket'],
      authMode: 'magic-link',
      jtbdSeeds: [
        { situation: 'When a maintenance issue affects my unit', motivation: 'I want to file a ticket without joining the membership', expectedOutcome: 'So that someone with authority sees my issue', currentWorkaround: 'Calling the office', hireForCriteria: ['Magic-link form', 'Ticket status visible'] }
      ]
    }
  ],
  entityArchetypes: [
    {
      idHint: 'announcement',
      name: 'Announcement',
      description: 'A community announcement (public or members-only).',
      ownerActorIdHints: ['organizer'],
      riskTypes: ['operational'],
      fields: [
        { name: 'announcementId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'ann-2026-05-02-001', description: 'Stable announcement id.' },
        { name: 'title', dbType: 'TEXT', required: true, sample: 'Pool maintenance — 2026-05-15', description: 'Short title.' },
        { name: 'body', dbType: 'TEXT', required: true, sample: 'Pool will be closed for resurfacing 2026-05-15 through 2026-05-18.', description: 'Body.' },
        { name: 'visibility', dbType: 'ENUM', required: true, enumValues: ['public', 'members'], defaultValue: 'members', indexed: true, sample: 'public', description: 'Audience.' },
        { name: 'createdByActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-organizer-01', description: 'Author.' },
        { name: 'publishedAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-05-02T10:00:00Z', description: 'When published.' }
      ]
    },
    {
      idHint: 'meeting',
      name: 'Meeting',
      description: 'A scheduled community meeting with agenda and minutes.',
      ownerActorIdHints: ['organizer'],
      riskTypes: ['operational'],
      fields: [
        { name: 'meetingId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'mtg-2026-05-15-001', description: 'Stable meeting id.' },
        { name: 'title', dbType: 'TEXT', required: true, sample: 'Q2 Board Meeting', description: 'Title.' },
        { name: 'startsAt', dbType: 'TIMESTAMPTZ', required: true, indexed: true, sample: '2026-05-15T18:00:00Z', description: 'Meeting start.' },
        { name: 'agendaUrl', dbType: 'TEXT', required: false, sample: 'https://example/agenda-2026-05-15.md', description: 'Agenda link.' },
        { name: 'minutesUrl', dbType: 'TEXT', required: false, sample: 'https://example/minutes-2026-05-15.md', description: 'Minutes link, posted after.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['scheduled', 'in-progress', 'completed', 'cancelled'], defaultValue: 'scheduled', indexed: true, sample: 'scheduled', description: 'Meeting state.' }
      ]
    },
    {
      idHint: 'issue-ticket',
      name: 'Issue Ticket',
      description: 'A maintenance or community issue raised by a resident or member.',
      ownerActorIdHints: ['organizer', 'resident'],
      riskTypes: ['operational'],
      fields: [
        { name: 'ticketId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'tkt-2026-05-02-001', description: 'Stable ticket id.' },
        { name: 'title', dbType: 'TEXT', required: true, sample: 'Hallway light out — 3rd floor', description: 'Short title.' },
        { name: 'createdByActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'CASCADE' }, sample: 'mem-resident-01', description: 'Reporter.' },
        { name: 'assignedActorId', dbType: 'TEXT', required: false, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'SET NULL' }, sample: 'mem-organizer-01', description: 'Assignee.' },
        { name: 'priority', dbType: 'ENUM', required: true, enumValues: ['low', 'medium', 'high', 'urgent'], defaultValue: 'medium', indexed: true, sample: 'high', description: 'Priority.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['open', 'triaged', 'in-progress', 'resolved', 'closed'], defaultValue: 'open', indexed: true, sample: 'open', description: 'Status.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-05-02T08:14:00Z', description: 'When created.' }
      ]
    }
  ],
  workflowArchetypes: [
    {
      idHint: 'announcement-publish',
      name: 'Publish an announcement',
      primaryActorIdHint: 'organizer',
      secondaryActorIdHints: ['member', 'resident'],
      acceptancePattern: 'Given an organizer drafting an announcement, when they pick visibility and publish, then the right audience sees it and a record exists with attribution and timestamp.',
      steps: [
        { actorIdHint: 'organizer', action: 'Draft an announcement title and body', systemResponse: 'Persist draft.' },
        { actorIdHint: 'organizer', action: 'Pick visibility (public vs members) and publish', systemResponse: 'Persist publishedAt; surface to the chosen audience.', branchOn: 'Public / Members' },
        { actorIdHint: 'member', action: 'Open the announcement', systemResponse: 'Mark read for that member; aggregate read count for organizer.' }
      ],
      failureModes: [
        { trigger: 'Organizer accidentally marks a private announcement as public', effect: 'Sensitive board info leaks to non-members', mitigation: 'Confirmation step on visibility change with explicit "publish to public" affordance.' },
        { trigger: 'Announcement contains personal data of a resident', effect: 'Privacy breach within the community', mitigation: 'Linter flag for PII patterns (name + unit) before publish.' }
      ]
    },
    {
      idHint: 'ticket-triage',
      name: 'Triage and resolve an issue ticket',
      primaryActorIdHint: 'organizer',
      secondaryActorIdHints: ['member', 'resident'],
      acceptancePattern: 'Given a new ticket, when the organizer assigns and updates status, then the reporter sees progress and resolution timeline lives in the ticket history.',
      steps: [
        { actorIdHint: 'resident', action: 'File a new issue ticket with title and priority', systemResponse: 'Create Issue Ticket in open state; notify organizers.' },
        { actorIdHint: 'organizer', action: 'Triage and assign the ticket', systemResponse: 'Status → triaged; assignment recorded.', branchOn: 'Assigned / Unassigned' },
        { actorIdHint: 'organizer', action: 'Resolve and close the ticket', systemResponse: 'Status → resolved; reporter notified; ticket history captures full trail.' }
      ],
      failureModes: [
        { trigger: 'Ticket is closed without notification to reporter', effect: 'Reporter assumes inaction', mitigation: 'Mandatory status-change notification on resolve.' },
        { trigger: 'Two organizers reassign the same ticket back and forth', effect: 'Issue goes nowhere', mitigation: 'Reassignment threshold (3 max) escalates to board lead.' }
      ]
    }
  ]
};
