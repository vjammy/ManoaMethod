import type { DomainPack } from './types';

/**
 * Fallback domain pack used when detectCategory has no confident match.
 * Generic but still concrete: a record-create + reviewer-approve loop with
 * explicit visibility, audit trail, and member management.
 */
export const general: DomainPack = {
  id: 'general',
  name: 'General record-and-review workflow',
  matchKeywords: [],
  industryName: 'Generic role-aware record management',
  industryTerminology: ['record', 'reviewer', 'audit entry', 'visibility', 'workspace', 'role'],
  successMetricSeeds: [
    { metric: 'Records created with all required fields', target: '≥98%', cadence: 'D7' },
    { metric: 'Reviewer turnaround time', target: '<2 business days', cadence: 'D7' }
  ],
  competingAlternatives: [
    { name: 'Spreadsheet + email', whyInsufficient: 'No role-based visibility, no audit, no consistent state machine.' }
  ],
  ideaCritiqueSeeds: [
    { weakSpot: 'Without a strong reviewer-vs-creator split, the audit trail collapses.', mitigation: 'Two distinct roles by default with non-overlapping write scope.' }
  ],
  actorArchetypes: [
    {
      idHint: 'creator',
      name: 'Creator',
      type: 'primary-user',
      responsibilities: ['Create records', 'Edit own records before review', 'Track status of own records'],
      visibility: ['Own records', 'Own audit history'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When I have a record to capture and progress', motivation: 'I want to enter it cleanly and see status without nagging the reviewer', expectedOutcome: 'So that the record either advances or comes back with concrete feedback', currentWorkaround: 'Spreadsheet + email status questions', hireForCriteria: ['Per-record status visible', 'No required-field surprises at submit', 'Audit trail of my edits'] }
      ]
    },
    {
      idHint: 'reviewer',
      name: 'Reviewer',
      type: 'reviewer',
      responsibilities: ['Review pending records', 'Approve or send back with notes', 'Manage workspace members'],
      visibility: ['All records pending review', 'Audit trail', 'Member roster'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When pending records sit in my queue', motivation: 'I want to dispatch them with confidence on the rules', expectedOutcome: 'So that creators get fast, structured feedback', currentWorkaround: 'Manual ad-hoc review', hireForCriteria: ['Bulk review for safe cases', 'Audit log on every decision', 'Clear note field on send-back'] }
      ]
    }
  ],
  entityArchetypes: [
    {
      idHint: 'record',
      name: 'Record',
      description: 'The core domain record progressing through a creator → reviewer state machine.',
      ownerActorIdHints: ['creator'],
      riskTypes: ['operational'],
      fields: [
        { name: 'recordId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'rec-2026-05-02-001', description: 'Stable record id.' },
        { name: 'title', dbType: 'TEXT', required: true, sample: 'Sample record', description: 'Human-readable label.' },
        { name: 'creatorActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-creator-01', description: 'Creator.' },
        { name: 'reviewerActorId', dbType: 'TEXT', required: false, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'SET NULL' }, sample: 'mem-reviewer-01', description: 'Assigned reviewer.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['draft', 'submitted', 'approved', 'returned'], defaultValue: 'draft', indexed: true, sample: 'submitted', description: 'Lifecycle state.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-05-02T09:00:00Z', description: 'When created.' },
        { name: 'updatedAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-05-02T11:30:00Z', description: 'Last update.' }
      ]
    },
    {
      idHint: 'review-decision',
      name: 'Review Decision',
      description: 'A reviewer\'s approve / return decision with note.',
      ownerActorIdHints: ['reviewer'],
      riskTypes: ['operational'],
      fields: [
        { name: 'decisionId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'dec-2026-05-02-001', description: 'Decision id.' },
        { name: 'recordId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'record', fieldName: 'recordId', onDelete: 'CASCADE' }, sample: 'rec-2026-05-02-001', description: 'Record reviewed.' },
        { name: 'reviewerActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-reviewer-01', description: 'Reviewer.' },
        { name: 'decision', dbType: 'ENUM', required: true, enumValues: ['approved', 'returned'], sample: 'approved', description: 'Decision.' },
        { name: 'note', dbType: 'TEXT', required: false, sample: 'Looks good.', description: 'Required for returns; optional for approves.' },
        { name: 'decidedAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-05-03T09:00:00Z', description: 'When decided.' }
      ]
    }
  ],
  workflowArchetypes: [
    {
      idHint: 'create-and-review',
      name: 'Create and review a record',
      primaryActorIdHint: 'creator',
      secondaryActorIdHints: ['reviewer'],
      acceptancePattern: 'Given a creator with a record to submit, when they submit and the reviewer decides, then the record reaches its final status with a complete audit trail and the creator is notified.',
      steps: [
        { actorIdHint: 'creator', action: 'Open the workspace and start a new record', systemResponse: 'Create Record in draft state with creatorActorId set.' },
        { actorIdHint: 'creator', action: 'Fill required fields and submit', systemResponse: 'Validate fields; status → submitted; route to reviewer queue.', branchOn: 'Required fields present / missing' },
        { actorIdHint: 'reviewer', action: 'Open the record and review fields plus history', systemResponse: 'Surface record + audit trail for the reviewer\'s scope.' },
        { actorIdHint: 'reviewer', action: 'Approve or return with note', systemResponse: 'Persist Review Decision; record status → approved or returned; notify creator.', branchOn: 'Approve / Return' },
        { actorIdHint: 'creator', action: 'See decision and act on note if returned', systemResponse: 'Surface decision and note to creator; allow re-edit on return.' }
      ],
      failureModes: [
        { trigger: 'Reviewer approves their own submission', effect: 'Audit collapse: no real review happened', mitigation: 'Validator blocks self-review; reviewerActorId must differ from creatorActorId.' },
        { trigger: 'Reviewer never gets to the queue', effect: 'Creators sit in submitted state with no signal', mitigation: 'SLA timer surfaces on dashboards; auto-escalate to admin after N days.' }
      ]
    },
    {
      idHint: 'workspace-membership',
      name: 'Workspace membership management',
      primaryActorIdHint: 'reviewer',
      secondaryActorIdHints: ['creator'],
      acceptancePattern: 'Given a reviewer managing the workspace, when they invite or change roles for members, then visibility is correctly enforced and the audit log captures the change.',
      steps: [
        { actorIdHint: 'reviewer', action: 'Invite a new member with chosen role', systemResponse: 'Create pending Member Profile; send invite token.' },
        { actorIdHint: 'creator', action: 'Accept invite and complete profile', systemResponse: 'Activate profile; surface scope-appropriate dashboard.' },
        { actorIdHint: 'reviewer', action: 'Adjust an existing member\'s role', systemResponse: 'Update Member Profile; emit audit entry.' }
      ],
      failureModes: [
        { trigger: 'Invite token expired before acceptance', effect: 'Member sees broken link', mitigation: 'Short token TTL with obvious resend path; reviewer sees pending invites.' },
        { trigger: 'Member downgraded mid-review of their own record', effect: 'They lose access to their own work in flight', mitigation: 'Grace period before downgrade enforces; pending records remain readable.' }
      ]
    }
  ]
};
