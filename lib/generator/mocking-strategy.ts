/**
 * Generate `integrations/MOCKING_STRATEGY.md`.
 *
 * Phase G W6 introduced the magic-link demo-safe contract for
 * `category === 'auth'` integrations. Phase H M10 generalizes the same
 * pattern across every integration category so a fresh builder gets a
 * concrete, implementation-ready contract per mocked integration:
 *
 *   - what is mocked (file paths, env-var name)
 *   - exact fake behavior (what the mock writes, what it returns)
 *   - where the mock lives on disk
 *   - how the builder tests it
 *   - what production replacement requires
 *
 * No archetype detection, no domain templates — the per-category contracts
 * are built from `Integration` shape only (vendor, envVar, failureModes,
 * purpose). Each category branch is generic enough to apply to any domain.
 */
import type { Integration, ResearchExtractions } from '../research/schema';

export type MockContractInput = {
  integration: Integration;
};

/**
 * Render the per-integration contract block. Returns the markdown body
 * for one mocked integration, ready to splice into MOCKING_STRATEGY.md.
 *
 * Exported for direct testing.
 */
export function renderIntegrationMockContract({ integration: i }: MockContractInput): string {
  const slug = i.envVar.toLowerCase().replace(/[^a-z0-9_]/g, '-');
  const failureModeBlock = (i.failureModes && i.failureModes.length > 0)
    ? i.failureModes.map((fm) => `  - ${fm}`).join('\n')
    : '  - (no failure modes recorded; default to rate-limit + invalid-credential + transport-error)';
  const header = `## ${i.name} (\`${i.category}\`) — demo-safe mock contract\n\n\`${i.name}\` is declared \`mockedByDefault: true\` in \`research/extracted/integrations.json\`. Implement the mock with the contract below so the demo runs without live credentials while preserving the integration's UX shape.`;
  const swap = `\n### How to swap to a real provider later\n\nReplace the mock function body with a real ${i.vendor || 'provider'} call. Keep the mock available behind the demo-mode flag so end-to-end tests stay deterministic. The audit-event shape, error responses, and route signatures all stay the same.`;
  const failureBlock = `\n### Failure modes the mock must surface\n\n${failureModeBlock}\n\nEach failure mode renders a distinct user-visible error and emits a structured audit event. Do not collapse them into a single generic toast.`;

  switch (i.category) {
    case 'auth': {
      const role = `${slug}-role`;
      return `${header}

### What the mock implements

1. **Direct role-switcher** — at \`/dev/sign-in\` (only when \`AUTH_DEMO_MODE=true\`), render a list of researched actor roles and let the user pick one. Clicking a role signs in directly without a round-trip. This is the fastest path for clicking through the demo.
2. **Magic-link path that preserves the real UX** — at \`/auth/sign-in\`, the form accepts ANY email and immediately:
   - generates a token (\`crypto.randomBytes(32).toString('hex')\`),
   - writes a one-line link to \`.tmp/magic-links/<sha256(email)>.txt\` containing \`http://localhost:3000/auth/verify?token=<token>&email=<email>\`,
   - logs the same link to \`console.log\` with a \`[${i.category} mock]\` prefix so the developer can copy it from the dev-server output,
   - returns a "Check your email" success screen with a small dev-only "Open last magic link" button that reads the file the demo just wrote.
3. **Token verify route** — \`GET /auth/verify?token=…&email=…\` validates that the token file exists and is fresh (≤ 15 min), then signs the user in and deletes the token file. After three failed attempts on the same email the route returns 429.
4. **Role inference from email local-part** — for the magic-link path, the local-part prefix selects the role: \`${role}+anything@x\` → ${role}. This lets the demo exercise role-specific screens without a real user table.
5. **Demo shortcut env var** — when \`AUTH_DEMO_MODE=true\` is set in \`.env.local\`, the magic-link send step is skipped entirely; the form submits straight to \`/auth/verify\` with a freshly-minted token. The token file is still written so the audit log shows the same shape.

### What lives in the file system

\`\`\`
.tmp/magic-links/
  <sha256-of-email>.txt    ← one line: the verify URL
\`\`\`

The directory is gitignored. \`make clean-mocks\` removes it.

### Audit log

Every mock send writes \`{type: 'auth.magic-link.sent', email, sha256, ts}\`. Server-side, not client-side. The audit log is the contract that the rest of the workspace assumes; do not skip it just because the send is mocked.

### How the builder tests it

\`\`\`bash
# request a link
curl -X POST localhost:3000/auth/sign-in -d 'email=alice@example.com'
# read it from disk
cat .tmp/magic-links/$(node -e "console.log(require('crypto').createHash('sha256').update('alice@example.com').digest('hex'))").txt
# follow the URL — verify route signs in and deletes the file
\`\`\`
${swap}

### Real-provider env var

\`${i.envVar}\` — set this in \`.env.local\` to switch from mock to real ${i.vendor || 'provider'}.
${failureBlock}
`;
    }
    case 'sms': {
      return `${header}

### What the mock implements

1. **Send route** — server-side \`sendSms({ to, body, templateId })\` writes the rendered body to \`.tmp/sms/<sha256(to)>.txt\` and returns \`{ messageId: 'mock-' + ts }\`.
2. **Template renderer** — runs the same handlebars-style interpolation the real provider would. PHI / sensitive fields are intentionally NOT interpolated by default; tests must verify that.
3. **Delivery-status mock** — every 10 seconds a background timer (started by the dev server) flips one queued message from \`queued\` → \`delivered\` (90% of the time) or \`failed\` (10%). This exercises the failed-delivery code path.
4. **Demo shortcut env var** — when \`SMS_DEMO_MODE=true\` is set in \`.env.local\`, all \`sendSms()\` calls write to disk + return immediately; otherwise the real provider is invoked.

### What lives in the file system

\`\`\`
.tmp/sms/
  <sha256-of-recipient>.txt   ← one file per recipient with the latest body
.tmp/sms/log.jsonl            ← append-only log of every send (ts, recipient, sha256, status)
\`\`\`

The directory is gitignored.

### Audit log

Every mock send writes \`{type: 'sms.sent', toSha256, templateId, ts, status}\`. Server-side. Do not log the recipient phone number itself — the sha256 is the only identifier that should leave the server boundary.

### How the builder tests it

\`\`\`bash
# trigger a send via the workflow
curl -X POST localhost:3000/api/notify -d 'workflow=appointment-reminder&visitId=v-1'
# inspect the latest body
ls -lt .tmp/sms/ | head
cat .tmp/sms/<sha256>.txt
# inspect the structured log
tail .tmp/sms/log.jsonl
\`\`\`
${swap}

### Real-provider env var

\`${i.envVar}\` — set this in \`.env.local\` to swap in the real ${i.vendor || 'SMS'} provider. The provider must be HIPAA / privacy-compliant if the workspace touches PHI; document the BAA / DPA in \`security-risk/PRIVACY_RISK_REVIEW.md\` before flipping the switch.
${failureBlock}
`;
    }
    case 'email': {
      return `${header}

### What the mock implements

1. **Send route** — server-side \`sendEmail({ to, subject, body, templateId })\` writes the rendered email to \`.tmp/emails/<sha256(to)>-<ts>.eml\` and returns \`{ messageId: 'mock-' + ts }\`.
2. **Template renderer** — runs the same template engine as the real provider. Bounce / unsubscribe headers are populated to mirror real provider behavior.
3. **Bounce-rate mock** — a configurable BOUNCE_RATE (default 0.05) randomly marks emails as bounced; the workspace's failure-handling code path is exercised.
4. **Demo shortcut env var** — when \`EMAIL_DEMO_MODE=true\` is set in \`.env.local\`, sends write to disk and never hit the network.

### What lives in the file system

\`\`\`
.tmp/emails/
  <sha256(to)>-<ts>.eml         ← RFC 5322 envelope so it opens in any mail client
.tmp/emails/log.jsonl           ← append-only structured send log
\`\`\`

The directory is gitignored.

### Audit log

Every send writes \`{type: 'email.sent', toSha256, subject, templateId, ts, status}\`. Server-side.

### How the builder tests it

\`\`\`bash
curl -X POST localhost:3000/api/notify -d 'workflow=password-reset&userId=u-1'
ls -lt .tmp/emails/ | head
open .tmp/emails/<latest>.eml   # macOS — opens in Mail.app
cat .tmp/emails/log.jsonl | tail
\`\`\`
${swap}

### Real-provider env var

\`${i.envVar}\` — set this in \`.env.local\` to swap in the real ${i.vendor || 'email'} provider.
${failureBlock}
`;
    }
    case 'payment': {
      return `${header}

### What the mock implements

1. **Charge route** — server-side \`charge({ amountCents, currency, customerToken })\` writes a fake intent to \`.tmp/payments/<intentId>.json\` and returns \`{ intentId, status: 'requires_capture' }\` synchronously. NO real card data is accepted; tokens are opaque strings prefixed \`mock_pm_\`.
2. **Capture route** — \`capture(intentId)\` flips status to \`succeeded\` for tokens prefixed \`mock_pm_succeed_\`, to \`failed\` for \`mock_pm_fail_\`. Default tokens succeed.
3. **Webhook simulator** — a CLI \`make payment-webhook intent=<id>\` POSTs the real-provider event shape to \`/api/payments/webhook\`. Use this to exercise the webhook handler in isolation.
4. **Demo shortcut env var** — when \`PAYMENT_DEMO_MODE=true\` no real PSP call is made; charges resolve via the file-system fixtures above.

### What lives in the file system

\`\`\`
.tmp/payments/
  <intentId>.json   ← one file per fake charge with full state machine
\`\`\`

The directory is gitignored. **Never commit real card data here, even by accident — the mock refuses tokens that don't start with \`mock_\`.**

### Audit log

Every charge writes \`{type: 'payment.intent.created', intentId, amountCents, currency, customerSha, ts}\` and on capture \`{type: 'payment.captured', intentId, status, ts}\`. Server-side.

### How the builder tests it

\`\`\`bash
curl -X POST localhost:3000/api/checkout -d 'amount=4200&currency=usd&token=mock_pm_succeed_visa'
cat .tmp/payments/<intentId>.json
make payment-webhook intent=<intentId>
\`\`\`
${swap}

### Real-provider env var

\`${i.envVar}\` — set this in \`.env.local\` to swap in the real ${i.vendor || 'PSP'}. **Never** ship to production with the mock active; the audit blocks demo-mode in non-development environments.
${failureBlock}
`;
    }
    case 'storage': {
      return `${header}

### What the mock implements

1. **Upload route** — server-side \`upload({ filename, contentType, body })\` writes the body to \`.tmp/blobs/<sha256(content)>.bin\` and returns \`{ key: 'mock://' + sha, url: '/api/blobs/' + sha }\`.
2. **Download route** — \`/api/blobs/<sha>\` streams the file back with the original content-type.
3. **Signed-URL mock** — \`signUrl(key, ttl)\` returns a URL with a \`?expires=<ts>\` query param the real provider would honor; the mock honors it server-side.
4. **Demo shortcut env var** — when \`STORAGE_DEMO_MODE=true\` all uploads land on disk; otherwise the real provider is used.

### What lives in the file system

\`\`\`
.tmp/blobs/
  <sha256-of-content>.bin   ← deduped by content hash
.tmp/blobs/index.jsonl      ← append-only metadata log
\`\`\`

The directory is gitignored.

### Audit log

Every upload writes \`{type: 'storage.upload', key, contentSha256, sizeBytes, ts}\`. Server-side. Do NOT log the body itself.

### How the builder tests it

\`\`\`bash
curl -X POST -F file=@/tmp/test.png localhost:3000/api/uploads
ls -lt .tmp/blobs/ | head
\`\`\`
${swap}

### Real-provider env var

\`${i.envVar}\` — set this in \`.env.local\` to swap in the real ${i.vendor || 'storage'} provider.
${failureBlock}
`;
    }
    case 'observability': {
      return `${header}

### What the mock implements

1. **Span/event sink** — instead of forwarding to the real provider, all spans and metrics are appended to \`.tmp/observability/<date>.jsonl\` (one line per event). The shape mirrors what the real provider would receive.
2. **Local query CLI** — \`make obs-query expr='workflow="checkout" status="error"'\` greps the JSONL files. Useful for asserting expected spans during integration tests.
3. **Demo shortcut env var** — when \`OBS_DEMO_MODE=true\`, no network calls are made; otherwise events are forwarded to ${i.vendor || 'the real provider'}.

### What lives in the file system

\`\`\`
.tmp/observability/
  <YYYY-MM-DD>.jsonl   ← append-only structured event log
\`\`\`

### Audit log

Observability is the audit log for non-business events; the workspace's regular audit log still writes business events normally.

### How the builder tests it

\`\`\`bash
make obs-query expr='workflow="checkout" status="error"'
\`\`\`
${swap}

### Real-provider env var

\`${i.envVar}\`
${failureBlock}
`;
    }
    case 'llm': {
      return `${header}

### What the mock implements

1. **Completion stub** — \`generate({ prompt, model, max_tokens })\` returns a deterministic stub string composed from \`prompt.slice(0, 64) + '... [mock LLM response]'\`. The stub is keyed off a prompt-hash so the same prompt always returns the same response.
2. **Recorded fixtures** — \`tests/fixtures/llm/<sha256(prompt)>.txt\` lets the builder pre-record specific responses for golden tests.
3. **Token counter** — returns \`{ promptTokens: prompt.length / 4, completionTokens: response.length / 4 }\` so cost-tracking code paths exercise.
4. **Demo shortcut env var** — when \`LLM_DEMO_MODE=true\`, no model is called; the stub or fixture is returned.

### What lives in the file system

\`\`\`
tests/fixtures/llm/<sha256-of-prompt>.txt   ← committed; supplies deterministic responses for tests
.tmp/llm/log.jsonl                          ← gitignored runtime log
\`\`\`

### Audit log

\`{type: 'llm.completion', promptSha, model, promptTokens, completionTokens, ts}\`. Server-side.

### How the builder tests it

\`\`\`bash
echo "Specific response for this prompt." > tests/fixtures/llm/$(node -e "console.log(require('crypto').createHash('sha256').update('your prompt').digest('hex'))").txt
\`\`\`
${swap}

### Real-provider env var

\`${i.envVar}\`
${failureBlock}
`;
    }
    case 'ehr':
    case 'wms':
    case 'erp':
    case 'identity':
    case 'other':
    default: {
      return `${header}

### What the mock implements

1. **Request stub** — every method on the integration's client returns a deterministic fixture from \`tests/fixtures/${i.envVar.toLowerCase()}/<request-sha>.json\`. Pre-record fixtures for the requests your workflow exercises.
2. **Latency simulation** — adds 50-150ms jitter so concurrency and timeout code paths still exercise.
3. **Demo shortcut env var** — when \`${i.envVar}_DEMO_MODE=true\`, the stub is used; otherwise the real provider is called.

### What lives in the file system

\`\`\`
tests/fixtures/${i.envVar.toLowerCase()}/<request-sha>.json   ← committed; deterministic responses
.tmp/${i.category}/log.jsonl                                  ← gitignored runtime log
\`\`\`

### Audit log

\`{type: '${i.category}.request', method, requestSha, status, ts}\`. Server-side.

### How the builder tests it

\`\`\`bash
# capture a real-provider response once, then commit it as a fixture
curl <real-provider> > tests/fixtures/${i.envVar.toLowerCase()}/<sha>.json
\`\`\`
${swap}

### Real-provider env var

\`${i.envVar}\`
${failureBlock}
`;
    }
  }
}

