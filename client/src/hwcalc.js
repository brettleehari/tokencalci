// Derives, per model on a chosen GPU: VRAM footprint, GPUs needed, capex, monthly
// opex, tokens/min capacity, self-host $/1M, and break-even vs that model's API
// price. Everything here is a pure function of hwdata.js inputs + the settings.

import { GPUS, PRECISIONS } from './hwdata.js'
import { throughputFor } from './throughput.js'

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
//
// Now sourced from published benchmarks rather than a step function — see
// throughput.js. The important behavioural change: this NO LONGER multiplies by
// GPU count. Measured data shows tensor parallelism buys capacity to fit a model,
// not speed, so eight GPUs deliver roughly what one does.
export function aggTokPerSec(model, gpu, precision, numGpus) {
  return throughputFor({
    activeB: model.active,
    totalB: model.params,
    gpuId: gpu.id,
    precision,
    numGpus
  }).totalTokPerSec
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
const MIN_DAY = 1440

// Batch APIs (OpenAI, Anthropic, Gemini) trade latency for a 50% discount. One
// number because all three major providers landed on the same 50%.
const BATCH_DISCOUNT = 0.5
// Where a provider publishes no cache-read rate, assume 10% of the input rate —
// the ratio the providers that DO publish one cluster around. Always flagged as
// an estimate so it never passes for a quoted price.
const CACHE_READ_FALLBACK_RATIO = 0.1

const clampPct = (n) => Math.min(100, Math.max(0, Number(n) || 0))

// Translate a workload stated the way humans state it (requests/day and average
// prompt/response sizes) into the peak-and-duty pair the fleet math needs.
//
// The mapping is exact, not a fudge. If daily tokens are spread over 24h with a
// peak-to-average ratio R:
//   avg tokens/min = dailyTokens / 1440
//   peak           = avg × R
//   duty           = M / (peak × 43200) = 1/R
// So peakiness and duty cycle are the same knob viewed from two ends: a perfectly
// flat batch pipeline (R=1) runs at 100% duty; consumer-spiky traffic (R=4) at 25%.
// Traffic shapes, expressed as peak-to-average ratios. Shared by every view that
// asks for a workload so the vocabulary stays consistent.
export const TRAFFIC_SHAPES = [
  { id: 1, label: 'Flat — batch/offline', hint: 'runs 24×7 at a steady rate' },
  { id: 2.5, label: 'Business hours', hint: 'weekday working-hours peak' },
  { id: 4, label: 'Consumer-spiky', hint: 'sharp evening/launch peaks' }
]

export function deriveWorkload({ dailyRequests, avgTokensIn, avgTokensOut, peakiness = 3 }) {
  const perRequest = Math.max(0, avgTokensIn) + Math.max(0, avgTokensOut)
  const dailyTokens = Math.max(0, dailyRequests) * perRequest
  const R = Math.max(1, peakiness)
  const avgTokPerMin = dailyTokens / MIN_DAY
  return {
    dailyTokens,
    perRequest,
    avgTokPerMin,
    peakTokPerMin: avgTokPerMin * R,
    dutyPct: 100 / R,
    outputShare: perRequest > 0 ? Math.max(0, avgTokensOut) / perRequest : 0
  }
}

// What the API side ACTUALLY costs, given real input/output rates plus the two
// discounts every serious team uses and no competitor models: prompt caching
// (priced per the feed's cache_read rate) and batch submission.
//
// Curated models only ever had a single blended figure, so cache/batch modeling
// is skipped for them rather than applied to an invented input/output split.
export function apiPricing(price, { monthlyTokens, outputShare, cacheHitPct = 0, batchPct = 0 }) {
  const share = Math.min(1, Math.max(0, outputShare))
  const outTokens = monthlyTokens * share
  const inTokens = monthlyTokens - outTokens
  const batchFactor = 1 - BATCH_DISCOUNT * (clampPct(batchPct) / 100)

  const hasSplit = price && typeof price.in === 'number' && typeof price.out === 'number'
  if (!hasSplit) {
    const listPer1M = price?.blendedOnly ?? 0
    const monthly = (monthlyTokens / 1e6) * listPer1M * batchFactor
    return {
      monthly, listPer1M,
      effectivePer1M: monthlyTokens > 0 ? monthly / (monthlyTokens / 1e6) : 0,
      cacheApplied: false, cacheReadRate: null, cacheReadIsEstimate: true,
      batchFactor, splitPricing: false
    }
  }

  const hit = clampPct(cacheHitPct) / 100
  const cachedIn = inTokens * hit
  const freshIn = inTokens - cachedIn
  const cacheReadRate = typeof price.cacheRead === 'number'
    ? price.cacheRead
    : price.in * CACHE_READ_FALLBACK_RATIO

  const gross = (freshIn * price.in + cachedIn * cacheReadRate + outTokens * price.out) / 1e6
  const monthly = gross * batchFactor

  return {
    monthly,
    // List price blended at THIS workload's real in:out ratio — not a hardcoded 75/25.
    listPer1M: price.in * (1 - share) + price.out * share,
    effectivePer1M: monthlyTokens > 0 ? monthly / (monthlyTokens / 1e6) : 0,
    cacheApplied: hit > 0,
    cacheReadRate,
    cacheReadIsEstimate: !!price.cacheReadIsEstimate || typeof price.cacheRead !== 'number',
    batchFactor,
    splitPricing: true
  }
}

// GPUs to MEET PEAK demand.
//
// Restructured once the benchmarks showed tensor parallelism does not add
// throughput. You scale a serving fleet in two independent directions:
//
//   WIDTH    — GPUs per replica, set purely by VRAM fit. Splitting a model
//              across more GPUs lets it fit; it does not make it faster.
//   REPLICAS — full copies of the model. THIS is how throughput scales. Each
//              replica adds its own tokens/sec and its own GPU bill.
//
// The old code grew a single fleet until it was fast enough, which silently
// assumed width bought speed. It doesn't, and modelling it that way understated
// the hardware a real deployment needs.
export function gpusForDemand(model, gpu, precision, peakTokPerMin) {
  const gpusPerReplica = gpusNeeded(model, gpu, precision)
  const replicaTokMin = aggTokPerSec(model, gpu, precision, gpusPerReplica) * 60
  const replicas = replicaTokMin > 0
    ? Math.max(1, Math.ceil(peakTokPerMin / replicaTokMin))
    : 1
  const numGpus = gpusPerReplica * replicas
  return {
    numGpus,
    replicas,
    gpusPerReplica,
    replicaTokMin,
    floorVram: gpusPerReplica,
    gpusForTput: numGpus,
    perGpuTokMin: replicaTokMin / gpusPerReplica
  }
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
    peakTokPerMin = 100000, dutyPct = 100, haFactor = 1,
    // Pricing shape: output share of tokens, plus the API-side discounts.
    outputShare = 0.25, cacheHitPct = 0, batchPct = 0
  } = opts

  const vram = vramNeed(model, precision)
  const { numGpus: usableGpus, floorVram } = gpusForDemand(model, gpu, precision, peakTokPerMin)
  // Redundant/standby GPUs add cost but NOT usable capacity (HA for sovereign etc.)
  const numGpus = Math.ceil(usableGpus * haFactor)
  const { replicas, gpusPerReplica, replicaTokMin } = gpusForDemand(model, gpu, precision, peakTokPerMin)
  const capacityTokMin = replicaTokMin * replicas

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
  // Priced from real input/output rates at this workload's ratio, after cache
  // and batch discounts. `price` falls back to the legacy scalar for old callers.
  const price = model.price || { in: null, out: null, blendedOnly: model.apiPer1M }
  const api = apiPricing(price, { monthlyTokens, outputShare, cacheHitPct, batchPct })
  const apiMonthly = api.monthly
  const apiPer1M = api.effectivePer1M

  // Break-even duty: the duty cycle at which the two costs meet (fleet size fixed).
  const apiPerMonthAtFullDuty = duty > 0 ? apiMonthly / duty : 0
  const breakEvenDuty = apiPerMonthAtFullDuty > 0 ? selfHostMonthly / apiPerMonthAtFullDuty : Infinity

  // Same crossover said two other ways, because "duty cycle" is the right model
  // but "tokens/day" and "months to payback" are what people quote to a CFO.
  //   tokens/day  — sustained volume at which the API bill equals fixed self-host cost
  //   payback     — months for the API savings to repay the hardware (own basis only;
  //                 renting has no capex to repay, so it is null there)
  //
  // The tokens/day figure holds selfHostMonthly fixed while scaling volume, which
  // silently assumes this fleet can serve any number of tokens. It cannot: it was
  // sized for peakTokPerMin. Reporting a break-even the hardware physically cannot
  // reach is worse than reporting none, because it looks actionable — so cap it at
  // what the fleet can actually deliver and return null beyond that, matching how
  // breakEvenDuty already reports "never" above 100%.
  const fleetCeilingPerDay = capacityTokMin * 60 * 24
  const rawBreakEvenTokensPerDay = apiPer1M > 0 ? (selfHostMonthly / apiPer1M) * 1e6 / 30 : Infinity
  const breakEvenTokensPerDay =
    isFinite(rawBreakEvenTokensPerDay) && rawBreakEvenTokensPerDay <= fleetCeilingPerDay
      ? rawBreakEvenTokensPerDay
      : null
  // Kept so the UI can explain WHY there is no break-even rather than just omitting it.
  const breakEvenExceedsCapacity = breakEvenTokensPerDay === null && isFinite(rawBreakEvenTokensPerDay)
  const opexExCapex = selfHostMonthly - (mode === 'own' ? breakdown.compute + breakdown.compute * (overheadPct / 100) : 0)
  const monthlySaving = apiMonthly - opexExCapex
  const paybackMonths = mode === 'own' && monthlySaving > 0 ? capex / monthlySaving : null

  return {
    vram, numGpus, usableGpus, floorVram, capacityTokMin, capex,
    selfHostMonthly, apiMonthly, monthlyTokens, fleetUtil, breakdown,
    selfHostPer1M, apiPer1M,
    api,                    // full API-side detail: list vs effective, cache, batch
    breakEvenDuty,          // duty (0..1); if >1, self-host never wins even at 100% duty
    breakEvenTokensPerDay,  // null when unreachable by this fleet — see above
    breakEvenExceedsCapacity,
    fleetCeilingPerDay,
    paybackMonths,          // null when renting, or when self-host never repays
    winsSelfHost: selfHostMonthly < apiMonthly,
    ratio: apiMonthly > 0 ? selfHostMonthly / apiMonthly : Infinity
  }
}

