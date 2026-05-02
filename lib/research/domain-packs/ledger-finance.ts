import type { DomainPack } from './types';

export const ledgerFinance: DomainPack = {
  id: 'ledger-finance',
  name: 'Ledger / Finance / Expense / Allowance',
  matchKeywords: ['expense', 'budget', 'allowance', 'loan', 'grant', 'claim', 'ledger', 'rental tracker', 'pto tracker', 'reimbursement', 'transaction', 'invoice', 'micro-loan', 'finance', 'tracker'],
  matchAudience: ['employee', 'approver', 'finance lead', 'borrower', 'lender', 'grant officer'],
  industryName: 'Lightweight ledger / expense / claims tracking',
  industryTerminology: ['transaction', 'category', 'approver', 'receipt', 'reimbursement', 'ledger', 'balance', 'audit trail', 'approval threshold'],
  regulatoryHints: ['SOX (financial controls if employer-scale)', 'IRS receipt retention'],
  successMetricSeeds: [
    { metric: 'Submission-to-approval cycle time', target: '<3 business days', cadence: 'D7' },
    { metric: 'Receipts attached at submit', target: '≥95%', cadence: 'D7' },
    { metric: 'Audit trail complete on every entry', target: '100%', cadence: 'D30' }
  ],
  competingAlternatives: [
    { name: 'Spreadsheets emailed monthly', whyInsufficient: 'No approval workflow; receipts get lost; no audit history.' },
    { name: 'Expensify / Concur', whyInsufficient: 'Per-seat pricing too high for small teams; OCR overkill for simple claims.' }
  ],
  ideaCritiqueSeeds: [
    { weakSpot: 'A self-approve loophole (submitter and approver are same person) is the most common control gap.', mitigation: 'Block self-approval at the validator; require a different approver above any threshold.' }
  ],
  actorArchetypes: [
    {
      idHint: 'submitter',
      name: 'Submitter',
      type: 'primary-user',
      responsibilities: ['Create transactions / claims / loan entries', 'Attach receipts', 'See own balance and history'],
      visibility: ['Own transactions', 'Own balance', 'Own receipts'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When I have a fresh expense / claim to submit', motivation: 'I want to capture the receipt and submit in under 60 seconds', expectedOutcome: 'So that I get reimbursed within a week without nagging', currentWorkaround: 'Email finance with a JPG attached; weeks of back-and-forth', hireForCriteria: ['One-tap receipt upload', 'Approval status visible', 'Reimbursement date once approved'] }
      ],
      personaPainPoints: ['Lost receipts', 'Slow approvals', 'Don\'t know category rules'],
      personaMotivations: ['Get money back fast']
    },
    {
      idHint: 'approver',
      name: 'Approver',
      type: 'reviewer',
      responsibilities: ['Review pending submissions', 'Approve or send back with note', 'Enforce policy thresholds'],
      visibility: ['All submissions in scope', 'Per-submitter history', 'Policy thresholds'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When my approval queue has new entries', motivation: 'I want to dispatch them in batch with confidence on policy', expectedOutcome: 'So that submitters move on and finance sees clean data', currentWorkaround: 'Forward email + reply approve', hireForCriteria: ['Bulk approve below threshold', 'Policy hints inline', 'Audit log of every decision'] }
      ]
    },
    {
      idHint: 'finance-lead',
      name: 'Finance Lead',
      type: 'reviewer',
      responsibilities: ['Set policy and thresholds', 'Run reconciliation', 'Export to accounting'],
      visibility: ['All transactions', 'All approvals', 'Audit trail'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When the month closes', motivation: 'I want to reconcile and export with no missing receipts', expectedOutcome: 'So that books close on time and audit history is complete', currentWorkaround: 'Hours of cross-checking spreadsheets', hireForCriteria: ['One-click monthly export', 'Missing-receipt list', 'Self-approval anomalies flagged'] }
      ]
    }
  ],
  entityArchetypes: [
    {
      idHint: 'transaction',
      name: 'Transaction',
      description: 'A single ledger entry: expense, claim, loan disbursement, allowance credit, etc.',
      ownerActorIdHints: ['submitter'],
      riskTypes: ['financial', 'compliance'],
      fields: [
        { name: 'transactionId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'tx-2026-05-02-001', description: 'Stable transaction id.' },
        { name: 'submitterActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-submitter-01', description: 'Submitter.' },
        { name: 'amount', dbType: 'DECIMAL', required: true, sample: 142.50, description: 'Amount (positive = expense; negative = credit).' },
        { name: 'currency', dbType: 'TEXT', required: true, defaultValue: "'USD'", sample: 'USD', description: 'ISO-4217 currency code.' },
        { name: 'category', dbType: 'ENUM', required: true, enumValues: ['travel', 'meals', 'software', 'supplies', 'allowance', 'loan', 'grant', 'other'], defaultValue: 'other', indexed: true, sample: 'travel', description: 'Category tag.' },
        { name: 'description', dbType: 'TEXT', required: true, sample: 'Conference travel — Acme Sales Summit', description: 'Free-text purpose.' },
        { name: 'receiptUrl', dbType: 'TEXT', required: false, sample: 'https://receipts.example/tx-2026-05-02-001.pdf', description: 'Storage URL of the attached receipt.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['draft', 'submitted', 'approved', 'rejected', 'reimbursed'], defaultValue: 'draft', indexed: true, sample: 'submitted', description: 'Lifecycle state.' },
        { name: 'submittedAt', dbType: 'TIMESTAMPTZ', required: false, sample: '2026-05-02T11:30:00Z', description: 'When submitted (status leaves draft).' }
      ]
    },
    {
      idHint: 'approval',
      name: 'Approval Decision',
      description: 'A decision row recording who approved or rejected a transaction and why.',
      ownerActorIdHints: ['approver'],
      riskTypes: ['compliance'],
      fields: [
        { name: 'approvalId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'appr-2026-05-02-001', description: 'Stable approval id.' },
        { name: 'transactionId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'transaction', fieldName: 'transactionId', onDelete: 'CASCADE' }, sample: 'tx-2026-05-02-001', description: 'Transaction reviewed.' },
        { name: 'approverActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-approver-01', description: 'Approver.' },
        { name: 'decision', dbType: 'ENUM', required: true, enumValues: ['approved', 'rejected'], sample: 'approved', description: 'Decision.' },
        { name: 'note', dbType: 'TEXT', required: false, sample: 'Within policy.', description: 'Free-text reason (required for reject).' },
        { name: 'decidedAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-05-03T09:14:00Z', description: 'When decided.' }
      ]
    },
    {
      idHint: 'policy',
      name: 'Policy Threshold',
      description: 'A category × amount rule that picks the right approver tier.',
      ownerActorIdHints: ['finance-lead'],
      riskTypes: ['compliance'],
      fields: [
        { name: 'policyId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'pol-travel-1k', description: 'Policy id.' },
        { name: 'category', dbType: 'ENUM', required: true, enumValues: ['travel', 'meals', 'software', 'supplies', 'allowance', 'loan', 'grant', 'other'], indexed: true, sample: 'travel', description: 'Category this policy applies to.' },
        { name: 'amountThreshold', dbType: 'DECIMAL', required: true, sample: 1000.00, description: 'Above this amount, escalation tier kicks in.' },
        { name: 'requiresEscalation', dbType: 'BOOLEAN', required: true, defaultValue: 'false', sample: true, description: 'If true, an escalated approver must sign off.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-01-01T00:00:00Z', description: 'When created.' }
      ]
    }
  ],
  workflowArchetypes: [
    {
      idHint: 'submit-and-approve',
      name: 'Submit and approve a transaction',
      primaryActorIdHint: 'submitter',
      secondaryActorIdHints: ['approver', 'finance-lead'],
      acceptancePattern: 'Given a submitter with a receipt to attach, when they submit and the right approver decides, then the transaction lands in the correct status with a complete audit trail and the submitter is notified.',
      steps: [
        { actorIdHint: 'submitter', action: 'Create a draft transaction with amount, category, description', systemResponse: 'Persist Transaction in draft.' },
        { actorIdHint: 'submitter', action: 'Attach a receipt and submit', systemResponse: 'Validate receipt presence above policy threshold; status → submitted; route to correct approver.', branchOn: 'Above threshold + missing receipt → block submit' },
        { actorIdHint: 'approver', action: 'Review and approve or reject with note', systemResponse: 'Persist Approval Decision; transaction status → approved or rejected; notify submitter.', branchOn: 'Approve / Reject' },
        { actorIdHint: 'finance-lead', action: 'Process reimbursement / disbursement on approved entries', systemResponse: 'Status → reimbursed; export to accounting.' }
      ],
      failureModes: [
        { trigger: 'Submitter and approver are the same person', effect: 'Self-approval undermines the entire control', mitigation: 'Validator blocks any approval where decidedBy == submitter; surface "needs different approver" error.' },
        { trigger: 'Receipt URL points to a deleted file', effect: 'Audit can\'t verify the expense', mitigation: 'On attach, validate URL fetch; persist a hash; nightly re-check.' }
      ]
    },
    {
      idHint: 'monthly-reconciliation',
      name: 'Monthly reconciliation and export',
      primaryActorIdHint: 'finance-lead',
      secondaryActorIdHints: ['approver'],
      acceptancePattern: 'Given month-end, when the finance lead runs reconciliation, then every approved transaction has a complete audit chain and the export contains zero rows missing receipt or approval.',
      steps: [
        { actorIdHint: 'finance-lead', action: 'Open the month-end view', systemResponse: 'Show submitted, approved, rejected, reimbursed counts by category.' },
        { actorIdHint: 'finance-lead', action: 'Filter to incomplete rows (missing receipt / approval)', systemResponse: 'Surface the rows with the specific gap.' },
        { actorIdHint: 'finance-lead', action: 'Export approved transactions to accounting CSV', systemResponse: 'Produce CSV with audit columns; mark export run with checksum.' }
      ],
      failureModes: [
        { trigger: 'Two finance leads export concurrently', effect: 'Risk of double-recording in accounting', mitigation: 'Single export lock per month; second export shows "in progress" state.' },
        { trigger: 'Currency mismatch in a multi-region team', effect: 'Totals roll up wrong', mitigation: 'Normalize to base currency at submit time using a snapshotted FX rate.' }
      ]
    }
  ]
};