export type MockingStrategyInput = {
  productName: string;
  primaryFeature: string;
  primaryAudience: string;
  ontologyEntityNames: string[];
  fallbackBullets: string[];
  extractions?: ResearchExtractions;
};

export function renderMockingStrategy(input: MockingStrategyInput): string {
  const ex = input.extractions;
  const integrations = ex?.integrations || [];
  const mocked = integrations.filter((i) => i.mockedByDefault);
  const realRequired = integrations.filter((i) => !i.mockedByDefault && i.required);

  const overviewBullets = mocked.length
    ? mocked.map((i) => `**${i.name}** (\`${i.category}\`) — ${i.purpose}`)
    : input.fallbackBullets;

  const realRequiredSection = realRequired.length
    ? `\n## Real provider required (no mock)

These integrations are \`required: true\` and \`mockedByDefault: false\`. Set the listed env var in \`.env.local\` before running the demo. Without a real provider, the related flow will fail clearly (NOT silently); do not stub them without first surfacing a blocker (see \`docs/BUILD_RECIPE.md\` blocker policy).

${realRequired.map((i) => `- **${i.name}** (\`${i.category}\`) — \`${i.envVar}\`. ${i.purpose}`).join('\n')}
`
    : '';

  const perCategoryContracts = mocked.length
    ? '\n' + mocked.map((i) => renderIntegrationMockContract({ integration: i })).join('\n---\n\n')
    : '';

  const noIntegrations = integrations.length === 0
    ? `\n## No integrations declared

