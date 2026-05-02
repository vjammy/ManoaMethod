# BUILD_RECIPE.md

This is the recipe a coding agent (Claude Code, Codex, Kimi, OpenCode) executes
**after** the research recipe (`docs/RESEARCH_RECIPE.md`) and `npm run
create-project` have produced a research-grounded workspace. It turns the
workspace into a Vercel-deployed Next.js app with Postgres persistence and
working magic-link auth — in a single coding session.

**The build recipe is the build-side analog of the research recipe.** Where
research depth comes from the 9 mandatory research passes, build depth comes
from the 9 mandatory build passes below. Skipping or under-filling a pass
breaks the runtime quality bar — server-side validation gets bypassed, audit
events don't fire, the deploy ships a shell that looks complete in dev but
falls over for the day-1 user.

The recipe runs **9 mandatory passes**. Each pass has a concrete deliverable,
explicit acceptance criteria, and a runtime-quality consequence. The build
agent is expected to log pass-level decisions in `BUILD_LOG.md` at the
deployment template root.

## Why no domain-specific scaffolding

mvp-builder previously tried domain packs (Phase F1, reverted in commit
`1b16d4c`). Domain packs forced a build agent to recognize the domain ("oh
this is healthcare → use the EHR scaffold") and route to a per-domain template.
That approach was deleted for the same reason it was deleted from the research
side: it doesn't generalize. The 14th brief breaks the 13 templates; the next
real user works in a niche the templates don't cover; the per-domain
scaffolding ages into stale shape that no one updates.

Build depth comes from the same place research depth does: the agent's own
reasoning over the workspace's research-driven artifacts. Specifically, the
build agent designs the file scaffolding *from the workspace's
`workflows.json`, `screens.json`, and `entities.json`*, not from a per-domain
template. Two different workspaces (clinic scheduling vs. food-pantry intake)
produce different route groups, different page components, different
server actions, different audit events — because their workflows differ —
even though both run the same 9-pass recipe.

The deployment template (`architecture/DEPLOYMENT_TEMPLATE/`) is the only
piece of the build that's pre-baked, and it's deliberately stack-level (Next +
Postgres + Vercel + magic-link), not domain-level. If your workspace genuinely
needs a different stack — for example, the research's `integrations.json`
declares an EHR integration that mandates a Java/Spring backend — the agent
diverges from the template and documents the deviation in `BUILD_LOG.md`. The
template is a default, not a contract.

## Surface blockers, don't paper over them

If you can't deploy without making a decision the workspace didn't specify,
**surface it as a blocker before continuing**. Examples of blockers that the
build agent is expected to escalate rather than silently choose:

- The brief assumes a payment provider but `integrations.json` doesn't list
  one. Don't pick one — flag it.
- A workflow's failure mode says "block save" but `entities.json` doesn't
  declare the corresponding constraint. Don't infer it — flag it.
- A screen requires a state the data model can't represent. Don't add columns
  silently — flag it.
- Magic-link auth is required but `integrations.json` lists no email provider
  and the brief doesn't say to mock it. Don't quietly disable auth — flag it.

Blockers go into `BUILD_LOG.md` under "Blockers surfaced before continuing".
The build agent stops, surfaces the blocker, and either gets the answer from
the user or documents the decision and continues with explicit explanation of
why the divergence is safe.

---

## Validation table — pass to runtime quality bar

Each pass below maps to a runtime quality bar. If the pass is skipped or
under-filled, the runtime symptom shows up in the column on the right.

| Pass | Deliverable | Skipped → runtime symptom |
|---|---|---|
| B1 Stack pick | `BUILD_LOG.md` stack section, default Next.js 14 + Postgres + Drizzle + Resend + Vercel | Agent freelances → inconsistent shape across builds; later cycles can't reuse code |
| B2 Schema → migration | `drizzle/schema.ts` + `drizzle/migrations/0001_init.sql` | Schema drift between code and DB; production inserts fail with column-not-found |
| B3 Auth wiring | `app/auth/*` routes + magic-link sender | Auth-stubbed-for-demo apps that don't survive day-2 real users |
| B4 Workflow scaffolding | One route group + one page + one server action per `workflow.id` in dependency order | App opens but workflows can't be reached; users hit dead-end pages |
| B5 Per-screen implementation | Empty / loading / error / populated states for every page from `PER_SCREEN_REQUIREMENTS.md` | Pages flash with empty content, error states show stack traces, loading shows nothing |
| B6 Server-side validation | Recipe-defined rules enforced at API/server-action layer, not just UI | Malicious or curious user posts to the route directly and bypasses every validation |
| B7 Audit-log wiring | Server actions write the audit entry from `entity.eventType` enumValues | Compliance / forensic gap; actions happen with no record of who/when |
| B8 Smoke + e2e | Playwright suite from `INTEGRATION_TESTS.md` (one per workflow happy path + one per failure mode) | Regressions slip through; "demo works on my machine" |
| B9 Deploy + production smoke | `make deploy` + Playwright against live URL | Deploy claims success but a real user can't sign in or import their first list |

---

## Pre-flight: read these files first

Before pass B1, the build agent reads (in order):

1. `BUILDER_START_HERE.md` — points at the canonical 10 load-bearing files
2. `PROJECT_BRIEF.md` — one-paragraph product context
3. `product-strategy/USE_CASES.md` — happy / edge / failure / recovery per persona
4. `product-strategy/USER_PERSONAS.md` — actor-level personas
5. `research/extracted/workflows.json` — workflows in dependency order
6. `research/extracted/screens.json` — screen-level state contracts
7. `requirements/PER_SCREEN_REQUIREMENTS.md` — per-screen acceptance + edge cases
8. `architecture/DATABASE_SCHEMA.sql` + `DATABASE_SCHEMA.md` — schema source of truth
9. `research/extracted/testCases.json` — test cases per persona × workflow × screen
10. `phases/<slug>/INTEGRATION_TESTS.md` — happy path + failure modes per phase

Then read `architecture/DEPLOYMENT_TEMPLATE/DEPLOYMENT_README.md` for the
stack defaults.

If a load-bearing file is missing, the workspace is not BuildReady — escalate
that as a blocker and stop. Do not improvise content the workspace didn't
specify.

---

## Pass B1 — Stack pick

### Goal

Pick the runtime stack and write the choice (with rationale) to
`BUILD_LOG.md`. The default stack is non-negotiable unless the workspace's
research declares a constraint that rules it out.

### Default stack

| Layer | Default | Rationale |
|---|---|---|
| Framework | Next.js 14 (app router) | Server actions + RSC let one route group serve a workflow without a separate API |
| Database | PostgreSQL (managed: Supabase) | The workspace emits Postgres-correct DDL; Supabase ships RLS + auth helpers |
| ORM | Drizzle | Type-safe; migrations are SQL files that diff cleanly; smaller than Prisma |
| Auth | Magic-link via Resend | Cheap, no password management, mock provider for dev |
| Hosting | Vercel | Zero-config Next deploys, preview env per PR |
| E2E | Playwright | Generated test suite consumes `INTEGRATION_TESTS.md` |

### Acceptance

- `BUILD_LOG.md` has a `## Stack` section with each layer + version pinned.
- If any layer diverges from the default, the section explains why with a
  pointer at the workspace artifact (e.g. `integrations.json` entry) that
  forced the divergence.
- Package.json contains exactly the dependencies for the chosen stack — no
  unused deps, no "kitchen-sink" pulls.

### When to diverge

Only when the workspace forces it:

- `integrations.json` declares an EHR / WMS / ERP integration that has a
  Node SDK only in CommonJS → may force a different bundler.
- `risks.json` lists a "regulated-data-export-restriction" that prevents
  cloud DB → forces self-hosted Postgres.
- The brief explicitly says "no email" → swap magic-link for an SSO provider
  the brief does name.

If the divergence isn't forced, **don't diverge.** Stack consistency across
builds is itself a value (reusable scaffolds, predictable smoke output).

### Runtime quality bar

The next agent who picks up this codebase opens `package.json` and sees a
recognizable stack. There are no exotic dependencies that the original agent
didn't justify. New routes follow the existing patterns.

---

## Pass B2 — Schema → migration

### Goal

Turn the workspace's `architecture/DATABASE_SCHEMA.sql` into a Drizzle schema
and a Drizzle migration that re-runs the workspace's DDL.

### Inputs

- `architecture/DATABASE_SCHEMA.sql` — the source of truth, Postgres-flavored
- `architecture/DATABASE_SCHEMA.md` — readable index
- `architecture/DEPLOYMENT_TEMPLATE/supabase/migrations/0001_init.sql` —
  Postgres-correct preamble + DDL re-run

### Output

```
drizzle/
  schema.ts           — TypeScript schema mirror (source for app types)
  migrations/
    0001_init.sql     — same DDL as the workspace's, with Drizzle-managed
                       metadata header
  drizzle.config.ts   — points at DATABASE_URL and drizzle/migrations/
```

### Process

1. Open `DATABASE_SCHEMA.sql` and parse each `CREATE TABLE`.
2. For each table, write a Drizzle schema entry. Mirror types one-to-one.
3. Mirror foreign keys with `references()` calls.
4. Mirror indexes with `index()` calls.
5. Mirror enum CHECK constraints with `pgEnum()` declarations.
6. For each FK, add `onDelete` matching the workspace declaration.
7. Generate the first migration with `drizzle-kit generate:pg`. Verify the
   output matches the workspace SQL byte-for-byte (or close enough that a
   diff review is trivial).

### Acceptance

- `drizzle.config.ts` points at `DATABASE_URL` from `.env.local`.
- `npx drizzle-kit push` against a fresh local Postgres applies the migration
  cleanly with no errors.
- `psql -c "\d <each table>"` shows the columns, types, FKs, indexes, and
  CHECK constraints from the workspace SQL.
- A `drizzle/schema.ts` symbol exists for every entity in `entities.json`.
  No table is silently dropped.

### Why Drizzle, not Prisma

Prisma's schema syntax is great for greenfield, but it's a second source of
truth that diverges from the workspace's SQL. Drizzle's migrations are SQL
files; the workspace's DDL is also SQL. Diffs are obvious, conflicts are
explicit. Prisma migrate's introspection vs. generation flow is a known
foot-gun for mid-build schema changes.

If the agent has a strong reason to diverge to Prisma (e.g., the brief
mandates a Prisma-ecosystem integration), document it in `BUILD_LOG.md`.

### Runtime quality bar

A fresh database created from the migration accepts every record in
`SAMPLE_DATA.md` without modification. FK INSERTs in dependency order
succeed; reverse order fails with the expected constraint violation.

---

## Pass B3 — Auth wiring

### Goal

Implement magic-link sign-in. Production uses Resend; dev writes magic links
to a local file so no API key is needed for development.

### Files

```
app/auth/
  signin/
    page.tsx          — email-only form
    actions.ts        — sendMagicLink server action
  callback/
    [token]/
      route.ts        — token verification, session cookie, redirect
  signout/
    actions.ts        — clear session cookie
  lib/
    magic-link.ts     — sender abstraction (Resend in prod, file in dev)
    session.ts        — cookie + session helpers (signed JWT or DB row)
```

### Process

1. Create `auth_token` and `session` tables in `0001_init.sql` (if not
   already in the workspace schema). The workspace's `entities.json` may or
   may not declare these — typically auth tables are infrastructure, not
   domain.
2. Implement `sendMagicLink({ email })`:
   - Generate a one-time token (cryptographically random, ≥32 bytes)
   - Persist `{ token, email, expiresAt: now + 15min, usedAt: null }`
   - In production, call Resend with a templated email containing the
     callback URL: `${NEXT_PUBLIC_APP_URL}/auth/callback/${token}`
   - In development (`AUTH_MAGIC_LINK_PROVIDER=mock`), append the URL to
     `.tmp/auth-links.log` instead of calling Resend
3. Implement the callback route:
   - Look up the token; if missing or expired or used, redirect to signin
     with an error
   - Mark the token used
   - Find or create the user matching the email (workspace's `entities.json`
     should declare a user-shaped entity — typically the primary actor)
   - Set a signed session cookie
   - Redirect to the post-signin destination (workspace's primary workflow
     entry point)
4. Implement signout:
   - Clear the session cookie
   - Optionally invalidate the session row in the DB

### Server-rendered guards

Every page in `app/(protected)/*` checks the session in a `layout.tsx`
server component. No "useEffect to check auth" pattern — that's a client-side
guard that flashes content before redirecting and can't enforce server-side
rules anyway.

### Acceptance

- New user flow: email → magic link → click → authenticated landing in <30s.
- Dev mode: link writes to `.tmp/auth-links.log`; the file is gitignored.
- Token reuse fails with a friendly error.
- Expired token (>15 min) fails with a friendly error.
- Unauthenticated user visiting `/(protected)/*` is redirected to `/auth/signin`
  with the destination preserved in a `next` query param.
- Signed-in user is rendered the protected route directly with no flash.

### Runtime quality bar

A real user, not the build agent, signs in in <60 seconds. The dev-mode mock
provider doesn't get shipped to production by accident (Vercel env defaults
to `resend`).

