import type { DomainPack } from './types';

export const healthcare: DomainPack = {
  id: 'healthcare',
  name: 'Healthcare / Clinical',
  matchKeywords: ['clinic', 'patient', 'medical', 'health', 'hipaa', 'mrn', 'doctor', 'nurse', 'prescription', 'appointment', 'ehr', 'visit', 'diagnosis', 'pharmacy'],
  matchAudience: ['patient', 'clinician', 'doctor', 'nurse', 'medical assistant', 'practice manager'],
  industryName: 'Outpatient clinical operations',
  industryTerminology: ['MRN', 'visit', 'encounter', 'consent', 'PHI', 'provider', 'rooming', 'no-show', 'clinical note', 'HIPAA'],
  regulatoryHints: ['HIPAA Privacy Rule §164.502', 'HIPAA Security Rule §164.312', 'HITECH breach notification'],
  successMetricSeeds: [
    { metric: 'Patient check-in time', target: '<5 minutes', cadence: 'D1' },
    { metric: 'Documentation completion same-day', target: '≥95%', cadence: 'D7' },
    { metric: 'No-show follow-up actioned within 24h', target: '≥90%', cadence: 'D30' }
  ],
  competingAlternatives: [
    { name: 'Paper schedule + sticky notes', whyInsufficient: 'No HIPAA-grade audit trail; lost notes are routine.' },
    { name: 'Full EHR (Epic, Cerner)', whyInsufficient: 'Multi-million-dollar deployment; small clinics can\'t use it.' }
  ],
  ideaCritiqueSeeds: [
    { weakSpot: 'Anything storing PHI must meet HIPAA technical safeguards (access control, audit, encryption).', mitigation: 'Encrypt PHI at rest and in transit; access control on every entity; full audit log of every read.' }
  ],
  actorArchetypes: [
    {
      idHint: 'patient',
      name: 'Patient',
      type: 'external',
      responsibilities: ['Book and confirm visits', 'Update demographics and insurance', 'See own visit summary'],
      visibility: ['Own visits', 'Own clinical summaries', 'Own consent records'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When I need to schedule a follow-up visit', motivation: 'I want to find a slot that works without phoning the office', expectedOutcome: 'So that I get seen on time and no insurance details fall through the cracks', currentWorkaround: 'Phone tag with the front desk', hireForCriteria: ['Self-service booking', 'Visit summary visible after the visit'] }
      ]
    },
    {
      idHint: 'clinician',
      name: 'Clinician (Provider)',
      type: 'primary-user',
      responsibilities: ['See assigned patients of the day', 'Document the encounter', 'Order follow-ups and prescriptions'],
      visibility: ['Assigned panel of patients', 'Today\'s schedule', 'Documentation tools'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When the next patient is roomed', motivation: 'I want to review their last visit and start documenting fast', expectedOutcome: 'So that I finish the note before the next room is ready', currentWorkaround: 'Paper chart + dictation', hireForCriteria: ['<60s to open chart', 'Note template loaded by visit type', 'Audit trail of every read'] }
      ],
      personaPainPoints: ['Charting after-hours kills wellbeing', 'EHRs are slow and ugly'],
      personaMotivations: ['Spend more time with patients, less with charts']
    },
    {
      idHint: 'medical-assistant',
      name: 'Medical Assistant',
      type: 'operator',
      responsibilities: ['Room patients and record vitals', 'Prepare exam rooms', 'Communicate clinic-side changes'],
      visibility: ['Today\'s schedule', 'Vitals input on roomed patients', 'No clinical note write access'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When a patient arrives for their visit', motivation: 'I want to room them and capture vitals fast', expectedOutcome: 'So that the clinician walks in fully oriented', currentWorkaround: 'Pen + clipboard + verbal handoff', hireForCriteria: ['Vitals entry on a tablet', 'Visible to clinician within seconds'] }
      ]
    },
    {
      idHint: 'practice-manager',
      name: 'Practice Manager',
      type: 'reviewer',
      responsibilities: ['Audit access logs', 'Manage provider schedules and capacity', 'Run no-show recovery'],
      visibility: ['All clinic schedules', 'Audit logs', 'Operational metrics (not PHI in detail)'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When I run the weekly compliance check', motivation: 'I want to confirm only authorized staff accessed each chart', expectedOutcome: 'So that we pass HIPAA audits without scrambling', currentWorkaround: 'Manual log review in a spreadsheet', hireForCriteria: ['Searchable audit log', 'Anomaly alerts for unusual access patterns'] }
      ]
    }
  ],
  entityArchetypes: [
    {
      idHint: 'patient-record',
      name: 'Patient Record',
      description: 'Demographic and contact data for one patient, plus the MRN.',
      ownerActorIdHints: ['practice-manager', 'clinician'],
      riskTypes: ['privacy', 'compliance'],
      fields: [
        { name: 'mrn', dbType: 'TEXT', required: true, unique: true, indexed: true, pii: true, sensitive: true, sample: 'MRN-484823', description: 'Medical record number.' },
        { name: 'firstName', dbType: 'TEXT', required: true, pii: true, sample: 'Sage', description: 'Patient first name.' },
        { name: 'lastName', dbType: 'TEXT', required: true, pii: true, sample: 'Lee', description: 'Patient last name.' },
        { name: 'dateOfBirth', dbType: 'DATE', required: true, pii: true, sensitive: true, sample: '1985-03-12', description: 'DOB used for identity matching.' },
        { name: 'phone', dbType: 'TEXT', required: false, pii: true, sample: '+1-415-555-0142', description: 'Contact phone.' },
        { name: 'email', dbType: 'TEXT', required: false, pii: true, indexed: true, sample: 'sage.lee@example.com', description: 'Contact email.' },
        { name: 'preferredLanguage', dbType: 'TEXT', required: false, sample: 'en', description: 'Preferred language code.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2024-09-12T00:00:00Z', description: 'When created.' }
      ]
    },
    {
      idHint: 'visit',
      name: 'Visit / Encounter',
      description: 'A scheduled or completed clinical encounter.',
      ownerActorIdHints: ['clinician', 'practice-manager'],
      riskTypes: ['privacy', 'compliance'],
      fields: [
        { name: 'visitId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'visit-2026-05-02-mrn-484823-001', description: 'Stable visit id.' },
        { name: 'patientMrn', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'patient-record', fieldName: 'mrn', onDelete: 'RESTRICT' }, pii: true, sample: 'MRN-484823', description: 'Patient.' },
        { name: 'providerActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-clinician-01', description: 'Assigned provider.' },
        { name: 'visitType', dbType: 'ENUM', required: true, enumValues: ['new-patient', 'follow-up', 'urgent', 'telehealth'], defaultValue: 'follow-up', sample: 'follow-up', description: 'Visit kind.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['scheduled', 'checked-in', 'roomed', 'completed', 'no-show', 'cancelled'], defaultValue: 'scheduled', indexed: true, sample: 'scheduled', description: 'Visit lifecycle state.' },
        { name: 'startsAt', dbType: 'TIMESTAMPTZ', required: true, indexed: true, sample: '2026-05-02T15:00:00Z', description: 'Scheduled start.' },
        { name: 'consentRecorded', dbType: 'BOOLEAN', required: true, defaultValue: 'false', sample: true, description: 'Whether informed consent was captured for this visit.' }
      ]
    },
    {
      idHint: 'clinical-note',
      name: 'Clinical Note',
      description: 'Provider documentation for a visit.',
      ownerActorIdHints: ['clinician'],
      riskTypes: ['privacy', 'compliance'],
      fields: [
        { name: 'noteId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'note-2026-05-02-001', description: 'Stable note id.' },
        { name: 'visitId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'visit', fieldName: 'visitId', onDelete: 'CASCADE' }, sample: 'visit-2026-05-02-mrn-484823-001', description: 'Visit being documented.' },
        { name: 'authorActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-clinician-01', description: 'Author.' },
        { name: 'subjective', dbType: 'TEXT', required: false, pii: true, sensitive: true, sample: 'Patient reports a 4-day cough, productive at night.', description: 'Subjective section.' },
        { name: 'assessment', dbType: 'TEXT', required: false, pii: true, sensitive: true, sample: 'Likely viral URI. No red flags.', description: 'Assessment section.' },
        { name: 'plan', dbType: 'TEXT', required: false, pii: true, sensitive: true, sample: 'Supportive care; reassess in 7 days if persistent.', description: 'Plan section.' },
        { name: 'isLocked', dbType: 'BOOLEAN', required: true, defaultValue: 'false', sample: false, description: 'Locked when signed; further edits append addenda.' },
        { name: 'signedAt', dbType: 'TIMESTAMPTZ', required: false, sample: '2026-05-02T15:42:00Z', description: 'When the author signed.' }
      ]
    },
    {
      idHint: 'audit-log',
      name: 'PHI Access Audit',
      description: 'Append-only record of who read or modified PHI.',
      ownerActorIdHints: ['practice-manager'],
      riskTypes: ['compliance', 'privacy'],
      fields: [
        { name: 'auditId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'audit-2026-05-02-15-04-12-001', description: 'Audit row id.' },
        { name: 'actorMemberId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-clinician-01', description: 'Who acted.' },
        { name: 'recordRef', dbType: 'TEXT', required: true, indexed: true, sample: 'visit:visit-2026-05-02-mrn-484823-001', description: 'What they touched.' },
        { name: 'action', dbType: 'ENUM', required: true, enumValues: ['view', 'create', 'update', 'sign', 'addendum'], sample: 'view', description: 'What action.' },
        { name: 'recordedAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', indexed: true, sample: '2026-05-02T15:04:12Z', description: 'When.' }
      ]
    }
  ],
  workflowArchetypes: [
    {
      idHint: 'patient-visit',
      name: 'Patient visit (intake → documentation)',
      primaryActorIdHint: 'clinician',
      secondaryActorIdHints: ['medical-assistant', 'patient'],
      acceptancePattern: 'Given a scheduled visit, when the patient checks in, the MA captures vitals, the clinician documents and signs the note within 24 hours, then the visit is marked completed and the audit log shows every PHI access by authorized roles only.',
      steps: [
        { actorIdHint: 'patient', action: 'Check in for scheduled visit', systemResponse: 'Visit status → checked-in; consent recorded if not yet on file.', branchOn: 'Consent missing → block until captured' },
        { actorIdHint: 'medical-assistant', action: 'Room the patient and record vitals', systemResponse: 'Persist vitals; visit status → roomed.' },
        { actorIdHint: 'clinician', action: 'Open visit and review history', systemResponse: 'Surface last visit summary, allergies, current meds; emit audit-log read entry.' },
        { actorIdHint: 'clinician', action: 'Document subjective / assessment / plan', systemResponse: 'Persist clinical note draft; auto-save every change.' },
        { actorIdHint: 'clinician', action: 'Sign and lock the note', systemResponse: 'Clinical note isLocked=true; visit status → completed; audit-log sign entry.', branchOn: 'After lock: edits become addenda only' }
      ],
      failureModes: [
        { trigger: 'Clinician accesses a chart for a patient not on their panel', effect: 'Possible HIPAA violation: unauthorized PHI access', mitigation: 'Enforce role-based panel restriction at API layer; raise alert + audit on cross-panel access; require break-glass justification to proceed.' },
        { trigger: 'Note still unsigned 24 hours after visit', effect: 'Compliance risk + billing delay', mitigation: 'Daily reminder to clinician; manager dashboard flags overdue notes.' }
      ]
    },
    {
      idHint: 'no-show-recovery',
      name: 'No-show recovery',
      primaryActorIdHint: 'practice-manager',
      secondaryActorIdHints: ['patient', 'medical-assistant'],
      acceptancePattern: 'Given a visit marked no-show, when the manager triggers recovery, then the patient is offered re-booking options within 24 hours and the audit log captures the outreach.',
      steps: [
        { actorIdHint: 'medical-assistant', action: 'Mark visit no-show after grace period', systemResponse: 'Visit status → no-show; surface to manager queue.' },
        { actorIdHint: 'practice-manager', action: 'Open the no-show queue and pick a patient', systemResponse: 'Show last contact attempts and visit history.' },
        { actorIdHint: 'practice-manager', action: 'Send re-booking outreach via preferred channel', systemResponse: 'Persist outreach record; audit-log communication.' },
        { actorIdHint: 'patient', action: 'Reschedule via the link or response', systemResponse: 'Create a new Visit; original remains no-show in history.' }
      ],
      failureModes: [
        { trigger: 'Patient changed phone number and outreach silently fails', effect: 'No-show pattern continues uncaught', mitigation: 'Track outreach delivery status; flag chronic no-show pattern after 3 failed reaches.' },
        { trigger: 'Outreach text contains PHI in plain text', effect: 'Possible HIPAA violation', mitigation: 'Templates restrict to non-PHI ("you missed an appointment") with a secure link to details.' }
      ]
    }
  ]
};
