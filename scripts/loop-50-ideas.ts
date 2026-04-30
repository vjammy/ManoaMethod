/**
 * 50 distinct product ideas spanning archetypes (CRUD, scheduling, marketplace, content,
 * analytics, communication, internal tools, etc.) used by the 50-iteration loop harness.
 *
 * Each idea is shaped to satisfy the MVP Builder ProjectInput contract (questionnaireAnswers
 * required fields differ by profile). To keep the harness simple we use beginner-business for
 * minimum required answers across all ideas.
 */
import type { ProjectInput } from '../lib/types';

type Idea = {
  slug: string;
  input: ProjectInput;
};

function buildInput(args: {
  slug: string;
  productName: string;
  productIdea: string;
  audience: string;
  problem: string;
  must: string;
  nice?: string;
  data?: string;
  risks?: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  track?: 'business' | 'technical';
}): Idea {
  const level = args.level || 'beginner';
  const track = args.track || 'business';
  const baseAnswers: Record<string, string> = {
    'north-star': `Prove that ${args.productName} can ${args.must.split(/[,.]/)[0]} reliably for ${args.audience}.`,
    'primary-workflow': `${args.audience} sets up the workspace, exercises the must-have flow (${args.must.split(/[,.]/).slice(0, 3).join(', ')}), and reviews outcomes.`,
    'scope-cut': `Keep ${args.must.split(',').slice(0, 3).join(',')}. Defer ${(args.nice || 'advanced features').split(',').slice(0, 3).join(',')}.`,
    acceptance: `A reviewer can read the package and confirm who uses ${args.productName}, what the must-have flow does, and what evidence proves a phase ready.`,
    'operating-risks': args.risks || `Risks: ${args.problem}; weak gates; thin evidence.`,
    'customer-pain': args.problem,
    'business-proof': `Adoption proof: ${args.audience} completes the must-have flow without external chat support.`
  };
  if (track === 'technical') {
    baseAnswers['data-boundaries'] = args.data || `Data boundaries: domain entities for ${args.productName} with role-based visibility.`;
    baseAnswers['failure-modes'] = `Failure modes: weak validation, missing role boundaries, fragile background jobs.`;
    baseAnswers['test-proof'] = `Tests must cover the happy path, the negative path, and at least one role-based edge case for ${args.productName}.`;
    baseAnswers['deployment-guardrails'] = `Local-first build, mocked external services in early phases, no auth/payments until later phases.`;
  }
  return {
    slug: args.slug,
    input: {
      productName: args.productName,
      level,
      track,
      productIdea: args.productIdea,
      targetAudience: args.audience,
      problemStatement: args.problem,
      constraints: 'Keep v1 mobile-friendly, local-first, simple roles, no payments in v1.',
      desiredOutput: 'A build-ready markdown workspace with phased planning, gates, verification files, and test scripts.',
      mustHaveFeatures: args.must,
      niceToHaveFeatures: args.nice || 'reporting, exports, advanced filters, calendar integrations',
      dataAndIntegrations: args.data || `${args.productName} accounts, primary entities, audit log, optional email notifications.`,
      risks: args.risks || `Risk: weak role boundaries, vague metrics, mobile usability gaps.`,
      successMetrics: `A reviewer can confirm the must-have flow works end-to-end and that planning artifacts trace requirements to phases.`,
      nonGoals: 'No payments, no AI features, no native mobile app, no real-time collaboration in v1.',
      timeline: 'Validate the core workflow in v1 before adding richer features.',
      teamContext: 'A product owner uses MVP Builder to plan and hands off to Codex / Claude Code / OpenCode.',
      questionnaireAnswers: baseAnswers
    }
  };
}

