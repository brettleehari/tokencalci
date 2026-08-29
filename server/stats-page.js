// A readable view of the counters, served as one self-contained page.
//
// The JSON at /api/stats is the interface; this is the thing a person opens. It is
// deliberately server-rendered and dependency-free so it still works when the SPA
// bundle does not, which is exactly when someone is most likely to be checking
// whether anything is reaching the site at all.
import { snapshot } from './analytics.js'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const bar = (n, max) => Math.max(2, Math.round((n / Math.max(1, max)) * 100))

const LABEL = {
  app: 'App pages', paper: 'Paper read', canvas: 'Canvas', skill: 'SKILL.md (agent contract)',
  figure: 'Figures', api: 'API calls',
  browser: 'Browsers', agent: 'AI agents', crawler: 'Crawlers', script: 'Scripts / curl',
  other: 'Other', unknown: 'No user-agent'
}

function rows(obj, note) {
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1])
  if (!entries.length) return `<p class="empty">Nothing yet.${note ? ' ' + note : ''}</p>`
  const max = entries[0][1]
  return entries.map(([k, v]) =>
    `<div class="row"><span class="k">${esc(LABEL[k] || k)}</span>
     <span class="track"><span class="fill" style="width:${bar(v, max)}%"></span></span>
     <span class="v">${v.toLocaleString()}</span></div>`).join('')
}

export function statsPage(_req, res) {
  const d = snapshot()
  const days = Object.entries(d.day).sort()
  res.type('html').send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>opentoken — traffic</title>
<style>
:root{--bg:#f5f5f7;--panel:#fff;--line:#d2d2d7;--text:#1d1d1f;--muted:#6e6e73;--accent:#0071e3}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:820px;margin:0 auto;padding:44px 22px 80px}
h1{font-size:26px;letter-spacing:-.02em;margin:0 0 6px}
.sub{color:var(--muted);margin:0 0 28px;font-size:14px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin:0 0 26px}
.card{background:var(--panel);padding:16px 18px}
.card b{display:block;font-size:28px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.card span{font-size:12px;color:var(--muted)}
section{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:0 0 16px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin:0 0 14px;font-weight:640}
.row{display:grid;grid-template-columns:180px 1fr 64px;align-items:center;gap:12px;padding:5px 0}
.k{font-size:13px}
.track{height:7px;background:#ededf0;border-radius:99px;overflow:hidden}
.fill{display:block;height:100%;background:var(--accent);border-radius:99px}
.v{text-align:right;font-variant-numeric:tabular-nums;font-size:13px}
.empty{color:var(--muted);font-size:13px;margin:0}
.note{font-size:12.5px;line-height:1.65;color:var(--muted);margin:22px 0 0}
code{background:#ededf0;padding:1px 5px;border-radius:4px;font-size:12px}
@media(max-width:620px){.cards{grid-template-columns:1fr}.row{grid-template-columns:130px 1fr 54px}}
</style></head><body><div class="wrap">
<h1>Traffic</h1>
<p class="sub">Since ${esc(d.since.slice(0, 16).replace('T', ' '))} UTC · ${d.uptimeHours}h uptime · counters reset when the service restarts</p>

<div class="cards">
  <div class="card"><b>${d.total.toLocaleString()}</b><span>requests counted</span></div>
  <div class="card"><b>${(d.surface.paper || 0).toLocaleString()}</b><span>paper reads</span></div>
  <div class="card"><b>${(d.caller.agent || 0).toLocaleString()}</b><span>AI agent calls</span></div>
</div>

<section><h2>What was fetched</h2>${rows(d.surface)}</section>
<section><h2>Who fetched it</h2>${rows(d.caller)}</section>
<section><h2>API endpoints</h2>${rows(d.apiEndpoint, 'Health checks are excluded.')}</section>
<section><h2>By day</h2>${rows(Object.fromEntries(days))}</section>
<section><h2>Referral</h2>${rows(d.referrer)}</section>

<p class="note">
Counts only — no IP addresses, no cookies, no identifiers, no user-agent strings retained,
no referrer URLs, and no per-request records, so there is nothing here that could be
correlated back to a person. Published openly rather than behind a login, because a project
arguing that every number should carry its provenance should not measure its readers in
private. Raw JSON at <code>/api/stats</code>. Render's own health check is excluded; counting
it made every other signal invisible.
</p>
</div></body></html>`)
}
