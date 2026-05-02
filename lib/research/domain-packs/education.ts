import type { DomainPack } from './types';

export const education: DomainPack = {
  id: 'education',
  name: 'Education / Tutoring / Schools',
  matchKeywords: ['school', 'student', 'class', 'tutor', 'tutoring', 'teacher', 'lesson', 'attendance', 'club', 'study group', 'enrollment', 'language', 'after-school', 'pto', 'parent-teacher', 'matchboard', 'transcript'],
  matchAudience: ['student', 'teacher', 'tutor', 'instructor', 'parent', 'school admin', 'club lead'],
  industryName: 'K-12 / tutoring / extracurricular education',
  industryTerminology: ['student', 'roster', 'attendance', 'instructor', 'enrollment', 'session', 'progress note', 'guardian', 'curriculum'],
  regulatoryHints: ['FERPA (student records)', 'COPPA (under-13 students)'],
  successMetricSeeds: [
    { metric: 'Roster filled before first session', target: '100% of classes', cadence: 'D1' },
    { metric: 'Attendance recorded same day', target: '≥95%', cadence: 'D7' },
    { metric: 'Parent visibility on student progress', target: '≥80% parents view weekly', cadence: 'D30' }
  ],
  competingAlternatives: [
    { name: 'Paper roster + spreadsheet', whyInsufficient: 'No history per student; FERPA-questionable file-sharing.' },
    { name: 'School-wide LMS (Canvas, PowerSchool)', whyInsufficient: 'Heavy IT dependency; tutoring/club use is overkill.' }
  ],
  ideaCritiqueSeeds: [
    { weakSpot: 'Student data is FERPA-regulated; overly open visibility creates compliance risk.', mitigation: 'Default visibility: students see own records, instructors see assigned roster, parents see only own student\'s data.' }
  ],
  actorArchetypes: [
    {
      idHint: 'instructor',
      name: 'Instructor / Tutor',
      type: 'primary-user',
      responsibilities: ['Manage class roster', 'Record attendance and progress notes per session', 'Communicate with parents about student progress'],
      visibility: ['Assigned roster', 'Own session records', 'Parent contact for own students'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When a class session ends', motivation: 'I want to record attendance and progress notes in under 2 minutes', expectedOutcome: 'So that parents see today\'s update and I don\'t pile up paperwork', currentWorkaround: 'Notebook on my desk that nobody else reads', hireForCriteria: ['Same-day attendance entry rate ≥95%', 'Notes attached to specific student records', 'Parent visibility opt-in per student'] }
      ],
      personaPainPoints: ['Paper rosters get misplaced', 'No-shows aren\'t tracked across weeks'],
      personaMotivations: ['Show parents real progress', 'Spot students falling behind early']
    },
    {
      idHint: 'student',
      name: 'Student',
      type: 'primary-user',
      responsibilities: ['Check in to scheduled sessions', 'See own attendance and progress notes (where age-appropriate)'],
      visibility: ['Own attendance and notes', 'Schedule for enrolled classes'],
      authMode: 'magic-link',
      jtbdSeeds: [
        { situation: 'When I want to know what class I have next', motivation: 'I want a simple schedule view', expectedOutcome: 'So that I show up on time and ready', currentWorkaround: 'Asking my parent or the front desk', hireForCriteria: ['Mobile schedule view', 'Notification 30 min before session'] }
      ]
    },
    {
      idHint: 'parent',
      name: 'Parent / Guardian',
      type: 'external',
      responsibilities: ['See own student\'s attendance and notes', 'Update contact info', 'Excuse absences'],
      visibility: ['Own student\'s records only'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When I want to know how my kid is doing in tutoring', motivation: 'I want to see attendance and recent progress notes without emailing', expectedOutcome: 'So that I can support what they need without nagging the tutor', currentWorkaround: 'Email and waiting for a reply', hireForCriteria: ['Per-student weekly summary', 'Notification when notes posted'] }
      ]
    },
    {
      idHint: 'admin',
      name: 'School / Program Admin',
      type: 'reviewer',
      responsibilities: ['Manage classes, instructors, and enrollment', 'Audit FERPA-compliant access', 'Set program-wide visibility rules'],
      visibility: ['All classes and rosters', 'Audit log of who saw what', 'Aggregate attendance metrics'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When the new term starts', motivation: 'I want classes set up and rosters loaded fast', expectedOutcome: 'So that day-1 sessions run with correct enrollment', currentWorkaround: 'Manual roster sheets', hireForCriteria: ['Bulk roster import', 'Per-class instructor assignment'] }
      ]
    }
  ],
  entityArchetypes: [
    {
      idHint: 'class',
      name: 'Class',
      description: 'A scheduled offering with an instructor, roster, and recurring sessions.',
      ownerActorIdHints: ['instructor', 'admin'],
      riskTypes: ['privacy'],
      fields: [
        { name: 'classId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'cls-spanish-101-spring-2026', description: 'Stable class id.' },
        { name: 'name', dbType: 'TEXT', required: true, sample: 'Spanish 101 — Spring 2026', description: 'Class name.' },
        { name: 'instructorActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-instructor-01', description: 'Lead instructor.' },
        { name: 'capacity', dbType: 'INTEGER', required: true, defaultValue: '20', sample: 12, description: 'Maximum enrolled students.' },
        { name: 'meetingPattern', dbType: 'TEXT', required: false, sample: 'Mon/Wed 16:00-17:00', description: 'Human-readable recurrence.' },
        { name: 'isActive', dbType: 'BOOLEAN', required: true, defaultValue: 'true', sample: true, description: 'Whether enrollment is open.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-01-15T00:00:00Z', description: 'When the class was created.' }
      ]
    },
    {
      idHint: 'enrollment',
      name: 'Enrollment',
      description: 'Links a student to a class.',
      ownerActorIdHints: ['admin'],
      riskTypes: ['privacy'],
      fields: [
        { name: 'enrollmentId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'enr-spanish-101-001', description: 'Stable enrollment id.' },
        { name: 'classId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'class', fieldName: 'classId', onDelete: 'CASCADE' }, sample: 'cls-spanish-101-spring-2026', description: 'Class enrolled in.' },
        { name: 'studentActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'CASCADE' }, sample: 'mem-student-04', description: 'Student.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['active', 'withdrawn', 'completed'], defaultValue: 'active', indexed: true, sample: 'active', description: 'Enrollment state.' },
        { name: 'enrolledAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-01-20T00:00:00Z', description: 'When the student enrolled.' }
      ]
    },
    {
      idHint: 'session',
      name: 'Session',
      description: 'A specific class meeting on a date.',
      ownerActorIdHints: ['instructor'],
      riskTypes: ['privacy'],
      fields: [
        { name: 'sessionId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'ses-spanish-101-2026-05-02', description: 'Stable session id.' },
        { name: 'classId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'class', fieldName: 'classId', onDelete: 'CASCADE' }, sample: 'cls-spanish-101-spring-2026', description: 'Parent class.' },
        { name: 'startsAt', dbType: 'TIMESTAMPTZ', required: true, indexed: true, sample: '2026-05-02T16:00:00Z', description: 'Session start.' },
        { name: 'endsAt', dbType: 'TIMESTAMPTZ', required: true, sample: '2026-05-02T17:00:00Z', description: 'Session end.' }
      ]
    },
    {
      idHint: 'attendance-record',
      name: 'Attendance Record',
      description: 'Per-student attendance for one session, plus optional progress note.',
      ownerActorIdHints: ['instructor'],
      riskTypes: ['privacy'],
      fields: [
        { name: 'attendanceId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'att-2026-05-02-001', description: 'Stable attendance id.' },
        { name: 'sessionId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'session', fieldName: 'sessionId', onDelete: 'CASCADE' }, sample: 'ses-spanish-101-2026-05-02', description: 'Session.' },
        { name: 'studentActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'CASCADE' }, sample: 'mem-student-04', description: 'Student.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['present', 'absent', 'excused', 'late'], defaultValue: 'absent', indexed: true, sample: 'present', description: 'Attendance state.' },
        { name: 'progressNote', dbType: 'TEXT', required: false, pii: true, sensitive: true, sample: 'Strong on present-tense; needs more practice with stem-changing verbs.', description: 'Instructor note (FERPA-protected).' },
        { name: 'recordedAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-05-02T17:01:30Z', description: 'When recorded.' }
      ]
    }
  ],
  workflowArchetypes: [
    {
      idHint: 'session-attendance',
      name: 'Record session attendance and progress notes',
      primaryActorIdHint: 'instructor',
      secondaryActorIdHints: ['parent'],
      acceptancePattern: 'Given an instructor finishing a class session, when they mark attendance per student and add a progress note, then the parent of each student sees the update for their child only and the audit log shows who recorded it.',
      steps: [
        { actorIdHint: 'instructor', action: 'Open today\'s session for the class', systemResponse: 'Show roster pre-loaded with default status=absent.' },
        { actorIdHint: 'instructor', action: 'Mark each student present / late / excused', systemResponse: 'Persist AttendanceRecord rows; default of absent stays where untouched.' },
        { actorIdHint: 'instructor', action: 'Add an optional progress note per student', systemResponse: 'Persist progressNote scoped to the parent of that student.' },
        { actorIdHint: 'instructor', action: 'Submit the attendance batch', systemResponse: 'Notify parents according to per-class visibility rules; lock the session for instructor edits after 24h.', branchOn: 'Within 24h: edit allowed; after: admin override only' }
      ],
      failureModes: [
        { trigger: 'Instructor accidentally writes progress note about Student A in Student B\'s record', effect: 'FERPA violation: Student B\'s parent sees data about Student A', mitigation: 'Inline confirmation step shows the named student before save; audit log captures every read for incident response.' },
        { trigger: 'Power loss before submit', effect: 'Attendance lost, instructor has to re-do', mitigation: 'Auto-save per row; restore on reload with "draft" badge.' }
      ]
    },
    {
      idHint: 'enrollment-management',
      name: 'Enrollment management',
      primaryActorIdHint: 'admin',
      secondaryActorIdHints: ['instructor', 'parent'],
      acceptancePattern: 'Given a new term opening, when admin imports a roster and assigns instructors, then enrolled students appear on the right rosters and parents can confirm enrollment with FERPA-correct visibility.',
      steps: [
        { actorIdHint: 'admin', action: 'Create classes for the term and assign instructors', systemResponse: 'Persist Class records with capacity and instructor.' },
        { actorIdHint: 'admin', action: 'Bulk-import students and link to classes', systemResponse: 'Create Enrollment rows with status=active.' },
        { actorIdHint: 'parent', action: 'Confirm or update student contact info', systemResponse: 'Update parent record; audit-log the change.' },
        { actorIdHint: 'instructor', action: 'Open assigned roster the day before first session', systemResponse: 'Show full roster with parent contact info and any existing notes.' }
      ],
      failureModes: [
        { trigger: 'Bulk import has duplicate student rows', effect: 'Same student enrolled twice; attendance double-counted', mitigation: 'Dedupe on student external id at import time; surface dupes for admin to resolve before commit.' },
        { trigger: 'Instructor reassignment mid-term', effect: 'New instructor lacks history', mitigation: 'Carry over progress notes via reassignment; notify parents of change.' }
      ]
    }
  ]
};
