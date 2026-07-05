// All cost math, pure and client-side. Every number here traces to a UI input or
// the dated price feed — no hidden constants beyond the documented defaults.

const PER_M = 1_000_000
const DAYS = 30

// ---- API side ----------------------------------------------------------------

// Monthly API cost for one tier given its share of traffic and discounts.
// caching applies only to input tokens; batch discount applies to the whole bill.
export function apiTier({ workload, share, callsPerTask, price, cachePct, batchPct }) {
  const effReqs = workload.dailyRequests * (share / 100) * callsPerTask
  const dailyIn = effReqs * workload.inTok
  const dailyOut = effReqs * workload.outTok

  const cacheRead = price.cacheRead ?? price.in * 0.25 // if feed lacks it, assume conservative
  const cachedIn = dailyIn * (cachePct / 100)
  const freshIn = dailyIn - cachedIn
  const inCost = (freshIn * price.in + cachedIn * cacheRead) / PER_M
  const outCost = (dailyOut * price.out) / PER_M

  const batchFactor = 1 - (batchPct / 100) * 0.5 // Batch APIs are ~50% off
  const dailyCost = (inCost + outCost) * batchFactor

  return {
    monthly: dailyCost * DAYS,
    dailyTokens: dailyIn + dailyOut,
    monthlyTokens: (dailyIn + dailyOut) * DAYS,
    dailyOut
  }
}

// ---- Self-host side ----------------------------------------------------------

// Heuristic single-GPU throughput (tokens/sec) by parameter count. Directional
// only — real throughput swings with batch size, context, quantization, engine.
export function heuristicTokPerSec(params) {
  if (params <= 8) return 120
  if (params <= 24) return 70
  if (params <= 80) return 32
  return 18 // very large / MoE served on multi-GPU; treat as low per-GPU
}

// GPU VRAM need (GB) at fp16 ≈ 2 bytes/param + ~20% overhead for kv-cache/activations.
export function vramNeedGB(params) {
  return Math.ceil(params * 2 * 1.2)
}

// Self-host TCO for one tier. Fixed monthly opex once the GPU exists — that's the
// whole point of the idle-cliff: cost does NOT scale down with your volume.
export function selfHostTier({ apiTierResult, tco }) {
  const {
    mode, gpuHourly, gpuCapex, gpuVramGB, amortMonths, utilization,
    tokPerSec, powerW, pue, kwhCost, overheadPct, laborMonthly, ha, params
  } = tco

  // GPU count: max of VRAM fit, throughput need, and HA redundancy. Throughput is
  // decode-bound, so we size on OUTPUT tokens/sec (how serving engines quote it).
  const gpusForVram = Math.max(1, Math.ceil(vramNeedGB(params) / gpuVramGB))
  const requiredTps = apiTierResult.dailyOut / (86400 * (utilization / 100))
  const gpusForTput = Math.max(1, Math.ceil(requiredTps / tokPerSec))
  let numGpus = Math.max(gpusForVram, gpusForTput)
  if (ha) numGpus = Math.max(numGpus, gpusForVram * 2) // redundancy for availability

  // Fleet output-token capacity per month, then scaled to total tokens (in+out)
  // using this workload's ratio so $/1M is comparable to the API side.
  const capacityOutput = tokPerSec * numGpus * 86400 * DAYS * (utilization / 100)
  const dailyTotal = apiTierResult.dailyTokens
  const outToTotal = apiTierResult.dailyOut > 0 ? dailyTotal / apiTierResult.dailyOut : 1
  const capacityTokens = capacityOutput * outToTotal

  // Opex: compute + power (own only; rented usually bundles power) + labor + overhead.
  const computeMonthly =
    mode === 'rent'
      ? gpuHourly * numGpus * 24 * DAYS
      : (gpuCapex * numGpus) / amortMonths
  const powerMonthly =
    mode === 'rent'
      ? 0
      : (powerW / 1000) * pue * numGpus * 24 * DAYS * kwhCost
  const base = computeMonthly + powerMonthly + laborMonthly
  const monthlyOpex = base * (1 + overheadPct / 100)

  const yourTokens = apiTierResult.monthlyTokens
  const costPer1M_atVolume = yourTokens > 0 ? monthlyOpex / (yourTokens / PER_M) : Infinity
  const costPer1M_atCapacity = capacityTokens > 0 ? monthlyOpex / (capacityTokens / PER_M) : Infinity

  return {
    numGpus, gpusForVram, gpusForTput,
    capacityTokens,
    monthlyOpex,
    capex: mode === 'own' ? gpuCapex * numGpus : 0,
    costPer1M_atVolume,
    costPer1M_atCapacity,
    utilizationOfFleet: capacityTokens > 0 ? Math.min(1, yourTokens / capacityTokens) : 0
  }
}

// Break-even: the daily token volume at which API cost overtakes fixed self-host
// opex, plus capex payback in months. Uses the API cost-per-token at current mix.
export function breakEven({ apiTierResult, apiMonthly, selfHost }) {
  const apiPerToken = apiTierResult.monthlyTokens > 0 ? apiMonthly / apiTierResult.monthlyTokens : 0
  const breakEvenTokensPerMonth = apiPerToken > 0 ? selfHost.monthlyOpex / apiPerToken : Infinity
  const breakEvenTokensPerDay = breakEvenTokensPerMonth / DAYS

  const opexSaving = apiMonthly - selfHost.monthlyOpex // positive => self-host opex wins
  const paybackMonths = opexSaving > 0 && selfHost.capex > 0 ? selfHost.capex / opexSaving : null

  return { apiPerToken, breakEvenTokensPerDay, opexSaving, paybackMonths }
}

// LLMflation: project API cost forward if per-token prices keep falling. Returns
// whether the falling API line drops below fixed self-host opex within the window.
export function driftProjection({ apiMonthly, selfHostOpex, driftPctPerYear, months }) {
  const monthlyFactor = Math.pow(1 - driftPctPerYear / 100, 1 / 12)
  const series = []
  let apiUnderOpexAt = null
  for (let m = 0; m <= months; m++) {
    const api = apiMonthly * Math.pow(monthlyFactor, m)
    series.push({ month: m, api })
    if (apiUnderOpexAt === null && api < selfHostOpex) apiUnderOpexAt = m
  }
  return { series, apiUnderOpexAt }
}

// ---- formatting helpers ----
export function money(n) {
  if (!isFinite(n)) return '—'
  if (n >= 1000) return '$' + Math.round(n).toLocaleString()
  if (n >= 1) return '$' + n.toFixed(2)
  return '$' + n.toFixed(3)
}
export function compact(n) {
  if (!isFinite(n)) return '—'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return Math.round(n).toString()
}
