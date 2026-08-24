// ONE-OFF (re-runnable) BACKFILL: builds a real price history from the LiteLLM
// feed's own git history, rather than asserting a decline rate.
//
// Why this exists: the tool projects falling prices in several places (the 5-year
// view, the sovereignty premium, the LLMflation scenario) off an ASSUMED ~10x/yr
// decline. That assumption is widely repeated and rarely checked. LiteLLM has
// committed a dated price file for years, so the real series is recoverable —
// and once recovered, the projection can be measured instead of asserted.
//
// Run: node server/backfill-history.js [months]
// Writes: server/price-history.json
//
// Unauthenticated GitHub API allows 60 req/hr; this uses ~2 per sampled month.

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { MODELS, MODEL_MATCH } from '../client/src/hwdata.js'
import { resolvePrice } from '../client/src/pricing.js'
import { FRONTIER, resolveFrontier } from '../client/src/pricing.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = 'BerriAI/litellm'
const PATH = 'model_prices_and_context_window.json'
const PER_M = 1_000_000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function gh(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'opentoken-backfill', Accept: 'application/vnd.github+json' }
  })
  if (res.status === 403) throw new Error('GitHub rate limit hit — wait an hour or set GITHUB_TOKEN')
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`)
  return res.json()
}

// Last commit touching the price file at or before `until`.
async function commitAt(until) {
  const list = await gh(`https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(PATH)}&until=${until}&per_page=1`)
  if (!Array.isArray(list) || !list.length) return null
  return { sha: list[0].sha, date: list[0].commit.committer.date.slice(0, 10) }
}

async function fileAt(sha) {
  const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/${PATH}`)
  if (!res.ok) throw new Error(`raw ${res.status} for ${sha}`)
  return res.json()
}

// Same normalization the live path uses, so historical and current numbers are
// directly comparable rather than "close enough".
function normalize(raw) {
  const prices = {}
  for (const [key, v] of Object.entries(raw)) {
    if (key === 'sample_spec') continue
    const inCost = v.input_cost_per_token
    const outCost = v.output_cost_per_token
    if (typeof inCost !== 'number' || typeof outCost !== 'number') continue
    const mode = v.mode || 'chat'
    if (mode !== 'chat' && mode !== 'completion') continue
    prices[key] = {
      in: Math.round(inCost * PER_M * 1e6) / 1e6,
      out: Math.round(outCost * PER_M * 1e6) / 1e6,
      cacheRead: typeof v.cache_read_input_token_cost === 'number'
        ? Math.round(v.cache_read_input_token_cost * PER_M * 1e6) / 1e6 : null,
      provider: v.litellm_provider || null
    }
  }
  return prices
}

// Monthly sample points going back `months`, oldest first.
function samplePoints(months) {
  const out = []
  const now = new Date('2026-07-31T00:00:00Z')
  for (let i = months; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15))
    if (d > now) continue
    out.push(d.toISOString())
  }
  return out
}

async function main() {
  const months = Number(process.argv[2] || 18)
  const points = samplePoints(months)
  console.log(`Backfilling ${points.length} monthly samples from ${REPO}...`)

  const series = []
  const seenSha = new Set()

  for (const until of points) {
    let c
    try {
      c = await commitAt(until)
    } catch (err) {
      console.error(`  ${until.slice(0, 10)}: ${err.message}`)
      break
    }
    if (!c || seenSha.has(c.sha)) {
      console.log(`  ${until.slice(0, 10)}: no distinct commit, skipping`)
      continue
    }
    seenSha.add(c.sha)

    let raw
    try {
      raw = await fileAt(c.sha)
    } catch (err) {
      console.error(`  ${c.date}: ${err.message}`)
      continue
    }

    const feed = { prices: normalize(raw), asOf: c.date }

    // Resolve OUR catalog through the SAME matcher used live, so a point in the
    // series means the same thing as today's number.
    const models = {}
    for (const m of MODELS) {
      const p = resolvePrice(feed, MODEL_MATCH[m.id])
      if (p) models[m.id] = { in: p.in, out: p.out, providers: p.spread.n }
    }
    const frontier = {}
    for (const f of FRONTIER) {
      const p = resolveFrontier(feed, f.keys)
      if (p) frontier[f.id] = { in: p.in, out: p.out }
    }

    series.push({ date: c.date, sha: c.sha.slice(0, 10), feedKeys: Object.keys(feed.prices).length, models, frontier })
    console.log(`  ${c.date}  keys=${Object.keys(feed.prices).length}  catalog=${Object.keys(models).length}  frontier=${Object.keys(frontier).length}`)
    await sleep(400) // be polite to raw.githubusercontent
  }

  const out = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: `git history of ${REPO}/${PATH}`,
    note: 'Each point is the LiteLLM price file as committed on that date, normalized and resolved through the same matcher the live app uses.',
    points: series.length,
    series
  }
  await writeFile(join(__dirname, 'price-history.json'), JSON.stringify(out, null, 2))
  console.log(`\nWrote server/price-history.json — ${series.length} points, ${series[0]?.date} → ${series[series.length - 1]?.date}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
