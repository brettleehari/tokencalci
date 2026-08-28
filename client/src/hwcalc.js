// Derives, per model on a chosen GPU: VRAM footprint, GPUs needed, capex, monthly
// opex, tokens/min capacity, self-host $/1M, and break-even vs that model's API
// price. Everything here is a pure function of hwdata.js inputs + the settings.

import { GPUS, PRECISIONS, kvArchFor } from './hwdata.js'
import { throughputFor } from './throughput.js'

const HOURS_MO = 720
const SECS_MO = 30 * 86400

// Serving context assumed when a caller does not state one. A replica has to hold
// KV for every concurrent request, so concurrency and sequence length are inputs to
// VRAM, not decorations — which is exactly what the old flat 1.3 multiplier hid.
// These defaults match the benchmark configuration the throughput model is fitted
// to (256 concurrent, 512 in / 512 out), so sizing and throughput describe the same
// machine rather than two different ones.
export const DEFAULT_SERVING = { ctxTokens: 1024, concurrency: 256 }

// KV cache bytes per token, per replica.
//   standard attention: 2 (K and V) x layers x kv_heads x head_dim x bytes
//   MLA: one compressed latent per layer, not per head — roughly an order of
//        magnitude smaller, which is the entire point of the architecture.
// KV is held at the serving precision here. Some stacks keep KV at fp8 while
// serving weights lower, or vice versa; that is a refinement, not a correction.
export function kvBytesPerToken(model, precision) {
  const prec = PRECISIONS.find((p) => p.id === precision) || PRECISIONS[0]
  const bytes = Math.max(1, prec.bytesPerParam) // KV below int8 is rare in practice
  const a = kvArchFor(model)
  if (a.kind === 'mla') return a.layers * a.latentDim * bytes
  return 2 * a.layers * a.kvHeads * a.headDim * bytes
}

// VRAM, decomposed. Replaces `weights x 1.3`, which was a constant chosen without
// a source, wrong at this tool's own anchor configuration, and — because it scaled
// with weight bytes — perversely shrank the KV budget when you quantised.
//
// Every term below is either arithmetic or a stated assumption:
//   weights    arithmetic
//   kv         arithmetic, given the architecture and the serving context
//   workspace  ASSUMED 8% of weights — activations, logits and engine scratch
//   comms      ASSUMED 4% of weights — collective buffers for tensor parallelism
//   headroom   ASSUMED 7% of the above — allocator fragmentation
export const VRAM_ASSUMPTIONS = {
  workspaceFrac: 0.08,
  commsFrac: 0.04,
  fragmentationFrac: 0.07,
  basis: 'assumption',
  note: 'Workspace, collective buffers and fragmentation are assumed fractions, not measured. They are small relative to weights and KV; the terms that decide fleet size are the two that are computed.'
}

export function vramBreakdown(model, precision, serving = {}) {
  const { ctxTokens, concurrency } = { ...DEFAULT_SERVING, ...serving }
  const prec = PRECISIONS.find((p) => p.id === precision) || PRECISIONS[0]
  const weights = model.params * prec.bytesPerParam            // GB (params in B)
  const kv = (kvBytesPerToken(model, precision) * ctxTokens * concurrency) / 1e9
  const workspace = weights * VRAM_ASSUMPTIONS.workspaceFrac
  const comms = weights * VRAM_ASSUMPTIONS.commsFrac
  const sub = weights + kv + workspace + comms
  const fragmentation = sub * VRAM_ASSUMPTIONS.fragmentationFrac
  const total = sub + fragmentation
  return {
    weights, kv, workspace, comms, fragmentation, total,
    ctxTokens, concurrency,
    kvBytesPerToken: kvBytesPerToken(model, precision),
    kvShare: total > 0 ? kv / total : 0,
    // What the old model would have said, so the change is auditable rather than silent.
    legacyFlat13: weights * 1.3,
    archBasis: kvArchFor(model).basis
  }
}

// Total VRAM (GB) for one replica at the given serving context.
export function vramNeed(model, precision, serving) {
  return Math.ceil(vramBreakdown(model, precision, serving).total)
}