---

## Pass B4 — Workflow scaffolding

### Goal

For each `workflow.id` in `research/extracted/workflows.json`, generate one
route group + one page + one server action. The workflows are in dependency
order in the file; the build follows that order.

### Inputs

- `research/extracted/workflows.json` — workflow.id, primaryActor, steps,
  failureModes, entitiesTouched
- `research/extracted/screens.json` — screens linked by id
- `research/extracted/uxFlow.json` — edges between screens
- `phases/<slug>/INTEGRATION_TESTS.md` — happy + failure paths per workflow

### Output

For workflow `workflow-list-intake` (example from the SDR brief):

```
app/(protected)/intake/
  page.tsx              — landing for the workflow
  actions.ts            — server actions: importList, confirmRows
  components/
    UploadCsvForm.tsx
    PreviewTable.tsx
    TerritoryConflictBanner.tsx
  loading.tsx           — Next.js streaming loading boundary
  error.tsx             — error boundary
```

The route slug derives from the workflow.id (drop the `workflow-` prefix,
keep the rest, hyphenate). One workflow → one route group. Don't combine
two workflows into one page even if they're related — the workspace
modeled them separately for a reason.

### Dependency order

`workflows.json` entries appear in dependency order. A workflow that produces
data consumed by a later workflow appears earlier. The build agent
implements them in that order so each workflow has a populated DB when
testing it manually.

