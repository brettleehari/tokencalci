// WHY WORKLOAD SHAPE MOVES COST NON-LINEARLY.
//
// The tool reports that shape alone moves the answer 1.5x to 3.8x on one model and
// one fleet. That is not a modelling artefact and it is not a smooth response
// either. This module derives the closed form, locates the discontinuities, and
// measures the local elasticities, so the claim can be checked rather than believed.
//
// ── The closed form ──────────────────────────────────────────────────────────
//
// Let, per request:  i = input tokens, o = output tokens, r = prefix reuse,
//                    s = prefill speedup, C = resident context per active request
// and globally:      T = billable tokens/day, R = peak-to-average ratio,
//                    P = per-stream decode rate, k = KV bytes/token,
//                    W = weight GB, V = GPU VRAM GB, tau = replica tokens/sec,
//                    c = $/GPU-month, F = fixed monthly cost (people, overhead)
//
//   work per billable token      w = [ o + i(1-r)/s ] / (i + o)
//   concurrency at peak          N = T·R·o / (86400·P·(i+o))
//   VRAM per replica             M = W + k·C·N/1e9 + overhead(W)
//   GPUs per replica             g = CEIL( M / V )
//   replicas for throughput      p = CEIL( T·R·w / (1440·60·tau) )
//   $ per 1M billable tokens     $ = [ c·g·p + F ] · 1e6 / (30·T)
//
// ── Why it is not linear ─────────────────────────────────────────────────────
//
// Three separate reasons, and they compose:
//
//   1. RATIOS, NOT SUMS. Both w and N are of the form o/(i+o) — hyperbolic in the
//      prompt-to-generation ratio. Doubling the prompt does not double the work;
//      it moves you along a curve whose slope depends on where you already are.
//
//   2. TWO CEILING FUNCTIONS. g and p are integer-valued. Cost is therefore
//      PIECEWISE CONSTANT in the fleet and jumps at boundaries. Within a step the
//      marginal cost of one more token of context is exactly zero; at the boundary
//      it is a full GPU — or, for the replica boundary, a full extra copy of the
//      model. The derivative is 0 almost everywhere and undefined on a measure-zero
//      set, which is the mathematically precise way of saying "free until it is a
//      cliff".
//
//   3. THE TWO CEILINGS ARE DRIVEN BY DIFFERENT VARIABLES. g is set by memory
//      (context and concurrency), p by throughput (work and peak rate). A workload
//      can be memory-bound or throughput-bound, and which one binds changes which
//      inputs matter. That is why no single elasticity describes the system.
//
// The practical consequence is the useful part: at any operating point you are
// either mid-step, where context and concurrency are free, or near an edge, where a
// small change in workload shape buys a large change in fleet. This module reports
// which, and how far away the edge is.

import { PRECISIONS } from './hwdata.js'
import {
  vramBreakdown, kvBytesPerToken, decodeEquivalentTokens, deriveConcurrency,
  deriveWorkload, modelEconomics, PREFILL_SPEEDUP, PER_STREAM_DECODE, VRAM_ASSUMPTIONS
} from './hwcalc.js'

// Work per billable token — the decode-equivalent load one billed token creates.
export function workFactor({ avgIn, avgOut, prefixReuse = 0 }) {
  const total = Math.max(1, avgIn + avgOut)
  return decodeEquivalentTokens({ inTokens: avgIn, outTokens: avgOut, prefixReuse }) / total
}

// Where the NEXT GPU-per-replica boundary sits, expressed in the units a
// practitioner can actually move: context tokens, and concurrent requests.
//
// Solving M(C, N) = g·V for the free variable, holding the other fixed.
export function fitBoundaries(model, gpu, precision, { ctxTokens, concurrency }) {
  const b = vramBreakdown(model, precision, { ctxTokens, concurrency })
  const k = kvBytesPerToken(model, precision)
  const gpus = Math.max(1, Math.ceil(b.total / gpu.vram))

  // Non-KV terms scale with weights only, so they are constant in C and N.
  const fixedGB = b.weights + b.workspace + b.comms
  const frag = 1 + VRAM_ASSUMPTIONS.fragmentationFrac
  // total = (fixedGB + kvGB) * frag  =>  kvGB at a given GPU count:
  const kvAllowedAt = (n) => (n * gpu.vram) / frag - fixedGB
  const kvPerCtxToken = (k * concurrency) / 1e9   // GB per token of context
  const kvPerRequest = (k * ctxTokens) / 1e9      // GB per concurrent request

  const headroomGB = kvAllowedAt(gpus) - b.kv
  const nextCtx = kvPerCtxToken > 0 ? ctxTokens + headroomGB / kvPerCtxToken : Infinity
  const nextConc = kvPerRequest > 0 ? concurrency + headroomGB / kvPerRequest : Infinity

  return {
    gpusPerReplica: gpus,
    kvGB: b.kv,
    totalGB: b.total,
    headroomGB: Math.max(0, headroomGB),
    // How much room is left before the fleet steps up, in each free variable.
    ctxToNextGpu: Math.max(0, nextCtx - ctxTokens),
    concToNextGpu: Math.max(0, nextConc - concurrency),
    nextCtxAt: nextCtx,
    nextConcAt: nextConc,
    // Fraction of the current step consumed. 1.0 means you are at the cliff edge.
    stepUsed: (() => {
      const lo = kvAllowedAt(gpus - 1)
      const hi = kvAllowedAt(gpus)
      return hi > lo ? Math.min(1, Math.max(0, (b.kv - lo) / (hi - lo))) : 0
    })(),
    // What crossing it costs, as a multiple of the current replica.
    stepCostMultiple: (gpus + 1) / gpus
  }
}

