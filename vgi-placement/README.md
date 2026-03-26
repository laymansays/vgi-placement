# VGI Placement System

Campus Placement Management System — Vidyavahini Group of Institutions, Tumakuru.

## File Structure

```
vgi-placement/
├── public/
│   ├── index.html                ← Home Page
│   ├── student.html              ← Student Portal
│   ├── placement-dashboard.html  ← Placement Dashboard
│   ├── placement-cell.html       ← Placement Cell
│   ├── placement-report.html     ← Placement Report
│   ├── shared.js                 ← Shared utilities
│   ├── placement.js              ← PIN logic
│   ├── student.js
│   ├── output_renderer.js
│   ├── language_engine.js
│   ├── ai_rewriter.js
│   ├── sw.js                     ← Service Worker
│   ├── manifest.json
│   ├── resume_format.pdf
│   ├── logo.jpg                  ← Add manually
│   └── cdc-signature.jpg         ← Add manually
├── server.js
├── package.json
├── render.yaml
├── .env.example
├── .gitignore
└── README.md
```

## Local Development

```bash
git clone https://github.com/YOUR_USERNAME/vgi-placement.git
cd vgi-placement
npm install
cp .env.example .env   # fill in real values
npm start
# Open http://localhost:3000
```

## Deploy to Render

1. Push to a **private** GitHub repo
2. Render → New → Web Service → connect repo
3. Set these environment variables in Render → Environment:

| Key | Value |
|-----|-------|
| `SHEET_ID` | Your Google Sheet ID |
| `WEBAPP_URL` | Your Apps Script deployment URL |
| `ADMIN_PIN` | Admin PIN |
| `JOIN_PIN` | Placement Cell PIN |
| `DASHBOARD_PIN` | Dashboard PIN |

4. Deploy — auto-redeploys on every `git push`

## Updating

```bash
git add .
git commit -m "your change"
git push
```

## Rotating Secrets

Render → Environment → update value → Save. Redeploys automatically.