For the SDR example: list-intake before per-attendee-research before
prioritize-and-freeze before generate-outreach before log-followup before
manager-handoff. Building manager-handoff before list-intake means manager-
handoff has no leads to hand off, and you can't smoke-test it.

### Server actions

One server action per state-changing step in the workflow. Server actions
go in `actions.ts` next to the page. They:

1. Read the session (server-side, not from a header passed in)
2. Validate inputs (Pass B6 enforces this is at the server-action layer,
   not just in the form)
3. Open a DB transaction
4. Perform the writes the workflow declares
5. Write the audit entry (Pass B7)
6. Commit
7. Revalidate the affected route's cache

Don't put a thin REST API over server actions. The route handler form
(`app/api/foo/route.ts`) is fine for non-form use cases (webhooks, exports);
otherwise server actions are the canonical path.

### Acceptance

- Every `workflow.id` from the workspace has a corresponding route group.
- Routes appear in the dependency order the workspace declares.
- Sign-in → home redirects to the first workflow's landing page.
- Each workflow page is reachable from the previous workflow's terminal
  state (the uxFlow edges are honored).
- The Playwright suite (Pass B8) can drive each workflow end-to-end without
  manual test-data setup.

### Runtime quality bar

A user signed in for the first time hits the first workflow's landing page,
not a dashboard with five tiles that say "Coming soon." The workspace's
workflows are *the product* — show them.

