// FIRST-PARTY, PRIVACY-PRESERVING REQUEST COUNTING.
//
// Why this exists rather than a script tag. The surfaces this project most wants
// measured are the ones client-side analytics cannot see at all: /paper.md and
// /canvas.md are markdown documents, /SKILL.md is an agent contract, /api/* is
// consumed by machines, and /figures/* are images people hotlink. None of those
// execute JavaScript, so a Plausible or GA snippet reports zero for every one of
// them while happily counting the landing page nobody was asking about.
//
// WHAT IS STORED: counts. Nothing else.
//   - no IP addresses, not even hashed
//   - no cookies, no localStorage, no identifiers of any kind
//   - no user-agent strings, only a coarse class derived from one and discarded
//   - no referrer URLs, only whether a referrer was same-origin or external
//   - no per-request records at all, so there is nothing to correlate later
//
// This is a deliberate choice and not only an ethical one. A project whose argument
// is that every number should carry its provenance cannot ship surveillance to
// measure whether anyone read the argument. It also means no consent banner is
// required, because there is no personal data and no terminal storage.
//
// DURABILITY: the counters are in memory. Render's free tier has an ephemeral
// filesystem and sleeps the service, so anything written locally is lost anyway.
// Totals are therefore periodically emitted as a single structured log line, which
// Render retains and which can be grepped or shipped anywhere later. A restart
// resets the live counters and loses nothing that was already logged.

const started = Date.now()

// Coarse surface classes. The point is to distinguish the artifact people came for
// from the shell that delivered it — a paper read is not the same event as a page view.
function surfaceOf(path) {
  // Exclusions FIRST. These were previously below the '/api/' prefix test, which
  // matched /api/health before the exclusion could run — so the health check was
  // counted anyway and remained 92 of 97 requests. Ordering is the whole logic here.
  if (path === '/api/health') return null           // Render's liveness poll, not a visitor
  if (path.startsWith('/assets/')) return null      // bundle noise, not a visit
  if (path === '/favicon.ico') return null

  if (path === '/paper.md') return 'paper'
  if (path === '/canvas.md') return 'canvas'
  if (path === '/SKILL.md') return 'skill'
  if (path === '/stats') return null                // looking at the counter is not traffic
  if (path.startsWith('/figures/')) return 'figure'
  if (path === '/api' || path.startsWith('/api/')) return 'api'
  return 'app'
}

// Who is calling, at the coarsest resolution that is still useful. The interesting
// question for this project is whether agents consume the API contract, and that is
// answerable without retaining anything about anyone.
function callerClass(ua = '') {
  const s = ua.toLowerCase()
  if (!s) return 'unknown'
  // Agent check first: several AI crawlers embed "bot" in the name, so a generic
  // crawler rule would swallow exactly the class this project most wants to see.
  if (/(gptbot|claude|anthropic|openai|perplexity|cohere|bytespider|ccbot)/.test(s)) return 'agent'
  if (/(bot|crawler|spider|slurp|bingpreview|facebookexternalhit)/.test(s)) return 'crawler'
  if (/(curl|wget|python-requests|httpx|axios|node-fetch|go-http|okhttp)/.test(s)) return 'script'
  if (/mozilla|safari|chrome|firefox|edge/.test(s)) return 'browser'
  return 'other'
}

const counts = {
  total: 0,
  surface: Object.create(null),   // paper / canvas / skill / figure / api / app
  caller: Object.create(null),    // browser / agent / script / crawler / other
  apiEndpoint: Object.create(null),
  referrer: { direct: 0, external: 0 },
  day: Object.create(null)        // YYYY-MM-DD -> count, so trend survives a restart in logs
}

const bump = (obj, key) => { obj[key] = (obj[key] || 0) + 1 }