// GPUs per replica — set by VRAM fit. A model that does not fit cannot run,
// regardless of how much throughput you would like from it.
export function gpusNeeded(model, gpu, precision, serving) {
  return Math.max(1, Math.ceil(vramNeed(model, precision, serving) / gpu.vram))
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


// WORKLOAD SHAPES.
//
// Until v6 this tool answered one workload and generalised from it, which produced
// a single break-even and implied a universality the data does not support. Modern
// workloads differ in the two properties that now drive the answer:
//
//   PREFILL:DECODE RATIO — prefill is compute-bound and processes a prompt in
//   parallel; decode is bandwidth-bound and strictly sequential. A workload that
//   is 95% prompt is a different machine from one that is 80% generation.
//
//   PREFIX REUSE — an agent resending a system prompt and conversation history on
//   every turn is not re-prefilling it if the serving stack keeps the prefix. This
//   is available to a self-hoster (a vLLM/SGLang flag) and previously the tool
//   credited it only to the API side, which was a one-sided ledger.
//
// These six shapes are ILLUSTRATIVE DEFAULTS, not measurements of anyone's traffic.
// They exist so the answer can be stated as a range across realistic workloads
// instead of a point estimate from one. Every field is user-editable.
export const WORKLOAD_SHAPES = [
  { id: 'chat', label: 'Interactive chat', avgIn: 1000, avgOut: 400, ctxTokens: 2000,
    prefixReuse: 0.20, peakiness: 2.5,
    note: 'Short prompts, short replies, human-paced and peaky. Little to reuse between turns beyond a system prompt.' },
  { id: 'rag', label: 'RAG / search', avgIn: 6000, avgOut: 400, ctxTokens: 8000,
    prefixReuse: 0.35, peakiness: 2.5,
    note: 'Large retrieved context per call. The system prompt reuses; the retrieved documents do not.' },
  { id: 'agentic', label: 'Agentic / tool loops', avgIn: 12000, avgOut: 600, ctxTokens: 16000,
    prefixReuse: 0.70, peakiness: 2.5,
    note: 'Long and growing context resent every turn — the workload where prefix reuse matters most, and where ignoring it overstates cost badly.' },
  { id: 'coding', label: 'Coding assistant', avgIn: 8000, avgOut: 1500, ctxTokens: 12000,
    prefixReuse: 0.50, peakiness: 2.5,
    note: 'Large repository context, substantial generation, and latency-sensitive.' },
  { id: 'reasoning', label: 'Reasoning / long generation', avgIn: 1500, avgOut: 4000, ctxTokens: 6000,
    prefixReuse: 0.15, peakiness: 2.5,
    note: 'Decode-dominated. Almost all of the work is sequential, so this is the shape least helped by prefill optimisation.' },
  { id: 'batch', label: 'Batch / offline', avgIn: 2000, avgOut: 500, ctxTokens: 3000,
    prefixReuse: 0.25, peakiness: 1,
    note: 'Latency-tolerant and schedulable, so it runs flat at 100% duty — the only shape where a self-hoster can manufacture the utilisation a provider gets from many tenants.' }
]

// Prefill runs roughly an order of magnitude faster per token than decode: it is
// compute-bound and processes the whole prompt in parallel, where decode is
// bandwidth-bound and emits one token at a time.
//
// ASSUMPTION, not a measurement. Published figures for this ratio vary widely with
// hardware, sequence length and implementation, and this tool has no benchmark of
// its own for it. It is applied as a single scalar, which is why full prefill/decode
// disaggregation — separate pools, separately parallelised — is NOT modelled here
// and is named as a limitation instead.
export const PREFILL_SPEEDUP = { value: 10, basis: 'assumption' }


// Concurrency is not a free parameter — it follows from the arrival rate and how
// long a request occupies a slot. Holding it fixed while varying prompt size (as
// v6 first did) badly overstates KV for long-context workloads: the same token
// volume delivered in 12K-token agentic requests is far FEWER simultaneous
// requests than the same volume delivered in 1K-token chat turns.
//
//   peak requests/min = peak tokens/min / tokens per request
//   residency (min)   = output tokens / per-stream decode rate / 60
//   concurrency       = peak requests/min x residency
//
// PER_STREAM_DECODE is an assumption: the tokens/sec a single user perceives.
// ~30/s is a common interactive target. It cancels partially — a faster stream
// frees the slot sooner — so the result is not hypersensitive to it, but it is
// stated rather than buried.
export const PER_STREAM_DECODE = { tokPerSec: 30, basis: 'assumption' }

export function deriveConcurrency({ peakTokPerMin, avgTokensIn, avgTokensOut }) {
  const perRequest = Math.max(1, (avgTokensIn || 0) + (avgTokensOut || 0))
  const peakReqPerMin = peakTokPerMin / perRequest
  const residencyMin = Math.max(0, avgTokensOut || 0) / PER_STREAM_DECODE.tokPerSec / 60
  return Math.max(1, Math.ceil(peakReqPerMin * residencyMin))
}


// CORRELATION TAX.
//
// A name for the quantity layer 9 describes, so it can be quoted rather than
// explained each time. You provision for peak and consume at duty d, so you buy
// 1/d units of capacity per unit actually used. The excess is what single tenancy
// costs you, expressed as a multiple of the compute you consumed:
//
//     correlationTax = (1 / duty) - 1
//
// At 100% duty it is 0 — a perfectly flat batch pipeline pays no correlation tax.
// At 40% duty it is 1.5x: for every unit of compute consumed, one and a half more
// were bought and idled. A provider does not avoid this by being better at
// engineering; it avoids it by serving tenants whose peaks do not coincide, which
// is why the paper treats it as structural rather than technical.
//
// This is ARITHMETIC on the duty cycle, not a measurement of anyone's fleet. Duty
// is itself derived from a traffic-shape preset the user picks.
export function correlationTax(dutyPct) {
  const d = Math.min(1, Math.max(0.0001, (Number(dutyPct) || 0) / 100))
  return (1 / d) - 1
}

// The same quantity from the provider's side: the share of their capacity that
// pooling saves them relative to a single tenant at this duty cycle.
export function tenancyDividend(dutyPct) {
  const t = correlationTax(dutyPct)
  return t / (1 + t)
}

// Convert a token mix into the DECODE-EQUIVALENT work a fleet must actually do,
// after prefix reuse and after discounting prefill for being cheaper per token.
export function decodeEquivalentTokens({ inTokens, outTokens, prefixReuse = 0 }) {
  const freshPrefill = Math.max(0, inTokens) * (1 - Math.min(1, Math.max(0, prefixReuse)))
  return outTokens + freshPrefill / PREFILL_SPEEDUP.value
}

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
export function gpusForDemand(model, gpu, precision, peakTokPerMin, serving) {
  const gpusPerReplica = gpusNeeded(model, gpu, precision, serving)
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
    outputShare = 0.25, cacheHitPct = 0, batchPct = 0,
    // Serving context — drives KV, and therefore GPUs per replica.
    ctxTokens = DEFAULT_SERVING.ctxTokens, concurrency = DEFAULT_SERVING.concurrency,
    // Prefix reuse available to the SELF-HOST side. A vLLM/SGLang flag, and the
    // self-hoster's hit rate is not diluted across tenants the way a provider's is.
    // Previously this credit existed only on the API side, which was one-sided.
    prefixReuse = 0
  } = opts
  const serving = { ctxTokens, concurrency }

  const vram = vramNeed(model, precision, serving)
  // The fleet does DECODE-EQUIVALENT work: prefill is cheaper per token and reused
  // prefixes are not prefilled at all. Billing is still on raw tokens, so the two
  // quantities are tracked separately rather than conflated.
  const workFactor = decodeEquivalentTokens({
    inTokens: 1 - outputShare, outTokens: outputShare, prefixReuse
  })
  const peakWorkPerMin = peakTokPerMin * workFactor
  const { numGpus: usableGpus, floorVram, replicas, gpusPerReplica, replicaTokMin } =
    gpusForDemand(model, gpu, precision, peakWorkPerMin, serving)
  // Redundant/standby GPUs add cost but NOT usable capacity (HA for sovereign etc.)
  const numGpus = Math.ceil(usableGpus * haFactor)
  // Capacity expressed back in BILLABLE tokens, so it is comparable with demand.
  const capacityTokMin = workFactor > 0 ? (replicaTokMin * replicas) / workFactor : 0

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
  // Same defect class as breakEvenTokensPerDay: a payback longer than the
  // amortisation window is not a payback, it is hardware you replace before it
  // repays. Null it rather than quoting 97 months on a 36-month asset.
  const rawPayback = mode === 'own' && monthlySaving > 0 ? capex / monthlySaving : null
  const paybackMonths = rawPayback != null && rawPayback <= amortMonths ? rawPayback : null
  const paybackBeyondAmortisation = rawPayback != null && rawPayback > amortMonths

  return {
    vram, numGpus, usableGpus, floorVram, capacityTokMin, capex,
    vramDetail: vramBreakdown(model, precision, serving),
    workFactor,            // decode-equivalent work per billable token
    prefixReuse, ctxTokens, concurrency,
    selfHostMonthly, apiMonthly, monthlyTokens, fleetUtil, breakdown,
    selfHostPer1M, apiPer1M,
    api,                    // full API-side detail: list vs effective, cache, batch
    breakEvenDuty,          // duty (0..1); if >1, self-host never wins even at 100% duty
    breakEvenTokensPerDay,  // null when unreachable by this fleet — see above
    breakEvenExceedsCapacity,
    fleetCeilingPerDay,
    paybackMonths,          // null when renting, never repays, or repays after the asset is retired
    paybackBeyondAmortisation,
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
