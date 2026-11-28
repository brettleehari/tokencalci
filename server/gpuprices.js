// LIVE GPU RENTAL PRICES from the Vast.ai public marketplace.
//
// Why this exists: the tool dates every model price and refuses to show one
// without an as-of stamp — then multiplied it against a hardcoded $2.50/hr H100
// with no date and no source. Two of the three inputs to every break-even were
// the least-sourced numbers in the codebase. This closes that.
//
// What this feed IS: real, currently-rentable offers on a community GPU
// marketplace, with the full min/median/max spread across hosts.
// What it is NOT: enterprise pricing. Vast hosts are largely community/spot
// capacity, so the median here sits BELOW what a hyperscaler or a contracted
// neocloud charges for the same card. The spread is reported so the user can
// choose where in it they actually live; `tier` labels the reading.
//
// Purchase price (capex) has no comparable open feed, so it stays a dated,
// sourced constant in hwdata.js — labelled as such rather than implied live.

const API = 'https://console.vast.ai/api/v0/bundles/'
const TTL_MS = 6 * 60 * 60 * 1000 // 6h, matching the model price feed

let cache = null

// Catalog GPU id -> the gpu_name Vast reports. Names must match exactly.
const VAST_NAMES = {
  rtx4090: 'RTX 4090',
  l40s: 'L40S',
  a100: 'A100 SXM4',
  h100: 'H100 SXM',
  h200: 'H200',
  b200: 'B200'
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const round = (n) => Math.round(n * 1000) / 1000

async function fetchOne(gpuName, signal) {
  const q = JSON.stringify({ limit: 300, gpu_name: { eq: gpuName }, rentable: { eq: true } })
  const res = await fetch(`${API}?q=${encodeURIComponent(q)}`, {
    signal, headers: { 'User-Agent': 'tokencalci' }
  })
  if (!res.ok) throw new Error(`vast ${res.status}`)
  const data = await res.json()
  const offers = data?.offers || []

  // Normalise to $/GPU-hour: dph_total is for the whole bundle, which may hold
  // several GPUs. Comparing bundle prices across 1x and 8x machines would be
  // meaningless, so divide through.
  const perGpu = offers
    .map((o) => {
      const n = o.num_gpus || 1
      return o.dph_total && n > 0 ? o.dph_total / n : null
    })
    .filter((v) => v != null && v > 0)

  if (!perGpu.length) return null
  return {
    n: perGpu.length,
    min: round(Math.min(...perGpu)),
    median: round(median(perGpu)),
    max: round(Math.max(...perGpu))
  }
}

export async function getGpuPrices() {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 20000)
  const gpus = {}
  let ok = 0

  try {
    const entries = Object.entries(VAST_NAMES)
    const results = await Promise.allSettled(
      entries.map(([, name]) => fetchOne(name, controller.signal))
    )
    results.forEach((r, i) => {
      const [id, name] = entries[i]
      if (r.status === 'fulfilled' && r.value) {
        gpus[id] = { ...r.value, vastName: name }
        ok++
      }
    })
  } catch {
    // fall through — partial results are still useful
  } finally {
    clearTimeout(t)
  }

  cache = {
    asOf: new Date().toISOString().slice(0, 10),
    fetchedAt: Date.now(),
    live: ok > 0,
    source: ok > 0
      ? 'Vast.ai public marketplace (live, currently-rentable offers)'
      : 'Vast.ai unavailable — falling back to dated constants in hwdata.js',
    tier: 'community-marketplace',
    covered: ok,
    gpus,
    caveats: [
      'Vast.ai is a community/spot marketplace: the median here sits BELOW contracted neocloud or hyperscaler pricing for the same card. Use max, or the constants, if you are buying enterprise capacity.',
      'Only currently-rentable offers are counted, so the sample shifts with market supply and the spread can be wide.',
      'Prices are per GPU-hour, derived by dividing a bundle price by its GPU count.',
      'Purchase price (capex) is NOT from this feed — it is a dated constant, since no comparable open feed exists.'
    ]
  }
  return cache
}
