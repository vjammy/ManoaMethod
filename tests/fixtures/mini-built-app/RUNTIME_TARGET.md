# RUNTIME_TARGET

This file declares where the built app runs so `npm run loop` and
`npm run loop:browser` can probe it. The fixture is intentionally minimal —
a single Node `http` server on port 3479 — so the browser-loop runner has
something concrete to drive without pulling in Next.js, a database, or
auth infrastructure.

## Connection
- Base URL: http://localhost:3479
- Command: node server.js
- Start the runtime under 5 seconds.

## Smoke routes
- /
