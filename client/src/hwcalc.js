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
export function modelEconomics(model, gpu, precision, opts) {
  const { mode, utilization, amortMonths, kwhCost, pue, overheadPct, laborMonthly } = opts
  const numGpus = gpusNeeded(model, gpu, precision)
  const vram = vramNeed(model, precision)
  const tps = aggTokPerSec(model, gpu, precision, numGpus)
  const tokensPerMin = tps * 60

  const capex = gpu.capex * numGpus

  const computeMonthly =
    mode === 'rent' ? gpu.rentHr * numGpus * HOURS_MO : capex / amortMonths
  const powerMonthly =
    mode === 'rent' ? 0 : (gpu.powerW / 1000) * pue * numGpus * HOURS_MO * kwhCost
  const opexMonthly = (computeMonthly + powerMonthly + laborMonthly) * (1 + overheadPct / 100)

  // Capacity you can actually serve per month at target utilization.
  const capacityTokens = tps * SECS_MO * (utilization / 100)
  const selfHostPer1M = capacityTokens > 0 ? opexMonthly / (capacityTokens / 1e6) : Infinity

  // Break-even vs API: the daily token volume where the API bill for THIS model
  // equals the fixed self-host opex. Below it, API wins; above it, self-host does
  // (until you hit capacity and must add GPUs).
  const apiPerToken = model.apiPer1M / 1e6
  const breakEvenTokensPerMonth = apiPerToken > 0 ? opexMonthly / apiPerToken : Infinity
  const breakEvenTokensPerDay = breakEvenTokensPerMonth / 30
  const capacityTokensPerDay = capacityTokens / 30
  // Can a single fleet's capacity even reach the break-even volume?
  const reachable = breakEvenTokensPerDay <= capacityTokensPerDay

  return {
    numGpus, vram, tps, tokensPerMin, capex, opexMonthly,
    capacityTokens, capacityTokensPerDay, selfHostPer1M,
    apiPer1M: model.apiPer1M, breakEvenTokensPerDay, reachable,
    // ratio < 1 means self-host is cheaper per token at full utilization
    ratio: selfHostPer1M / model.apiPer1M
  }
}

export function fmtGB(n) { return n >= 1000 ? (n / 1000).toFixed(1) + ' TB' : n + ' GB' }
export function fmtTokMin(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M/min'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K/min'
  return Math.round(n) + '/min'
}