The research extractions did not declare any external integrations. If the build adds one (auth, SMS, email, payment, storage, webhook, observability, LLM), document the mock contract here using the per-category template before wiring it up.

The per-category templates live in \`lib/generator/mocking-strategy.ts\` (\`renderIntegrationMockContract\`). They cover \`auth\`, \`sms\`, \`email\`, \`payment\`, \`storage\`, \`observability\`, \`llm\`, and a generic fallback for \`identity / ehr / wms / erp / other\`.
`
    : '';

  return `# MOCKING_STRATEGY

## What this file is for

This file pins the demo-safe contract for every integration the workspace depends on. Each contract names the file paths the mock writes to, the env var that swaps in the real provider, the audit-event shape the rest of the workspace expects, and how the builder tests the mock from the command line. A fresh implementing agent should be able to wire up every mocked integration end-to-end from this file alone, without inventing names or paths.

## What to mock before real credentials exist

${overviewBullets.map((b) => `- ${b}`).join('\n')}

## Mock data
- Use project-specific sample records that match ${input.primaryFeature}, ${input.primaryAudience}, and the ontology entities: ${input.ontologyEntityNames.join(', ') || '(none extracted)'}.

## Local test behavior
- Local tests must pass without internet access, live credentials, or hidden setup steps. \`make test\` is the contract; if a test depends on a network call it must use the per-category mock below, not the real provider.

## When to replace mocks with real services
- Only after the relevant gate (\`integrations/INTEGRATION_GATE.md\`, \`security-risk/PRIVACY_RISK_REVIEW.md\` if PHI/PII) explicitly approves the live dependency. The audit's \`integration-mocked\` rule (advisory) credits workspaces that keep the mock available even after wiring the real provider, because that's how E2E tests stay deterministic.
${realRequiredSection}${perCategoryContracts}${noIntegrations}`;
}