// Local elasticity: d ln(cost) / d ln(x), measured numerically by perturbing each
// input. Reported rather than derived symbolically because the ceilings make the
// analytic derivative zero almost everywhere and undefined at the steps — a
// numerical secant over a finite perturbation is the honest description of what a
// practitioner would actually experience.
//
// A one-sided perturbation is used deliberately: the question "what happens if this
// grows" has a different answer from "what happens if it shrinks", precisely
// because of the ceilings, and averaging the two would hide the asymmetry.
export function elasticities(model, gpu, precision, base, { bump = 0.10 } = {}) {
  const run = (over) => {
    const w = deriveWorkload({
      dailyRequests: over.dailyRequests ?? base.dailyRequests,
      avgTokensIn: over.avgIn ?? base.avgIn,
      avgTokensOut: over.avgOut ?? base.avgOut,
      peakiness: over.peakiness ?? base.peakiness
    })
    const ctx = over.ctxTokens ?? base.ctxTokens
    const conc = deriveConcurrency({
      peakTokPerMin: w.peakTokPerMin,
      avgTokensIn: over.avgIn ?? base.avgIn,
      avgTokensOut: over.avgOut ?? base.avgOut
    })
    const e = modelEconomics(model, gpu, precision, {
      ...base.opts,
      peakTokPerMin: w.peakTokPerMin, dutyPct: w.dutyPct, outputShare: w.outputShare,
      ctxTokens: ctx, concurrency: conc,
      prefixReuse: over.prefixReuse ?? base.prefixReuse
    })
    return { cost: e.selfHostPer1M, gpus: e.numGpus, e }
  }

  const at = run({})
  const vars = [
    { id: 'avgIn', label: 'Prompt length', value: base.avgIn, unit: 'tokens' },
    { id: 'avgOut', label: 'Generation length', value: base.avgOut, unit: 'tokens' },
    { id: 'ctxTokens', label: 'Resident context', value: base.ctxTokens, unit: 'tokens' },
    { id: 'dailyRequests', label: 'Volume', value: base.dailyRequests, unit: 'req/day' },
    { id: 'peakiness', label: 'Peakiness', value: base.peakiness, unit: 'x avg' }
  ]

  const rows = vars.map((v) => {
    const up = run({ [v.id]: v.value * (1 + bump) })
    const dLnCost = Math.log(up.cost / at.cost)
    const dLnX = Math.log(1 + bump)
    return {
      ...v,
      elasticity: dLnX !== 0 ? dLnCost / dLnX : 0,
      costAt: at.cost,
      costUp: up.cost,
      gpusAt: at.gpus,
      gpusUp: up.gpus,
      // A step was crossed inside the perturbation: the local response is a jump,
      // not a slope, and reporting only the elasticity would misrepresent it.
      crossesStep: up.gpus !== at.gpus
    }
  })

  // Prefix reuse moves the other way: more reuse is less work.
  const reuseUp = Math.min(0.95, base.prefixReuse + 0.10)
  const ru = run({ prefixReuse: reuseUp })
  rows.push({
    id: 'prefixReuse', label: 'Prefix reuse', value: base.prefixReuse, unit: 'share',
    elasticity: (ru.cost - at.cost) / at.cost / 0.10,   // per +10pp, reported as a rate
    absolute: true,
    costAt: at.cost, costUp: ru.cost, gpusAt: at.gpus, gpusUp: ru.gpus,
    crossesStep: ru.gpus !== at.gpus
  })

  return { at, rows }
}

// Everything the UI needs for one operating point.
export function analyseOperatingPoint(model, gpu, precision, base) {
  const w = deriveWorkload({
    dailyRequests: base.dailyRequests, avgTokensIn: base.avgIn,
    avgTokensOut: base.avgOut, peakiness: base.peakiness
  })
  const concurrency = deriveConcurrency({
    peakTokPerMin: w.peakTokPerMin, avgTokensIn: base.avgIn, avgTokensOut: base.avgOut
  })
  const fit = fitBoundaries(model, gpu, precision, { ctxTokens: base.ctxTokens, concurrency })
  const wf = workFactor(base)
  const el = elasticities(model, gpu, precision, base)
  // Which ceiling binds decides which inputs matter at all.
  const bound = fit.stepUsed > 0.5 ? 'memory' : 'throughput'
  return { workload: w, concurrency, fit, workFactor: wf, ...el, bound, constants: { PREFILL_SPEEDUP, PER_STREAM_DECODE } }
}