// COST DECOMPOSITION — why running it yourself costs what it costs.
//
// The thesis this exists to make visible: open weights are free, open INFERENCE
// is not. A calculator that only reports "the neocloud is cheaper" teaches the
// conclusion and hides the mechanism. This walks the gap, term by term.
//
// The construction matters. We build YOUR cost up from the floor rather than
// discounting theirs down:
//
//   1. Bare compute at FULL TILT — your GPUs running flat out, paying only for
//      the hardware. No people, no power, no overhead, no idle. The physical
//      floor of what tokens cost you.
//   2. + facility  — power, cooling, space.
//   3. + operations — the engineers who keep the serving stack alive, plus overhead.
//   4. ÷ utilisation — you provisioned for peak and run at your duty cycle.
//
// Step 1 is the load-bearing one. If a neocloud sells tokens BELOW your bare
// compute cost at perfect utilisation, no amount of operational discipline on
// your side closes that gap, because everything else has already been stripped
// out. What remains is exactly two things — tokens per GPU-hour (serving
// engineering) and dollars per GPU-hour (scale) — plus, honestly, whatever
// portion is being subsidised. That residual is the part of the stack the
// weights do not include and the discourse does not price.
export function decomposeCost(e) {
  if (!e || !isFinite(e.selfHostPer1M)) return null

  const MILLIONS_AT_FULL_TILT = (e.capacityTokMin * MIN_MO) / 1e6
  if (!(MILLIONS_AT_FULL_TILT > 0)) return null

  const b = e.breakdown
  const per = (usd) => usd / MILLIONS_AT_FULL_TILT

  const bareCompute = per(b.compute)
  const withFacility = per(b.compute + b.power + b.space)
  const fullyLoaded = per(b.compute + b.power + b.space + b.personnel + b.overhead)
  const actual = e.selfHostPer1M // fully loaded, divided by real utilisation

  const neo = e.apiPer1M
  const steps = [
    { id: 'compute', label: 'Bare GPU compute', sub: 'hardware only, running flat out', value: bareCompute, delta: bareCompute },
    { id: 'facility', label: 'Power, space, cooling', sub: 'energy metered at PUE, colo rent', value: withFacility, delta: withFacility - bareCompute },
    { id: 'ops', label: 'Operations', sub: 'engineers to run the stack, plus overhead', value: fullyLoaded, delta: fullyLoaded - withFacility },
    { id: 'idle', label: 'Idle capacity', sub: `provisioned for peak, running at ${(e.fleetUtil * 100).toFixed(0)}% utilisation`, value: actual, delta: actual - fullyLoaded }
  ]

  return {
    neocloudPer1M: neo,
    selfHostPer1M: actual,
    multiple: neo > 0 ? actual / neo : Infinity,
    steps,
    utilisation: e.fleetUtil,
    // The residual after every operational excuse is removed. This is the number
    // the thesis rests on.
    floor: {
      per1M: bareCompute,
      multipleOfNeocloud: neo > 0 ? bareCompute / neo : Infinity,
      // True when bare metal at perfect utilisation still loses. When this holds,
      // the gap is structural, not a matter of running your fleet better.
      losesEvenAtPerfectUtilisation: bareCompute > neo
    },
    // How much of the total gap each cause is responsible for.
    //
    // The compute term is signed on purpose. When a sparse model lets your bare
    // metal beat the neocloud's price, that term is NEGATIVE — a genuine
    // advantage — and clamping it to zero would push the other shares past 100%
    // and hide the most interesting case the tool can find.
    shareOfGap: (() => {
      const total = actual - neo
      if (!(total > 0)) return null
      return {
        compute: (bareCompute - neo) / total,
        facility: (withFacility - bareCompute) / total,
        ops: (fullyLoaded - withFacility) / total,
        idle: (actual - fullyLoaded) / total
      }
    })()
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