---

## Pass B5 — Per-screen implementation

### Goal

For each page component, implement the four state contracts the workspace
declares: empty, loading, error, populated. Pull the contract verbatim from
`requirements/PER_SCREEN_REQUIREMENTS.md`.

### State contract (mandatory for every page)

| State | When | UI requirement |
|---|---|---|
| Loading | Initial fetch, navigation | Skeleton or shimmer matching the populated layout's footprint. **Not** an empty white screen, **not** a spinner alone. |
| Empty | DB returned no rows | Helpful empty-state with a CTA pointing at the action that would populate the list (often a previous workflow's terminal action). |
| Error | Fetch failed, validation rejected, etc. | User-readable message + retry / fallback action. **Never** show a stack trace. **Never** show "Error: [object Object]". |
| Populated | DB returned rows | The screen-spec from `screens.json` rendered with real data. |

### Process per page

1. Open `requirements/PER_SCREEN_REQUIREMENTS.md` for the screen.
2. Match it with the corresponding `screens.json` entry (sections, fields,
   actions).
3. Render the populated state first (make the happy path work).
4. Add the loading state (Next.js `loading.tsx` boundary or `<Suspense>`).
5. Add the empty state (check the data array length in the server component;
   render the empty UI directly).
6. Add the error state (`error.tsx` boundary + per-action error toasts).

### Acceptance

- Every page has a `loading.tsx` and `error.tsx` boundary in its route
  segment.
- Manual test: open every page in dev with the database empty. Confirm
  empty state. With network throttling, confirm loading state. With a
  forced error (e.g., temporary DB disconnect), confirm error state.
- The Playwright suite has explicit assertions for empty, loading, and
  error states on at least one page per workflow.

### Runtime quality bar

A user who lands on a page they've never seen before gets oriented in <5
seconds. Empty states are inviting, not dead-ends. Errors are recoverable.
Loading isn't a black hole.

---

## Pass B6 — Server-side validation enforcement

### Goal

Every recipe-defined validation rule runs at the API / server-action layer,
not only in the UI. UI validation alone is bypassable by anyone who can
post to the endpoint with `curl`.

### Source of validation rules

- `requirements/PER_SCREEN_REQUIREMENTS.md` — per-screen acceptance criteria
- `requirements/FUNCTIONAL_REQUIREMENTS.md` — workflow-step failure cases
- `research/extracted/workflows.json` — `failureModes[].mitigation`
- `research/extracted/screens.json` — field validations
- `architecture/DATABASE_SCHEMA.sql` — DB-level CHECK constraints (last line
  of defense)

### Common patterns to enforce server-side

| Pattern | Example | Layer |
|---|---|---|
| Minimum-length check | "Research note must be ≥ 20 characters per structured field" | server action — refuse save with 422 |
| Domain reject | "Email must match RFC 5322 + domain not on blocklist" | server action — refuse save with 422 |
| Opt-out keyword scan | "If note contains 'unsubscribe', 'remove me', flag and ask before save" | server action — return interactive flag, require explicit override |
| Territory conflict | "Lead's email-domain must not match an AE-owned account at write time" | server action — refuse save with explanatory error |
| Consent gate | "Distribution log requires consent toggle = true" | server action — refuse save AND DB CHECK constraint |
| Idempotency window | "Same lead + same outcome within 60s collapses to one record" | server action — UPDATE instead of INSERT when within window |
| Rate limit | "Manager can approve ≤ 50 territory overrides per hour" | middleware — sliding-window counter in DB or Redis |
| Optimistic concurrency | "Two managers editing same rule reject second save with conflict UI" | server action — CHECK updatedAt matches snapshot |

### Pattern for a server action

```typescript
'use server';
import { z } from 'zod';
import { auth } from '@/lib/auth';

const InputSchema = z.object({
  /* match screens.json field validations exactly */
});

export async function submitResearchNote(formData: FormData) {
  const session = await auth();                   // server-side session check
  if (!session) throw new Error('unauthenticated');

  const parsed = InputSchema.safeParse(/* formData → object */);
  if (!parsed.success) {
    return { error: parsed.error.flatten() };     // 422-equivalent
  }

  // Domain-specific server-side rules from research/extracted/workflows.json:
  if (containsOptOutKeyword(parsed.data.note)) {
    return { error: 'opt-out-detected', flagged: true };
  }

  // ... transaction, audit log (Pass B7), commit, revalidate
}
```

### Acceptance

- For every validation rule the workspace declares, there is a server-side
  enforcement at the route or server-action level.
- The UI may *also* validate (better UX), but server-side is mandatory.
- Manual test: bypass the UI with `curl -X POST` and confirm the server
  rejects the bad input.
- The Playwright suite has at least one assertion per validation rule that
  posts directly to the endpoint and expects rejection.

### Runtime quality bar

A curious or malicious user posting invalid data via the network tab cannot
corrupt the DB. The "honor system" version of validation is not enough.

---

## Pass B7 — Audit-log wiring

### Goal

Every state-changing route writes the audit entry the workspace declares.
The eventType comes from the workspace's `entity-audit-entry.eventType`
enumValues. Server-side, not client-side.

### Source of audit shape

`research/extracted/entities.json` — there's typically an `audit-entry` (or
similarly named) entity with fields like:

```json
{
  "name": "audit-entry",
  "fields": [
    { "name": "eventType", "dbType": "ENUM", "enumValues": [
      "list-imported", "row-flagged", "manager-handoff-proposed",
      "outreach-drafted", "follow-up-logged", "thin-list-confirmed",
      "source-pending-verify", "opt-out-detected", "territory-override-approved",
      ...
    ]},
    { "name": "actorId", "fk": { "entityId": "user", "fieldName": "id" } },
    { "name": "subjectId", "dbType": "TEXT" },
    { "name": "subjectType", "dbType": "ENUM", "enumValues": [...] },
    { "name": "metadata", "dbType": "JSONB" },
    { "name": "createdAt", "dbType": "TIMESTAMPTZ" }
  ]
}
```

### Pattern

Inside each server action, after the domain write succeeds:

```typescript
await db.insert(auditEntry).values({
  eventType: 'list-imported',                      // from enumValues
  actorId: session.userId,
  subjectId: list.id,
  subjectType: 'attendee-list',
  metadata: { totalRows: list.totalRows, fileBytes: file.size },
  createdAt: new Date()
});
```

Wrap domain write + audit write in the same transaction so the audit log
can never lie about a write that didn't happen.

### Acceptance

- Every server action that mutates state writes an audit entry.
- The eventType set used in code matches the workspace's enumValues set
  exactly (no events the workspace didn't declare; no missing ones).
- Manual test: do each workflow once; query
  `SELECT eventType, count(*) FROM audit_entry GROUP BY 1`. Every workflow
  has corresponding entries.
- A read-only `app/(protected)/admin/audit/page.tsx` shows the audit log
  for an authorized actor (the workspace's `permission-matrix.md`
  declares who can read it).

### Runtime quality bar

If a user (or auditor, or compliance officer) asks "who did what when",
the audit log answers it. No important domain action happens without a
record.

---

## Pass B8 — Smoke + e2e tests

### Goal

A Playwright suite generated from `phases/<slug>/INTEGRATION_TESTS.md`. One
scenario per workflow happy path, one per researched failure mode.

### Inputs

- `phases/<slug>/INTEGRATION_TESTS.md` — happy + failure narratives
- `research/extracted/testCases.json` — per persona × workflow × screen
- `research/extracted/workflows.json` — `failureModes`

### Output

```
e2e/
  happy/
    list-intake.spec.ts
    per-attendee-research.spec.ts
    prioritize-and-freeze.spec.ts
    generate-outreach.spec.ts
    log-followup.spec.ts
    manager-handoff.spec.ts
  failure/
    csv-non-comma-delimiter.spec.ts
    territory-conflict-on-import.spec.ts
    opt-out-on-followup.spec.ts
    thin-list-freeze-warning.spec.ts
    ...one per workflow.failureModes[].trigger...
  fixtures/
    sample-attendee-list.csv
    sample-attendee-list-malformed-delimiter.csv
    ...
  playwright.config.ts
```

### Pattern

```typescript
import { test, expect } from '@playwright/test';

test('list-intake happy: SDR uploads CSV and triages territory conflicts', async ({ page }) => {
  await page.goto('/auth/signin');
  await page.fill('[name=email]', 'sdr+test@example.com');
  await page.click('button[type=submit]');
  // dev-mode magic link is in .tmp/auth-links.log; tests read it
  const link = await readLatestMagicLink('sdr+test@example.com');
  await page.goto(link);

  await page.goto('/intake');
  await page.setInputFiles('[name=csv]', 'e2e/fixtures/sample-attendee-list.csv');
  await page.click('button:has-text("Preview")');
  await expect(page.getByText(/imported (\d+) rows/i)).toBeVisible();
  await page.click('button:has-text("Confirm import")');
  await expect(page.getByText(/territory conflict/i)).toBeVisible();
  // ... full flow assertions
});
```

### Acceptance

- One spec per workflow.id (happy path).
- One spec per workflow.failureModes[] (failure path).
- The suite runs against `make smoke` locally and in CI.
- Every assertion ties to a specific line in `INTEGRATION_TESTS.md` or
  `testCases.json` (no test-the-test cases).

### Runtime quality bar

A regression in any workflow gets caught before deploy. The "demo works on
my machine" failure mode is structurally prevented by running the same
suite against the live URL post-deploy.

---

## Pass B9 — Deploy + production smoke

### Goal

Deploy to Vercel using the deployment template, then run the Playwright
suite against the live URL.

### Process

1. Verify `architecture/DEPLOYMENT_TEMPLATE/.env.template` is mirrored into
   Vercel's environment variables (production + preview environments).
2. `cd architecture/DEPLOYMENT_TEMPLATE && make migrate` — apply
   `0001_init.sql` to the production database.
3. `make deploy` — `vercel --prod`.
4. `DEPLOY_URL=https://your-app.vercel.app make smoke` — health check + run
   the Playwright suite against the live URL.
5. If smoke fails, `make rollback` and document the failure in
   `BUILD_LOG.md`.

### Health endpoint

`app/api/health/route.ts`:

```typescript
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({ ok: true, db: true });
  } catch (e) {
    return Response.json({ ok: false, db: false, error: String(e) }, { status: 503 });
  }
}
```

The smoke check pings this first; if it fails, the rest of the suite is
short-circuited and the deploy is rolled back.

### Acceptance

- Production URL serves a working magic-link signin.
- A real user (not the build agent) can sign in and complete the first
  workflow on the live deployment in <5 minutes.
- The Playwright suite passes against the live URL.
- `BUILD_LOG.md` records the deploy URL, the migration timestamp, the
  smoke-pass time, and any blockers surfaced.

### Runtime quality bar

The deployed app is *useful day 1*. The fresh user opens the URL, signs in,
imports their first list (or whatever the first workflow is), and gets value
in <10 minutes — not "this is a demo, the real version is coming next week."

---

## After all 9 passes

### Final BUILD_LOG.md skeleton

```markdown
# BUILD_LOG.md

## Stack (B1)
- Framework: Next.js 14.x (app router)
- Database: PostgreSQL via Supabase
- ORM: Drizzle x.y.z
- Auth: Magic link via Resend
- Hosting: Vercel
- E2E: Playwright

(Deviations from default: ...)

## Schema migration (B2)
- Source: architecture/DATABASE_SCHEMA.sql (workspace SHA: ...)
- Drizzle schema: drizzle/schema.ts
- Migration: drizzle/migrations/0001_init.sql
- Applied: <timestamp>
- Verified: SAMPLE_DATA.md fixtures load cleanly

## Auth (B3)
- Provider: Resend (production), file-mock (dev)
- Token TTL: 15 min
- Session: signed JWT, 14-day TTL
- Tested: <user> signed in successfully <timestamp>

## Workflow scaffolding (B4)
- Workflows implemented: N / N
- Routes:
  - /intake — workflow-list-intake
  - /research — workflow-per-attendee-research
  ...

## Per-screen implementation (B5)
- Pages: M
- All four states (empty / loading / error / populated) verified per page

## Server-side validation (B6)
- Rules enforced server-side: K
- Manual curl-bypass test: N/N rules block

## Audit log (B7)
- eventType enum: matches workspace exactly (N events)
- All state-changing routes write audit entries

## E2E tests (B8)
- Happy specs: N
- Failure specs: M
- Local pass rate: 100%

## Deploy + smoke (B9)
- Deploy URL: https://...
- Migration applied: <timestamp>
- Smoke suite pass: <timestamp>
- First real user signed in: <timestamp>

## Blockers surfaced before continuing
(None | List)
```

### What you don't do

- Don't add a feature the workspace didn't research.
- Don't refactor the workspace's schema (the workspace is the source of truth).
- Don't add a "demo mode" that bypasses validation; the validation is the product.
- Don't skip Pass B6 (server-side validation) because "the UI catches it."
- Don't ship without Pass B9 (production smoke); a deploy that passed on
  preview but fails on production is the worst class of bug.

### When to stop and escalate

- A workspace artifact is missing (e.g., no `screens.json`) — escalate.
- The schema in `DATABASE_SCHEMA.sql` doesn't match what `screens.json`
  needs — escalate.
- The brief implies an integration that `integrations.json` doesn't list —
  escalate.
- The first real user can't sign in within 5 minutes of the live URL —
  escalate, debug, do not paper over.

---

## Mapping to the audit

The workspace's quality audit (`scripts/mvp-builder-quality-audit.ts`) has a
new dimension `build-recipe-coverage` that scores the deployed app against
this recipe (max 5):

| Sub-dim | Points | Source |
|---|---:|---|
| Per workflow that's also a route in the deployed app | +1 (max 3) | manifest.routes vs workflows.json |
| Validation behavior server-enforced (not just UI) | +1 (max 1) | manifest.serverValidations |
| Audit log writes from server actions | +1 (max 1) | manifest.auditEvents vs entity.eventType.enumValues |

The dim only fires when the workspace contains `build/manifest.json`
pointing at the deployed app; otherwise the dim is omitted (not zero).
This keeps research-only workspaces from being penalized for not having a
build yet.

The dim is initially **advisory** in the F3 depth-gate — failures are
surfaced but don't block the gate. Once enough builds have produced
`build/manifest.json` files for the audit to calibrate the thresholds,
the dim graduates to blocking.

---

## See also

- `docs/RESEARCH_RECIPE.md` — the upstream recipe; this build recipe assumes
  a workspace produced by the 9 research passes.
- `architecture/DEPLOYMENT_TEMPLATE/DEPLOYMENT_README.md` — stack-level
  defaults this recipe inherits.
- `BUILDER_START_HERE.md` — emitted into every workspace; points the build
  agent at the canonical 10 load-bearing files.
- `archive/INDEX.md` — emitted into every workspace; catalogs the ceremony
  files the build agent can skip.
