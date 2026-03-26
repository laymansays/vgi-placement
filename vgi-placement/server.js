/**
 * VGI Placement System — Express Server
 * Injects environment variables into HTML/JS files at request time.
 * No secrets stored in source code.
 *
 * Routes:
 *   /                         → index.html           (Home Page)
 *   /student.html             → student.html         (Student Portal)
 *   /placement-dashboard.html → placement-dashboard  (Placement Dashboard)
 *   /placement-cell.html      → placement-cell.html  (Placement Cell)
 *   /placement-report.html    → placement-report.html
 *   /placement.js             → placement.js         (PIN logic — injected)
 *   /shared.js                → shared.js            (injected)
 *   All other static files    → served as-is from public/
 */

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const PUB  = path.join(__dirname, 'public');

/* ── Validate required env vars on startup ─────────────────── */
const REQUIRED = ['SHEET_ID', 'WEBAPP_URL', 'ADMIN_PIN', 'JOIN_PIN', 'DASHBOARD_PIN'];
const missing  = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error('❌  Missing environment variables:', missing.join(', '));
  console.error('    Set them in Render → Environment, or in a local .env file.');
  process.exit(1);
}

/* ── Inject secrets into any text file ─────────────────────── */
function inject(text) {
  return text
    .replace(/__SHEET_ID__/g,      process.env.SHEET_ID)
    .replace(/__WEBAPP_URL__/g,     process.env.WEBAPP_URL)
    .replace(/__ADMIN_PIN__/g,      process.env.ADMIN_PIN)
    .replace(/__JOIN_PIN__/g,       process.env.JOIN_PIN)
    .replace(/__DASHBOARD_PIN__/g,  process.env.DASHBOARD_PIN);
}

function serveInjected(filename, contentType, res) {
  try {
    const text = fs.readFileSync(path.join(PUB, filename), 'utf8');
    res.setHeader('Content-Type', contentType);
    res.send(inject(text));
  } catch (err) {
    console.error(`Error serving ${filename}:`, err.message);
    res.status(500).send('Internal server error');
  }
}

/* ── HTML routes ────────────────────────────────────────────── */
app.get('/',                          (req, res) => serveInjected('index.html',              'text/html', res));
app.get('/index.html',                (req, res) => res.redirect('/'));
app.get('/student.html',              (req, res) => serveInjected('student.html',             'text/html', res));
app.get('/placement-dashboard.html',  (req, res) => serveInjected('placement-dashboard.html', 'text/html', res));
app.get('/placement-cell.html',       (req, res) => serveInjected('placement-cell.html',      'text/html', res));
app.get('/placement-report.html',     (req, res) => serveInjected('placement-report.html',    'text/html', res));

/* ── JS routes that contain placeholders ───────────────────── */
app.get('/shared.js',     (req, res) => serveInjected('shared.js',     'application/javascript', res));
app.get('/placement.js',  (req, res) => serveInjected('placement.js',  'application/javascript', res));

/* ── All other static files (images, JS, PDF, manifest, sw) ── */
app.use(express.static(PUB));

/* ── Start ──────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`✅  VGI Placement System running on port ${PORT}`);
  console.log(`    Home:              http://localhost:${PORT}/`);
  console.log(`    Student Portal:    http://localhost:${PORT}/student.html`);
  console.log(`    Dashboard:         http://localhost:${PORT}/placement-dashboard.html`);
  console.log(`    Placement Cell:    http://localhost:${PORT}/placement-cell.html`);
  console.log(`    Report:            http://localhost:${PORT}/placement-report.html`);
});