export const ideas: Idea[] = [
  buildInput({
    slug: 'family-tasks',
    productName: 'Family Task Board',
    productIdea: 'A mobile-friendly web app helping families assign and review household chores.',
    audience: 'Parents, co-parents, children, and caregivers.',
    problem: 'Families lose track of chores via group chats and sticky notes.',
    must: 'Family workspace setup, parent and kid roles, task creation, assignment, due dates, status, parent dashboard, kid dashboard, mobile layout, basic reminders.',
    nice: 'Recurring chores, reward tracking, calendar view'
  }),
  buildInput({
    slug: 'small-clinic-scheduler',
    productName: 'Small Clinic Scheduler',
    productIdea: 'A scheduling tool for small clinics to manage appointments and patient flow.',
    audience: 'Clinic front desk, doctors, nurses, and patients.',
    problem: 'Small clinics rely on phone calls and paper calendars, missing slots and double-booking.',
    must: 'Provider profiles, time slot config, appointment booking, patient records, daily schedule view, reminders.',
    nice: 'Recurring appointments, waitlists, no-show tracking',
    track: 'technical'
  }),
  buildInput({
    slug: 'restaurant-ordering',
    productName: 'Local Restaurant Ordering',
    productIdea: 'A QR-code ordering web app for small restaurants without delivery integrations.',
    audience: 'Diners, servers, and restaurant managers.',
    problem: 'Servers waste time on order entry and menu changes are error-prone.',
    must: 'Menu management, table-based QR, order intake, kitchen view, order status, daily totals.',
    nice: 'Modifiers, allergens, table reservations'
  }),
  buildInput({
    slug: 'school-club-portal',
    productName: 'School Club Portal',
    productIdea: 'A portal for K-12 clubs to publish meetings, track attendance, and share resources.',
    audience: 'Club advisors, student officers, and parents.',
    problem: 'Club info is scattered across email and printed flyers.',
    must: 'Club profiles, meeting calendar, attendance, announcements, parent view.',
    nice: 'Permission slip flow, photo gallery, alumni list'
  }),
  buildInput({
    slug: 'household-budget',
    productName: 'Household Budget Planner',
    productIdea: 'A simple budget planner for couples and shared households.',
    audience: 'Adults sharing a household budget.',
    problem: 'Couples lose visibility into shared expenses across cards and accounts.',
    must: 'Budget categories, monthly limits, expense entry, dashboard, shared view.',
    nice: 'Receipt photos, recurring expenses, savings goals'
  }),
  buildInput({
    slug: 'hoa-portal',
    productName: 'HOA Maintenance Portal',
    productIdea: 'A portal for HOA members to submit and track maintenance requests.',
    audience: 'HOA residents, board members, and contractors.',
    problem: 'Maintenance requests get lost in email threads.',
    must: 'Request submission, status tracking, photo upload, contractor assignment, board dashboard.',
    nice: 'SLA timers, payment tracking, public bulletins'
  }),
  buildInput({
    slug: 'volunteer-manager',
    productName: 'Event Volunteer Manager',
    productIdea: 'A scheduler for community events that need volunteer shifts.',
    audience: 'Volunteer coordinators and the volunteers themselves.',
    problem: 'Coordinators rely on spreadsheets and missed-shift confusion.',
    must: 'Event creation, shift slots, volunteer signup, role tags, shift confirmation, coordinator dashboard.',
    nice: 'Auto reminders, hour tracking, certificate generation'
  }),
  buildInput({
    slug: 'inventory-small-biz',
    productName: 'Small Business Inventory',
    productIdea: 'An inventory tracking app for small product businesses.',
    audience: 'Small business owners and store staff.',
    problem: 'Owners run out of stock without realizing it because tracking is on paper.',
    must: 'Product catalog, stock counts, low-stock alerts, restock log, simple reporting.',
    nice: 'Barcode scanning, supplier list, multi-location',
    track: 'technical'
  }),
  buildInput({
    slug: 'sdr-sales-module',
    productName: 'SDR Sales Module',
    productIdea: 'A lightweight CRM module for outbound sales reps tracking accounts and follow-ups.',
    audience: 'Sales development reps and their managers.',
    problem: 'Reps lose track of follow-ups and managers have no visibility into pipeline activity.',
    must: 'Account list, contact log, follow-up reminders, pipeline stages, manager dashboard.',
    nice: 'Email templates, call notes, KPI charts'
  }),
  buildInput({
    slug: 'privvy-family-readiness',
    productName: 'Privvy Family Readiness',
    productIdea: 'A private family readiness checklist for emergency preparedness.',
    audience: 'Heads of household and immediate family members.',
    problem: 'Families discuss readiness but never finish a written plan.',
    must: 'Household profile, readiness checklist, contact list, document vault metadata, completion tracking.',
    nice: 'Drill scheduling, regional alerts, kid-friendly view'
  }),
  buildInput({
    slug: 'pto-tracker',
    productName: 'PTO Tracker',
    productIdea: 'A small-team paid-time-off tracker for managers and employees.',
    audience: 'Small-business managers and employees.',
    problem: 'PTO is tracked in spreadsheets that nobody trusts.',
    must: 'Employee profiles, PTO balance, request workflow, manager approval, calendar view.',
    nice: 'Holiday calendar, accrual rules, export to payroll'
  }),
  buildInput({
    slug: 'gym-class-booking',
    productName: 'Gym Class Booking',
    productIdea: 'A class booking app for small fitness studios.',
    audience: 'Studio owners, instructors, and members.',
    problem: 'Members no-show and instructors struggle with class capacity.',
    must: 'Class schedule, member booking, capacity limits, waitlist, instructor view.',
    nice: 'Membership packs, attendance trends, walk-in tracking'
  }),
  buildInput({
    slug: 'tutor-matchboard',
    productName: 'Tutor Matchboard',
    productIdea: 'A simple board where parents post tutoring requests and tutors respond.',
    audience: 'Parents, tutors, and a small admin team.',
    problem: 'Parents repost requests across forums with no shared status.',
    must: 'Request listings, tutor profiles, response thread, status tracking, admin moderation.',
    nice: 'Verified tutor badge, rating, scheduling integration'
  }),
  buildInput({
    slug: 'shared-grocery-list',
    productName: 'Shared Grocery List',
    productIdea: 'A real-time shared grocery list app for households.',
    audience: 'Members of a shared household.',
    problem: 'Lists fragment across notes apps; people buy duplicates.',
    must: 'Single shared list, item add/edit/delete, check-off, recent items, mobile UI.',
    nice: 'Recurring staples, store sections, multiple lists'
  }),
  buildInput({
    slug: 'pet-care-tracker',
    productName: 'Pet Care Tracker',
    productIdea: 'A small app to track pet feeding, walks, and vet appointments across family members.',
    audience: 'Multi-person households with pets.',
    problem: 'Pet care tasks are forgotten because nobody knows who did what.',
    must: 'Pet profiles, daily care log, walk schedule, vet appointment list, family view.',
    nice: 'Reminders, weight chart, multi-pet view'
  }),
  buildInput({
    slug: 'church-volunteers',
    productName: 'Church Volunteer Roster',
    productIdea: 'A roster manager for weekly church volunteer assignments.',
    audience: 'Volunteer coordinators, ministry leaders, and members.',
    problem: 'Roster lives in spreadsheets that get out of sync each week.',
    must: 'Role list, weekly slots, member signup, swap requests, leader dashboard.',
    nice: 'Email reminders, attendance tracking, recurring roles'
  }),
  buildInput({
    slug: 'micro-loan-tracker',
    productName: 'Community Loan Ledger',
    productIdea: 'A non-financial-advice ledger for community lending circles to record loans and repayments.',
    audience: 'Lending circle members and the circle administrator.',
    problem: 'Circles use paper ledgers that lose history.',
    must: 'Member list, loan record, repayment log, balance view, admin dashboard.',
    nice: 'Reminders, contribution rules, export to PDF'
  }),
  buildInput({
    slug: 'maker-shop-bookings',
    productName: 'Makerspace Tool Bookings',
    productIdea: 'A booking tool for makerspaces to manage shared equipment.',
    audience: 'Makerspace members and stewards.',
    problem: 'Members collide on tool usage with no shared schedule.',
    must: 'Tool inventory, time-slot booking, member profiles, admin override, daily schedule.',
    nice: 'Certifications, maintenance log, late-return tracking',
    track: 'technical'
  }),
  buildInput({
    slug: 'community-garden',
    productName: 'Community Garden Plot Manager',
    productIdea: 'A plot manager for community gardens.',
    audience: 'Garden coordinators and plot tenants.',
    problem: 'Plot assignments and waitlists live in messy spreadsheets.',
    must: 'Plot map, tenant assignments, waitlist, work-day signup, coordinator dashboard.',
    nice: 'Watering schedule, harvest log, dues tracking'
  }),
  buildInput({
    slug: 'reading-club',
    productName: 'Reading Club Hub',
    productIdea: 'A hub for book clubs to schedule meetings, track current reads, and capture discussion notes.',
    audience: 'Book club organizers and members.',
    problem: 'Clubs lose track of past reads and meeting notes.',
    must: 'Club profile, member list, meeting schedule, current read, notes capture.',
    nice: 'Voting on next read, ratings, archive view'
  }),
  buildInput({
    slug: 'tutoring-attendance',
    productName: 'After-School Attendance',
    productIdea: 'A daily attendance app for after-school programs.',
    audience: 'Program staff, parents, and admins.',
    problem: 'Paper attendance is hard to audit and parents are not notified of pickups.',
    must: 'Student profiles, daily attendance, pickup log, parent-visible view, staff dashboard.',
    nice: 'SMS notifications, late pickup alerts, export to PDF'
  }),
  buildInput({
    slug: 'food-pantry-intake',
    productName: 'Food Pantry Intake',
    productIdea: 'An intake and distribution tracker for community food pantries.',
    audience: 'Pantry volunteers and recipients.',
    problem: 'Pantries log distributions on paper and cannot report easily to funders.',
    must: 'Recipient profile, intake form, distribution log, monthly summary, volunteer view.',
    nice: 'Multi-language UI, household tracking, allergen flags'
  }),
  buildInput({
    slug: 'remote-standup',
    productName: 'Remote Standup Helper',
    productIdea: 'A lightweight async standup tool for small remote teams.',
    audience: 'Remote engineering teams and managers.',
    problem: 'Standups eat time zones; written updates fragment across Slack and Notion.',
    must: 'Team workspace, daily prompt, written entries, blocker flag, manager digest.',
    nice: 'Slack integration, mood tracking, sprint summary',
    track: 'technical'
  }),
  buildInput({
    slug: 'expense-claims',
    productName: 'Mini Expense Claims',
    productIdea: 'A mini expense-claim tool for small companies.',
    audience: 'Employees and finance approvers.',
    problem: 'Receipts are emailed and lost; finance does manual entry.',
    must: 'Claim submission, receipt upload metadata, approval flow, claim history, finance dashboard.',
    nice: 'Reimbursement export, project tagging, multi-currency'
  }),
  buildInput({
    slug: 'tutoring-sessions',
    productName: 'Tutor Session Notes',
    productIdea: 'A session-notes tool for tutors to track student progress and homework.',
    audience: 'Tutors, students, and parents.',
    problem: 'Notes live in paper notebooks parents never see.',
    must: 'Student profile, session log, homework assignment, parent-visible summary, tutor dashboard.',
    nice: 'Goals tracking, attachment metadata, multi-tutor support'
  }),
  buildInput({
    slug: 'small-warehouse-picking',
    productName: 'Small Warehouse Picking',
    productIdea: 'A picking-list app for small warehouses fulfilling online orders.',
    audience: 'Warehouse staff and supervisors.',
    problem: 'Pickers print lists that go stale.',
    must: 'Order import (mock), picking list, item check-off, supervisor dashboard, daily summary.',
    nice: 'Bin map, exception tracking, KPI dashboard',
    track: 'technical'
  }),
  buildInput({
    slug: 'home-services-quotes',
    productName: 'Home Services Quotes',
    productIdea: 'A quote and follow-up tracker for solo home-services contractors.',
    audience: 'Contractors and homeowners.',
    problem: 'Quotes get lost between calls and emails.',
    must: 'Lead capture, quote draft, follow-up reminders, status, homeowner view.',
    nice: 'PDF export, deposit tracking, calendar invites'
  }),
  buildInput({
    slug: 'study-group-planner',
    productName: 'Study Group Planner',
    productIdea: 'A planner for college study groups to schedule sessions and share materials.',
    audience: 'College students.',
    problem: 'Study groups fall apart from scheduling friction.',
    must: 'Group profile, session schedule, materials list, attendance, group chat metadata.',
    nice: 'Course tagging, exam countdown, recurring sessions'
  }),
  buildInput({
    slug: 'small-rental-tracker',
    productName: 'Small Rental Tracker',
    productIdea: 'A rental income tracker for small-portfolio landlords.',
    audience: 'Independent landlords.',
    problem: 'Landlords use spreadsheets to track rent and forget late payments.',
    must: 'Property list, tenant profiles, rent ledger, late flags, monthly summary.',
    nice: 'Lease document metadata, expense entry, owner dashboard'
  }),
  buildInput({
    slug: 'helpdesk-internal',
    productName: 'Internal Helpdesk',
    productIdea: 'A small internal helpdesk for HR and IT requests.',
    audience: 'Employees and helpdesk agents.',
    problem: 'Requests scatter across email and chat with no SLA tracking.',
    must: 'Ticket submission, queue view, agent assignment, status, SLA timer, employee dashboard.',
    nice: 'Knowledge base linking, satisfaction survey, escalation path',
    track: 'technical'
  }),
  buildInput({
    slug: 'car-pool-coordination',
    productName: 'Carpool Coordinator',
    productIdea: 'A weekly carpool planner for school families.',
    audience: 'Parents, school admins.',
    problem: 'Carpool plans live in chats and break each week.',
    must: 'Family list, weekly plan, swap request, confirmation, admin dashboard.',
    nice: 'Notification reminders, conflict detection, multi-school'
  }),
  buildInput({
    slug: 'pet-rescue-intake',
    productName: 'Pet Rescue Intake',
    productIdea: 'An intake tool for small pet rescue organizations.',
    audience: 'Rescue volunteers and adoption coordinators.',
    problem: 'Animal records live in paper folders and Excel.',
    must: 'Animal profile, intake log, foster assignment, status, adoption record.',
    nice: 'Vaccination log, photo metadata, public adoptable view'
  }),
  buildInput({
    slug: 'small-band-bookings',
    productName: 'Small Band Bookings',
    productIdea: 'A booking tool for small live music bands.',
    audience: 'Band managers and venue contacts.',
    problem: 'Bookings are tracked in DM threads.',
    must: 'Venue list, booking inquiries, contract draft notes, calendar view, manager dashboard.',
    nice: 'Setlist library, payout log, mailing list metadata'
  }),
  buildInput({
    slug: 'farmers-market-vendors',
    productName: 'Farmers Market Vendors',
    productIdea: 'A vendor signup and roster tool for weekend farmers markets.',
    audience: 'Market managers and vendors.',
    problem: 'Vendor signup is paper-based and chaotic.',
    must: 'Vendor profile, weekly signup, booth assignment, payment status, manager dashboard.',
    nice: 'Public vendor map, sales log entry, sponsorship tracking'
  }),
  buildInput({
    slug: 'art-class-bookings',
    productName: 'Art Class Bookings',
    productIdea: 'A class booking tool for community art instructors.',
    audience: 'Instructors and students.',
    problem: 'Instructors juggle bookings across email.',
    must: 'Class catalog, schedule, student booking, capacity, instructor dashboard.',
    nice: 'Materials list, prereq flag, recurring classes'
  }),
  buildInput({
    slug: 'kids-allowance',
    productName: 'Kids Allowance Tracker',
    productIdea: 'A kid allowance tracker tying chores to allowance.',
    audience: 'Parents and kids.',
    problem: 'Allowance and chores get tracked in two places.',
    must: 'Kid profile, chore catalog, completion log, allowance ledger, parent dashboard.',
    nice: 'Saving goals, custom reward types, weekly summary'
  }),
  buildInput({
    slug: 'wedding-rsvp',
    productName: 'Wedding RSVP Hub',
    productIdea: 'A simple RSVP and guest list tool for couples planning a small wedding.',
    audience: 'Couples and their planners.',
    problem: 'RSVP tracking via email is messy.',
    must: 'Guest list, RSVP form, meal preferences, plus-one tracking, host dashboard.',
    nice: 'Seating planner, dietary export, table cards'
  }),
  buildInput({
    slug: 'fitness-coach-clients',
    productName: 'Fitness Coach Clients',
    productIdea: 'A client tracker for solo fitness coaches.',
    audience: 'Coaches and clients.',
    problem: 'Coaches juggle client plans across spreadsheets.',
    must: 'Client profile, weekly plan, check-in log, progress notes, coach dashboard.',
    nice: 'Plan templates, progress chart, message log'
  }),
  buildInput({
    slug: 'language-tutor-tracker',
    productName: 'Language Tutor Tracker',
    productIdea: 'A vocab and lesson tracker for language tutors.',
    audience: 'Language tutors and students.',
    problem: 'Tutors track vocab in notebooks; students lose context.',
    must: 'Student profile, lesson log, vocab list, homework status, tutor dashboard.',
    nice: 'Spaced-repetition, audio metadata, progress milestones'
  }),
  buildInput({
    slug: 'food-truck-day',
    productName: 'Food Truck Day Plan',
    productIdea: 'A day-of operations plan for food trucks.',
    audience: 'Food truck owners and helpers.',
    problem: 'Owners juggle stops, prep lists, and supplies in head.',
    must: 'Daily schedule, location list, prep checklist, supply restock log, owner dashboard.',
    nice: 'Sales entry, weather note, recurring stops'
  }),
  buildInput({
    slug: 'after-school-clubs',
    productName: 'After-School Clubs Catalog',
    productIdea: 'A school-side catalog of after-school clubs with parent registration.',
    audience: 'School coordinators, club leaders, parents.',
    problem: 'Clubs are advertised on paper flyers; signup is messy.',
    must: 'Club catalog, signup form, capacity tracking, parent contacts, coordinator dashboard.',
    nice: 'Waitlists, emergency contacts, attendance import'
  }),
  buildInput({
    slug: 'sports-league-scheduler',
    productName: 'Sports League Scheduler',
    productIdea: 'A small youth sports league scheduler.',
    audience: 'League admin, coaches, parents.',
    problem: 'Schedules change weekly and parents miss updates.',
    must: 'Team list, weekly schedule, score entry, coach view, parent view.',
    nice: 'Standings, field map, weather cancellations'
  }),
  buildInput({
    slug: 'condo-board-portal',
    productName: 'Condo Board Portal',
    productIdea: 'A small portal for condo boards to track motions and document votes.',
    audience: 'Board members and residents.',
    problem: 'Board minutes live in scattered docs.',
    must: 'Motion list, vote tracking, minutes draft, document metadata, member view.',
    nice: 'Resident comments, document indexing, calendar of meetings',
    track: 'technical'
  }),
  buildInput({
    slug: 'micro-podcast-planner',
    productName: 'Micro Podcast Planner',
    productIdea: 'A planner for small podcasts to track episodes and guests.',
    audience: 'Podcast hosts and producers.',
    problem: 'Episode prep notes are scattered across docs.',
    must: 'Episode list, guest log, prep checklist, recording status, publish queue.',
    nice: 'Show notes templates, sponsor tracking, asset metadata'
  }),
  buildInput({
    slug: 'mentorship-program',
    productName: 'Mentorship Program Tracker',
    productIdea: 'A mentor-mentee match tracker for small mentorship programs.',
    audience: 'Program admins, mentors, mentees.',
    problem: 'Matches drift; check-ins are forgotten.',
    must: 'Mentor and mentee profiles, match assignment, check-in log, admin dashboard.',
    nice: 'Goal tracking, anonymous feedback, milestone celebrations'
  }),
  buildInput({
    slug: 'community-class-pass',
    productName: 'Community Class Pass',
    productIdea: 'A small class-pass tool letting members redeem credits across local studios.',
    audience: 'Studios and members.',
    problem: 'Tracking credits across studios is informal.',
    must: 'Studio list, member credit ledger, redemption log, studio dashboard, member view.',
    nice: 'Refund flow, expiration rules, monthly settlement'
  }),
  buildInput({
    slug: 'small-grant-tracker',
    productName: 'Small Grant Tracker',
    productIdea: 'A grant lifecycle tracker for small nonprofits.',
    audience: 'Nonprofit admins and program managers.',
    problem: 'Grant deadlines and reports slip through the cracks.',
    must: 'Grant record, milestones, deliverables, reporting deadlines, admin dashboard.',
    nice: 'Funder list, narrative templates, alert reminders'
  }),
  buildInput({
    slug: 'safety-incident-log',
    productName: 'Safety Incident Log',
    productIdea: 'A small-business safety incident log.',
    audience: 'Floor staff, supervisors, safety officers.',
    problem: 'Incidents are not consistently logged or reviewed.',
    must: 'Incident form, severity tags, root-cause notes, corrective action, monthly review.',
    nice: 'Photo metadata, OSHA mapping, training tracker',
    track: 'technical'
  }),
  buildInput({
    slug: 'turn-pilot',
    productName: 'TurnoverPilot',
    productIdea: 'A small-business employee turnover tracker.',
    audience: 'HR leads and managers.',
    problem: 'Turnover signals are missed until people quit.',
    must: 'Employee tenure, exit reasons, manager observation log, monthly trend, alert thresholds.',
    nice: 'Survey integration, segment view, retention initiatives'
  }),
  buildInput({
    slug: 'meeting-room-board',
    productName: 'Meeting Room Board',
    productIdea: 'A simple meeting room booking board for a single small office.',
    audience: 'Office staff.',
    problem: 'Rooms get double-booked because chats are not the source of truth.',
    must: 'Room list, time-slot booking, conflict prevention, daily view, admin dashboard.',
    nice: 'Equipment tags, recurring bookings, no-show tracking'
  })
];

if (ideas.length !== 50) {
  throw new Error(`Expected 50 ideas, found ${ideas.length}`);
}
