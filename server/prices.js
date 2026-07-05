// Fetches LiteLLM's open price feed server-side (no CORS), normalizes to $/1M
// tokens, caches for 6h, and falls back to a bundled snapshot so the tool never
// shows a blank. Every response carries an as-of date and its source.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FEED_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
const TTL_MS = 6 * 60 * 60 * 1000 // 6h, matching LiteLLM's own refresh cadence

let cache = null // { asOf, source, prices }

const PER_M = 1_000_000

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
      in: round(inCost * PER_M),
      out: round(outCost * PER_M),
      cacheRead:
        typeof v.cache_read_input_token_cost === 'number'
          ? round(v.cache_read_input_token_cost * PER_M)
          : null,
      provider: v.litellm_provider || null,
      maxInput: v.max_input_tokens || v.max_tokens || null
    }
  }
  return prices
}

function round(n) {
  return Math.round(n * 1e6) / 1e6
}

async function loadSnapshot() {
  const txt = await readFile(join(__dirname, 'snapshot.json'), 'utf8')
  return JSON.parse(txt)
}

export async function getPrices() {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache

  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(FEED_URL, { signal: controller.signal })
    clearTimeout(t)
    if (!res.ok) throw new Error(`feed ${res.status}`)
    const raw = await res.json()
    cache = {
      asOf: new Date().toISOString().slice(0, 10),
      source: 'LiteLLM model_prices_and_context_window.json (live)',
      prices: normalize(raw),
      fetchedAt: Date.now(),
      live: true
    }
    return cache
  } catch (err) {
    // Fall back to bundled snapshot; keep its own as-of date so the UI is honest.
    const snap = await loadSnapshot()
    cache = {
      asOf: snap.asOf,
      source: `bundled snapshot (live feed unavailable: ${err.message})`,
      prices: snap.prices,
      fetchedAt: Date.now(),
      live: false
    }
    return cache
  }
}
