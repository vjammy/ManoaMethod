import type { DomainPack } from './types';

export const household: DomainPack = {
  id: 'household',
  name: 'Household / Family coordination',
  matchKeywords: ['family', 'chore', 'household', 'parent', 'kid', 'caregiver', 'co-parent', 'task board', 'allowance', 'pet care', 'grocery', 'shared list', 'home'],
  matchAudience: ['parent', 'caregiver', 'family', 'co-parent', 'guardian', 'kid', 'child'],
  industryName: 'Household / family coordination apps',
  industryTerminology: ['chore', 'task', 'household', 'caregiver', 'recurring', 'reminder', 'kid-friendly', 'allowance', 'reward'],
  regulatoryHints: ['COPPA (children under 13)'],
  successMetricSeeds: [
    { metric: 'Household activates within 15 min of first parent signup', target: '≥70%', cadence: 'D1' },
    { metric: 'At least one task completed by every member in the first week', target: '≥80% of households', cadence: 'D7' },
    { metric: 'Recurring tasks generate without parent intervention', target: '100%', cadence: 'D30' }
  ],
  competingAlternatives: [
    { name: 'Group chat + sticky notes', whyInsufficient: 'No history, no due dates, kids can\'t check off without parent forwarding.' },
    { name: 'Generic todo apps (Todoist, Notion)', whyInsufficient: 'Not kid-friendly; no role split between parent and child; awkward on mobile.' }
  ],
  ideaCritiqueSeeds: [
    { weakSpot: 'Kids may need parental approval before account creation under COPPA.', mitigation: 'Parent-first onboarding; kid accounts are scoped child-profiles created and managed by a parent.' }
  ],
  actorArchetypes: [
    {
      idHint: 'parent',
      name: 'Parent',
      type: 'primary-user',
      responsibilities: [
        'Set up the household workspace and invite family members',
        'Create chores (one-off and recurring) and assign to kids or co-parents',
        'Review completed chores and confirm before allowance/reward credit',
        'Adjust visibility rules so kids only see what they own'
      ],
      visibility: ['All household tasks', 'All household members', 'Allowance ledger if enabled'],
      authMode: 'authenticated',
      jtbdSeeds: [
        {
          situation: 'When the week starts and chores need to be planned',
          motivation: 'I want to assign recurring chores to the right family member without re-typing each one',
          expectedOutcome: 'So that the week\'s chores are visible on every member\'s dashboard before the first one is due',
          currentWorkaround: 'Whiteboard on the fridge that nobody updates after Tuesday',
          hireForCriteria: ['Weekly chore plan ready in <10 min', 'Recurring chores generate automatically', 'Reminders go to the assignee not just the parent']
        },
        {
          situation: 'When a kid claims they completed a chore',
          motivation: 'I want to verify and confirm before allowance is credited',
          expectedOutcome: 'So that the allowance ledger reflects only confirmed work and arguments are settled by audit trail',
          currentWorkaround: 'He-said-she-said arguments at dinner',
          hireForCriteria: ['Chore status shows who marked complete and when', 'Parent confirm is required for allowance credit']
        }
      ],
      personaPainPoints: ['Chores fall through the cracks', 'Kids argue about whose turn it is', 'No way to track progress on weekends'],
      personaMotivations: ['Less mental load', 'Teach kids responsibility'],
      personaSuccessSignals: ['Family fights about chores ↓', 'Kids self-check the dashboard']
    },
    {
      idHint: 'co-parent',
      name: 'Co-parent',
      type: 'secondary-user',
      responsibilities: [
        'Create and assign chores like the primary parent',
        'Confirm completions for chores assigned by themselves',
        'Stay in sync with the other parent on changes'
      ],
      visibility: ['All household tasks', 'All household members'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When the other parent has set up tasks I disagree with', motivation: 'I want to see and adjust without restarting the week', expectedOutcome: 'So that we co-manage without parent-vs-parent friction', currentWorkaround: 'Texts back and forth and one parent overriding the other', hireForCriteria: ['Edit history shows who changed what', 'Conflicts surface on next sync, not at midnight'] }
      ]
    },
    {
      idHint: 'kid',
      name: 'Kid',
      type: 'primary-user',
      responsibilities: [
        'See chores assigned to me',
        'Mark chores as done when I finish them',
        'See my own allowance ledger if enabled'
      ],
      visibility: ['Own tasks only', 'Own allowance ledger entries'],
      authMode: 'magic-link',
      jtbdSeeds: [
        { situation: 'When I get home from school and want to know what to do', motivation: 'I want a simple list of my chores due today', expectedOutcome: 'So that I can finish them and earn allowance without asking a parent', currentWorkaround: 'Asking my parent (who often forgets)', hireForCriteria: ['List is mobile-friendly', 'Each chore has a clear "I did it" button', 'I can see my balance update'] }
      ]
    },
    {
      idHint: 'caregiver',
      name: 'Caregiver',
      type: 'external',
      responsibilities: [
        'See chores during the time block they cover',
        'Mark chores as done on a kid\'s behalf when needed',
        'Cannot create new chores or change allowance rules'
      ],
      visibility: ['Tasks assigned during the caregiver\'s coverage window', 'No allowance balances'],
      authMode: 'magic-link',
      jtbdSeeds: [
        { situation: 'When I\'m watching the kids after school', motivation: 'I want to see what they need to do without poking around in family settings', expectedOutcome: 'So that they finish the right chores and the parent sees status that evening', currentWorkaround: 'Parent texts me a list', hireForCriteria: ['Read-only kid task view', 'No exposure to allowance or settings'] }
      ]
    }
  ],
  entityArchetypes: [
    {
      idHint: 'household',
      name: 'Household',
      description: 'A family workspace that groups members and tasks; one user belongs to one or more households.',
      ownerActorIdHints: ['parent'],
      riskTypes: ['privacy'],
      fields: [
        { name: 'householdId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'hh-park-family-001', description: 'Stable household identifier.' },
        { name: 'name', dbType: 'TEXT', required: true, sample: 'Park Family', description: 'Human-readable household name.' },
        { name: 'createdByActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-parent-01', description: 'Founding parent.' },
        { name: 'rewardCurrency', dbType: 'ENUM', required: false, enumValues: ['allowance', 'stars', 'screen-time', 'none'], defaultValue: 'none', sample: 'allowance', description: 'What kids earn for completed chores.' },
        { name: 'kidApprovalRequired', dbType: 'BOOLEAN', required: true, defaultValue: 'true', sample: true, description: 'If true, parent must confirm before reward credit.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-04-01T10:00:00Z', description: 'When the household was created.' }
      ]
    },
    {
      idHint: 'task',
      name: 'Household Task',
      description: 'A chore assigned to a member of the household; can be one-off or recurring.',
      ownerActorIdHints: ['parent'],
      riskTypes: ['operational'],
      fields: [
        { name: 'taskId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'task-2026-w18-dishes-001', description: 'Stable task identifier.' },
        { name: 'householdId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'household', fieldName: 'householdId', onDelete: 'CASCADE' }, sample: 'hh-park-family-001', description: 'Household this task belongs to.' },
        { name: 'title', dbType: 'TEXT', required: true, sample: 'Empty the dishwasher', description: 'Short chore label.' },
        { name: 'assignedToActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'SET NULL' }, sample: 'mem-kid-01', description: 'Member who owns the chore.' },
        { name: 'dueAt', dbType: 'TIMESTAMPTZ', required: false, indexed: true, sample: '2026-05-02T18:00:00Z', description: 'When the chore is due.' },
        { name: 'recurrence', dbType: 'ENUM', required: true, enumValues: ['one-off', 'daily', 'weekdays', 'weekly'], defaultValue: 'one-off', sample: 'weekly', description: 'How often this chore repeats.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['todo', 'done', 'confirmed', 'skipped'], defaultValue: 'todo', indexed: true, sample: 'todo', description: 'Current chore state.' },
        { name: 'rewardAmount', dbType: 'DECIMAL', required: false, sample: 1.00, description: 'Optional reward credited on confirm.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-04-28T08:00:00Z', description: 'When the chore was created.' }
      ]
    },
    {
      idHint: 'allowance-entry',
      name: 'Allowance Entry',
      description: 'A ledger record crediting or debiting a kid\'s balance.',
      ownerActorIdHints: ['parent'],
      riskTypes: ['financial'],
      fields: [
        { name: 'entryId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'allow-2026-05-01-001', description: 'Stable allowance entry id.' },
        { name: 'kidActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'CASCADE' }, sample: 'mem-kid-01', description: 'Whose ledger this affects.' },
        { name: 'taskId', dbType: 'TEXT', required: false, indexed: true, fkHint: { entityIdHint: 'task', fieldName: 'taskId', onDelete: 'SET NULL' }, sample: 'task-2026-w18-dishes-001', description: 'Task that triggered the entry, if any.' },
        { name: 'amount', dbType: 'DECIMAL', required: true, sample: 1.00, description: 'Positive credit or negative debit.' },
        { name: 'reason', dbType: 'TEXT', required: true, sample: 'Confirmed: Empty the dishwasher', description: 'Human reason for the entry.' },
        { name: 'createdByActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-parent-01', description: 'Parent who created the entry.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-05-01T19:00:00Z', description: 'Server timestamp.' }
      ]
    }
  ],
  workflowArchetypes: [
    {
      idHint: 'plan-week',
      name: 'Plan the household week',
      primaryActorIdHint: 'parent',
      secondaryActorIdHints: ['co-parent', 'kid'],
      acceptancePattern: 'Given a household with members invited, when a parent creates a weekly chore plan with recurring rules, then every assignee sees their chores on their dashboard before Monday morning and reminders fire on time.',
      steps: [
        { actorIdHint: 'parent', action: 'Open the household and invite each family member', systemResponse: 'Send magic-link invites; pending invites surface until accepted.' },
        { actorIdHint: 'parent', action: 'Create chores with assignee, due time, and recurrence', systemResponse: 'Persist tasks with recurrence rules; first instance appears on the assignee dashboard.' },
        { actorIdHint: 'parent', action: 'Configure reward currency (allowance / stars / none)', systemResponse: 'Persist household setting; affect future chore confirms.' },
        { actorIdHint: 'co-parent', action: 'Review and adjust the assignment plan', systemResponse: 'Persist edits; surface change history with attribution.' },
        { actorIdHint: 'parent', action: 'Send the week\'s plan to the family', systemResponse: 'Optionally email/notify members; show "ready" badge on dashboard.' }
      ],
      failureModes: [
        { trigger: 'Both parents edit the same chore concurrently from different devices', effect: 'Last write wins silently; the losing parent\'s edit is lost', mitigation: 'Optimistic concurrency stamp on Task; surface conflict banner with "review their changes" before save.' },
        { trigger: 'Recurring task generation skips a week (e.g. server downtime)', effect: 'Family thinks chore plan is broken; trust drops', mitigation: 'Backfill missing instances on next health check; show "regenerated" indicator.' }
      ]
    },
    {
      idHint: 'kid-completes-chore',
      name: 'Kid completes a chore',
      primaryActorIdHint: 'kid',
      secondaryActorIdHints: ['parent'],
      acceptancePattern: 'Given a kid with chores assigned, when they mark one complete via mobile, then the parent sees a pending-confirm card and the allowance is credited only after parent confirm.',
      steps: [
        { actorIdHint: 'kid', action: 'Open the kid dashboard on mobile', systemResponse: 'Show only own chores grouped by due time.' },
        { actorIdHint: 'kid', action: 'Tap "I did it" on a chore', systemResponse: 'Move task status from todo → done; emit audit entry; surface to parent.' },
        { actorIdHint: 'parent', action: 'Open pending-confirm queue and review', systemResponse: 'Show task title, who completed, and when.' },
        { actorIdHint: 'parent', action: 'Confirm or reject with note', systemResponse: 'On confirm: credit allowance entry. On reject: status returns to todo with note shown to kid.', branchOn: 'Confirm / Reject' }
      ],
      failureModes: [
        { trigger: 'Kid marks a chore done that wasn\'t actually done', effect: 'Allowance gets credited for unfinished work', mitigation: 'Parent confirm step is mandatory before allowance entry; kid sees "pending confirm" badge until parent acts.' },
        { trigger: 'Parent never gets to the confirm queue', effect: 'Kid loses faith in the loop', mitigation: 'Daily digest summarizing pending confirms; auto-confirm option for trusted kids after N days.' }
      ]
    }
  ]
};