export function analytics(req, _res, next) {
  const surface = surfaceOf(req.path)
  if (!surface) return next()

  counts.total++
  bump(counts.surface, surface)
  bump(counts.caller, callerClass(req.get('user-agent')))
  bump(counts.day, new Date().toISOString().slice(0, 10))

  // Endpoint-level detail for the API only — that is where usage shape is
  // interesting and where the path itself carries no personal information.
  if (surface === 'api') bump(counts.apiEndpoint, req.path)

  // Referrer reduced to a single bit: did someone link to us, or was this direct?
  // The URL itself is not retained, because it can identify a private page.
  const ref = req.get('referer') || ''
  if (!ref) counts.referrer.direct++
  else if (!ref.includes(req.get('host') || '')) counts.referrer.external++

  // Send the surfaces a script tag cannot see to the same dashboard as the ones it can.
  forwardToGoatCounter(req, surface)

  next()
}

export function snapshot() {
  const uptimeH = (Date.now() - started) / 3.6e6
  return {
    note: 'Counts only. No IPs, no cookies, no identifiers, no user-agent strings, no referrer URLs, no per-request records. Published openly because a project arguing for provenance should not measure its readers in private.',
    since: new Date(started).toISOString(),
    uptimeHours: Math.round(uptimeH * 10) / 10,
    total: counts.total,
    perHour: uptimeH > 0 ? Math.round((counts.total / uptimeH) * 10) / 10 : 0,
    surface: { ...counts.surface },
    caller: { ...counts.caller },
    apiEndpoint: { ...counts.apiEndpoint },
    referrer: { ...counts.referrer },
    day: { ...counts.day },
    durability: 'In-memory. Render free tier has an ephemeral filesystem and sleeps the service, so totals are emitted to the log every 15 minutes and survive there rather than here.'
  }
}

// One structured line, greppable out of Render's log retention. Cheaper and more
// durable than any store this project would otherwise have to add.
export function startAnalyticsLog(intervalMs = 15 * 60 * 1000) {
  const emit = () => {
    if (!counts.total) return
    console.log('ANALYTICS ' + JSON.stringify({
      at: new Date().toISOString(),
      total: counts.total,
      surface: counts.surface,
      caller: counts.caller,
      api: counts.apiEndpoint
    }))
  }
  const t = setInterval(emit, intervalMs)
  if (t.unref) t.unref()
  process.on('SIGTERM', emit)   // do not lose the last window on a deploy
  return emit
}

// FORWARD THE INVISIBLE SURFACES TO GOATCOUNTER.
//
// GoatCounter's script tag can only count things that execute JavaScript, so on its
// own it reports nothing for /paper.md, /canvas.md, /SKILL.md, /figures/* or the API —
// which is most of what this project publishes. GoatCounter also exposes a plain GET
// /count endpoint intended for exactly this case, so those hits are forwarded
// server-side and land in the same dashboard as the page views.
//
// PRIVACY: the visitor's IP is deliberately NOT forwarded. GoatCounter accepts an
// X-Forwarded-For and would use it for its own visitor counting; sending it would
// mean this server hands a third party an address it has itself chosen not to keep.
// The cost is that these hits count as pageviews without unique-visitor resolution,
// which is the right trade for a project that argues about provenance.
//
// Fire-and-forget: never awaited, never blocks a response, and a failure is silent
// because analytics must not be able to take down the thing it is measuring.
const GC = process.env.GOATCOUNTER_URL || 'https://brettleehari.goatcounter.com/count'
const GC_ENABLED = process.env.GOATCOUNTER_DISABLE !== '1' && process.env.NODE_ENV === 'production'

const GC_TITLE = {
  paper: 'Paper (markdown)', canvas: 'Canvas', skill: 'SKILL.md (agent contract)',
  figure: 'Figure', api: 'API'
}

export function forwardToGoatCounter(req, surface) {
  // 'app' is already counted by the browser script; forwarding it would double-count.
  if (!GC_ENABLED || surface === 'app') return
  try {
    const u = new URL(GC)
    u.searchParams.set('p', req.path)
    u.searchParams.set('t', GC_TITLE[surface] || surface)
    const ref = req.get('referer')
    if (ref) u.searchParams.set('r', ref)
    fetch(u, {
      method: 'GET',
      headers: { 'User-Agent': req.get('user-agent') || 'opentoken-server' }
      // No X-Forwarded-For on purpose — see above.
    }).catch(() => {})
  } catch { /* never let counting break serving */ }
}
