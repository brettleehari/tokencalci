// Derives, per model on a chosen GPU: VRAM footprint, GPUs needed, capex, monthly
// opex, tokens/min capacity, self-host $/1M, and break-even vs that model's API
// price. Everything here is a pure function of hwdata.js inputs + the settings.

import { GPUS, PRECISIONS, baseAggTokPerSec } from './hwdata.js'

const HOURS_MO = 720
const SECS_MO = 30 * 86400

// VRAM needed (GB): weights at precision + ~30% for KV-cache/activations headroom.
export function vramNeed(model, precision) {
  const prec = PRECISIONS.find((p) => p.id === precision) || PRECISIONS[0]
  const weights = model.params * prec.bytesPerParam
  return Math.ceil(weights * 1.3)
}

// GPUs needed = VRAM fit (can't run a model that doesn't fit in aggregate VRAM).
export function gpusNeeded(model, gpu, precision) {
  return Math.max(1, Math.ceil(vramNeed(model, precision) / gpu.vram))
}

// Aggregate serving throughput (tokens/sec) for the fleet.
export function aggTokPerSec(model, gpu, precision, numGpus) {
  const prec = PRECISIONS.find((p) => p.id === precision) || PRECISIONS[0]
  const perGpu = baseAggTokPerSec(model.active) * gpu.tputMul * prec.tputMul
  // Multi-GPU scaling is sub-linear (tensor-parallel comms overhead).
  const scale = numGpus === 1 ? 1 : numGpus * 0.8
  return perGpu * scale
}

// Full economics for one model on one GPU choice.
// Self-host capex = (GPU + rest-of-node incl. system RAM) × GPUs.
// Self-host opex buckets:
//   compute  — GPU rental (rent) OR node capex amortized (own)
//   power    — energy metered at kWh × PUE (own only; rental bundles it)
//   space    — colo/rack rent per provisioned kW (own only; rental bundles it)
//   people   — engineer time to run the serving stack — applies to BOTH rent and
//              own, because you self-manage the stack either way. It is ZERO only
//              on the neocloud-API side, which is the whole point of the compare.
const MIN_MO = 30 * 24 * 60 // 43,200 minutes per month

// GPUs to MEET PEAK demand: enough VRAM to load the model AND enough throughput
// to serve `peakTokPerMin` at the fleet's (sub-linearly scaled) rate.
export function gpusForDemand(model, gpu, precision, peakTokPerMin) {
  const floorVram = gpusNeeded(model, gpu, precision)
  const perGpuTokMin = aggTokPerSec(model, gpu, precision, 1) * 60
  let n = floorVram
  while (aggTokPerSec(model, gpu, precision, n) * 60 < peakTokPerMin) n++
  return { numGpus: n, floorVram, gpusForTput: Math.max(floorVram, n), perGpuTokMin }
}

// Demand-aware economics. The core asymmetry:
//   Self-host cost is FIXED — you provision for PEAK and pay 24×7 regardless of
//   idle. API cost is VARIABLE — you pay only for tokens actually consumed.
//
//   peak p  = tokens/min you must be able to serve  (sizes the fleet)
//   duty d  = fraction of time you actually need peak (0..1)  → average = p·d
//   tokens actually served  M = p · d · 43200  (min/month)
//   self-host TCO  C_self = amortized capex + power + space + people + overhead   (FIXED)
//   neocloud bill  C_api  = (M / 1e6) · price_per_1M                              (VARIABLE)
//   fleet utilization  U  = M / capacity  ≈ d      (idle cliff when d is low)
//   $/1M self-host = C_self / (M/1e6)      (explodes as d → 0)
//   break-even duty d* where C_api == C_self
export function modelEconomics(model, gpu, precision, opts) {
  const {
    mode, amortMonths, kwhCost, pue, overheadPct,
    personnelMonthly = 0, spacePerKwMonth = 0,
    peakTokPerMin = 100000, dutyPct = 100, haFactor = 1
  } = opts

  const vram = vramNeed(model, precision)
  const { numGpus: usableGpus, floorVram } = gpusForDemand(model, gpu, precision, peakTokPerMin)
  // Redundant/standby GPUs add cost but NOT usable capacity (HA for sovereign etc.)
  const numGpus = Math.ceil(usableGpus * haFactor)
  const capacityTokMin = aggTokPerSec(model, gpu, precision, usableGpus) * 60

  const capex = (gpu.capex + (gpu.nodePerGpu || 0)) * numGpus
  const itKw = (gpu.powerW * numGpus) / 1000

  const computeMonthly = mode === 'rent' ? gpu.rentHr * numGpus * HOURS_MO : capex / amortMonths
  const powerMonthly = mode === 'rent' ? 0 : itKw * pue * HOURS_MO * kwhCost
  const spaceMonthly = mode === 'rent' ? 0 : itKw * spacePerKwMonth
  const baseOpex = computeMonthly + powerMonthly + spaceMonthly + personnelMonthly
  const overheadMonthly = baseOpex * (overheadPct / 100)
  // FIXED monthly self-host cost — independent of how many tokens you actually use.
  const selfHostMonthly = baseOpex + overheadMonthly
  const breakdown = {
    compute: computeMonthly, power: powerMonthly, space: spaceMonthly,
    personnel: personnelMonthly, overhead: overheadMonthly
  }

  const duty = dutyPct / 100
  const monthlyTokens = peakTokPerMin * duty * MIN_MO          // M
  const fleetUtil = capacityTokMin > 0 ? (peakTokPerMin * duty) / capacityTokMin : 0
  const selfHostPer1M = monthlyTokens > 0 ? selfHostMonthly / (monthlyTokens / 1e6) : Infinity

  // Neocloud API side — VARIABLE, scales with actual usage; idle is free.
  const apiMonthly = (monthlyTokens / 1e6) * model.apiPer1M

  // Break-even duty: the duty cycle at which the two costs meet (fleet size fixed).
  const apiPerMonthAtFullDuty = ((peakTokPerMin * MIN_MO) / 1e6) * model.apiPer1M
  const breakEvenDuty = apiPerMonthAtFullDuty > 0 ? selfHostMonthly / apiPerMonthAtFullDuty : Infinity

  return {
    vram, numGpus, usableGpus, floorVram, capacityTokMin, capex,
    selfHostMonthly, apiMonthly, monthlyTokens, fleetUtil, breakdown,
    selfHostPer1M, apiPer1M: model.apiPer1M,
    breakEvenDuty, // duty (0..1); if >1, self-host never wins even at 100% duty
    winsSelfHost: selfHostMonthly < apiMonthly,
    ratio: apiMonthly > 0 ? selfHostMonthly / apiMonthly : Infinity
  }
}

// Project sovereign $/1M (fixed) against the neocloud price falling at driftPct/yr
// (LLMflation). Returns a monthly series and the premium multiple over time.
export function sovereignProjection({ sovPer1M, neoPer1M0, driftPctPerYear, months }) {
  const monthlyFactor = Math.pow(1 - driftPctPerYear / 100, 1 / 12)
  const series = []
  for (let m = 0; m <= months; m++) {
    const neo = neoPer1M0 * Math.pow(monthlyFactor, m)
    series.push({ month: m, sovereign: sovPer1M, neocloud: neo, premium: neo > 0 ? sovPer1M / neo : Infinity })
  }
  return series
}

export function fmtGB(n) { return n >= 1000 ? (n / 1000).toFixed(1) + ' TB' : n + ' GB' }
export function fmtTokMin(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M/min'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K/min'
  return Math.round(n) + '/min'
}
