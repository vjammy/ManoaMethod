// Minimal HTTP server for the browser-loop fixture. Zero external deps.
// Implements the contract documented in BROWSER_AUTOMATION_GUIDE.md:
//   - reads `?as=<actorId>` query param at boot to hydrate the actor
//   - surfaces `data-testid="permission-denied"` for unauthorized actors
//   - surfaces `data-testid="form-error"` on validation failure
//
// Two actor roles understood: `primary-user` (allowed) and any other value
// (treated as unauthorized). The greet button is the single action under
// test; happy / negative / role-permission paths exercise the three flow
// branches the runner expects.

const http = require('http');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3479;

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Mini Built App</title>
</head>
<body>
<h1 data-testid="page-title">Mini Built App</h1>
<div>
  <label>Name<input data-testid="greeting-name" id="name-input" /></label>
  <button data-testid="greeting-submit" type="button" onclick="greet()">Greet</button>
</div>
<div data-testid="greeting-output" id="output"></div>
<div data-testid="form-error" id="form-error" hidden></div>
<div data-testid="permission-denied" id="permission-denied" hidden>permission denied</div>
<script>
  // Actor hydration via ?as= query string (mock-auth contract).
  const params = new URLSearchParams(location.search);
  window.__currentActor = params.get('as') || 'guest';

  function greet() {
    const errorEl = document.getElementById('form-error');
    const permEl = document.getElementById('permission-denied');
    const out = document.getElementById('output');
    errorEl.hidden = true;
    permEl.hidden = true;
    out.textContent = '';

    const name = document.getElementById('name-input').value.trim();
    if (!name) {
      errorEl.textContent = 'name is required';
      errorEl.hidden = false;
      return;
    }

    if (window.__currentActor !== 'primary-user') {
      permEl.hidden = false;
      return;
    }

    out.textContent = 'Hello ' + name;
  }
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

server.listen(PORT, () => {
  console.log('Mini-built-app fixture listening on ' + PORT);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
