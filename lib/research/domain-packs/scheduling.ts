import type { DomainPack } from './types';

export const scheduling: DomainPack = {
  id: 'scheduling',
  name: 'Scheduling / Bookings',
  matchKeywords: ['booking', 'reservation', 'appointment', 'calendar', 'slot', 'schedule', 'time slot', 'meeting room', 'studio', 'class booking', 'tool booking', 'rental tracker', 'court', 'reserve'],
  matchAudience: ['booker', 'organizer', 'host', 'attendee', 'member', 'studio manager'],
  industryName: 'Resource scheduling and bookings',
  industryTerminology: ['slot', 'booking', 'capacity', 'waitlist', 'cancellation', 'no-show', 'host', 'attendee', 'resource'],
  regulatoryHints: [],
  successMetricSeeds: [
    { metric: 'Slot fill rate (booked / available)', target: '≥70%', cadence: 'D7' },
    { metric: 'No-show rate', target: '<8%', cadence: 'D30' },
    { metric: 'Time from open to first booking', target: '<2 minutes', cadence: 'leading' }
  ],
  competingAlternatives: [
    { name: 'Google Calendar shared link', whyInsufficient: 'No capacity, no waitlist, no no-show tracking; double-bookings happen.' },
    { name: 'Calendly free tier', whyInsufficient: 'No multi-resource scheduling, weak operator-side review.' }
  ],
  ideaCritiqueSeeds: [
    { weakSpot: 'Without explicit capacity rules, popular slots cause double-booking complaints.', mitigation: 'Capacity per slot is a required field at slot creation; overflow goes to waitlist not the slot.' }
  ],
  actorArchetypes: [
    {
      idHint: 'organizer',
      name: 'Schedule Organizer',
      type: 'primary-user',
      responsibilities: ['Define resources and capacity', 'Open and close slots', 'Review bookings, no-shows, and waitlist'],
      visibility: ['All resources I manage', 'All bookings on those resources', 'Waitlist for my resources'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When the next booking window opens', motivation: 'I want to publish slots fast and watch them fill', expectedOutcome: 'So that capacity is filled and no time is wasted', currentWorkaround: 'Manually emailing a Google Sheet link', hireForCriteria: ['Slot publishing in <60s', 'Live fill-rate visible', 'Waitlist surfaces overflow'] }
      ],
      personaPainPoints: ['Double-bookings via shared spreadsheets', 'No-shows clog peak slots'],
      personaMotivations: ['Fill capacity', 'Reduce admin time']
    },
    {
      idHint: 'booker',
      name: 'Booker / Member',
      type: 'primary-user',
      responsibilities: ['Browse open slots', 'Book, reschedule, or cancel', 'Get reminders before the booked time'],
      visibility: ['Public open slots', 'Own bookings', 'Own waitlist position'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When I want to reserve a popular time slot', motivation: 'I want to grab the slot before it fills, or join a waitlist', expectedOutcome: 'So that I either secure the slot or get notified the moment it frees up', currentWorkaround: 'Refreshing a Google Calendar repeatedly', hireForCriteria: ['Booking confirms in <3s', 'Waitlist promotes me automatically', 'Mobile-friendly cancel'] }
      ]
    },
    {
      idHint: 'staff',
      name: 'On-site Staff',
      type: 'operator',
      responsibilities: ['Mark check-in / no-show on the day of the booking', 'Handle walk-ins not on the schedule'],
      visibility: ['Today\'s bookings on resources I cover', 'Real-time slot status'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When the next attendee walks in', motivation: 'I want to confirm they\'re booked and check them in fast', expectedOutcome: 'So that the schedule reflects real attendance and no-shows are tracked', currentWorkaround: 'Paper roster on a clipboard', hireForCriteria: ['Tap-to-check-in on mobile', 'No-show timer auto-suggests after grace period'] }
      ]
    }
  ],
  entityArchetypes: [
    {
      idHint: 'resource',
      name: 'Resource',
      description: 'A bookable thing (room, court, instructor slot, tool) with capacity and availability rules.',
      ownerActorIdHints: ['organizer'],
      riskTypes: ['operational'],
      fields: [
        { name: 'resourceId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'res-court-a-001', description: 'Stable resource identifier.' },
        { name: 'name', dbType: 'TEXT', required: true, sample: 'Court A', description: 'Display name.' },
        { name: 'kind', dbType: 'ENUM', required: true, enumValues: ['room', 'court', 'instructor', 'tool', 'class', 'unit'], defaultValue: 'room', sample: 'court', description: 'Resource kind.' },
        { name: 'capacity', dbType: 'INTEGER', required: true, defaultValue: '1', sample: 4, description: 'Max attendees per slot.' },
        { name: 'isActive', dbType: 'BOOLEAN', required: true, defaultValue: 'true', sample: true, description: 'Whether bookings are accepted.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-04-01T10:00:00Z', description: 'When the resource was created.' }
      ]
    },
    {
      idHint: 'slot',
      name: 'Slot',
      description: 'A specific bookable time window for a resource.',
      ownerActorIdHints: ['organizer'],
      riskTypes: ['operational'],
      fields: [
        { name: 'slotId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'slot-2026-05-02-1800-court-a', description: 'Stable slot id encoding date + resource.' },
        { name: 'resourceId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'resource', fieldName: 'resourceId', onDelete: 'CASCADE' }, sample: 'res-court-a-001', description: 'Resource this slot belongs to.' },
        { name: 'startsAt', dbType: 'TIMESTAMPTZ', required: true, indexed: true, sample: '2026-05-02T18:00:00Z', description: 'Slot start.' },
        { name: 'endsAt', dbType: 'TIMESTAMPTZ', required: true, sample: '2026-05-02T19:00:00Z', description: 'Slot end.' },
        { name: 'capacityRemaining', dbType: 'INTEGER', required: true, sample: 2, description: 'How many seats are still bookable; reaches 0 when slot is full.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['open', 'full', 'closed', 'cancelled'], defaultValue: 'open', indexed: true, sample: 'open', description: 'Slot status.' }
      ]
    },
    {
      idHint: 'booking',
      name: 'Booking',
      description: 'A reservation by one booker against one slot.',
      ownerActorIdHints: ['booker'],
      riskTypes: ['operational'],
      fields: [
        { name: 'bookingId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'book-2026-05-02-1800-001', description: 'Stable booking id.' },
        { name: 'slotId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'slot', fieldName: 'slotId', onDelete: 'RESTRICT' }, sample: 'slot-2026-05-02-1800-court-a', description: 'Slot reserved.' },
        { name: 'bookerActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'CASCADE' }, sample: 'mem-booker-01', description: 'Booker who reserved.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['booked', 'checked-in', 'no-show', 'cancelled', 'waitlisted'], defaultValue: 'booked', indexed: true, sample: 'booked', description: 'Booking lifecycle state.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-05-01T09:14:00Z', description: 'When booked.' },
        { name: 'cancelledAt', dbType: 'TIMESTAMPTZ', required: false, sample: '2026-05-02T17:00:00Z', description: 'When cancelled, if applicable.' }
      ]
    },
    {
      idHint: 'waitlist-entry',
      name: 'Waitlist Entry',
      description: 'A booker holding a position on a full slot.',
      ownerActorIdHints: ['booker'],
      riskTypes: ['operational'],
      fields: [
        { name: 'waitlistId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'wait-2026-05-02-1800-001', description: 'Waitlist entry id.' },
        { name: 'slotId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'slot', fieldName: 'slotId', onDelete: 'CASCADE' }, sample: 'slot-2026-05-02-1800-court-a', description: 'Slot waitlisted on.' },
        { name: 'bookerActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'CASCADE' }, sample: 'mem-booker-02', description: 'Booker waiting.' },
        { name: 'position', dbType: 'INTEGER', required: true, sample: 2, description: 'Position in line (1-indexed).' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-05-01T09:20:00Z', description: 'When the booker joined the waitlist.' }
      ]
    }
  ],
  workflowArchetypes: [
    {
      idHint: 'open-and-fill-slots',
      name: 'Open and fill slots',
      primaryActorIdHint: 'organizer',
      secondaryActorIdHints: ['booker'],
      acceptancePattern: 'Given an organizer publishing a new week of slots, when bookers reserve, the slot capacity decrements correctly, full slots accept waitlist entries, and the organizer dashboard shows fill rate live.',
      steps: [
        { actorIdHint: 'organizer', action: 'Define a resource with capacity and operating hours', systemResponse: 'Persist resource; show "no slots open yet" state.' },
        { actorIdHint: 'organizer', action: 'Generate a week of slots from a recurring pattern', systemResponse: 'Bulk-create Slot records with status=open and capacityRemaining=capacity.' },
        { actorIdHint: 'booker', action: 'Browse open slots and reserve one', systemResponse: 'Decrement Slot.capacityRemaining; create Booking with status=booked.', branchOn: 'capacityRemaining reaches 0 → slot status flips to full' },
        { actorIdHint: 'booker', action: 'Reserve a slot already full', systemResponse: 'Create WaitlistEntry with next-available position.' },
        { actorIdHint: 'organizer', action: 'Open the live dashboard for fill rate', systemResponse: 'Show open vs full vs cancelled counts and waitlist depth.' }
      ],
      failureModes: [
        { trigger: 'Two bookers click reserve at the same instant on the last seat', effect: 'Without proper concurrency, both bookings succeed and the slot is overbooked', mitigation: 'Atomic capacityRemaining decrement with a database constraint; second booker is offered the waitlist instead.' },
        { trigger: 'Booker cancels less than 1 hour before start', effect: 'Slot goes empty and waitlist isn\'t promoted in time', mitigation: 'Promote next waitlist entry on cancel within 60s; notify; surface "promoted from waitlist" badge.' }
      ]
    },
    {
      idHint: 'check-in-and-no-show',
      name: 'Check-in and no-show handling',
      primaryActorIdHint: 'staff',
      secondaryActorIdHints: ['booker', 'organizer'],
      acceptancePattern: 'Given the day of bookings, when staff checks in attendees and the grace period passes, then no-shows are recorded and visible on the organizer dashboard.',
      steps: [
        { actorIdHint: 'staff', action: 'Open today\'s bookings for assigned resources', systemResponse: 'Show bookings sorted by start time with check-in buttons.' },
        { actorIdHint: 'staff', action: 'Tap check-in for an arriving attendee', systemResponse: 'Booking.status → checked-in; persist check-in timestamp.' },
        { actorIdHint: 'staff', action: 'Wait for grace period (default 10 min) and confirm no-show', systemResponse: 'After grace, surface "Mark no-show" affordance; on confirm Booking.status → no-show.', branchOn: 'Grace period elapsed without check-in' },
        { actorIdHint: 'organizer', action: 'Review per-resource no-show rate', systemResponse: 'Aggregate no-show counts and surface trends per booker.' }
      ],
      failureModes: [
        { trigger: 'Walk-in arrives without a booking when capacity remains', effect: 'Staff has no clean way to record attendance; revenue/usage is undercounted', mitigation: 'Allow staff to create on-the-spot booking with "walk-in" source flag.' },
        { trigger: 'Booker checked in early but the slot was reassigned', effect: 'Schedule mismatch causes double-coverage', mitigation: 'Refuse early check-in to a moved slot; surface guidance to staff.' }
      ]
    }
  ]
};
