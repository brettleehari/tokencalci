// MODEL-MIX PLANNER
//
// The gap this fills: API price tables tell you what one model costs. Self-host
// calculators tell you whether to buy GPUs for one model. Routers (RouteLLM,
// Azure Model Router, vLLM Semantic Router) execute a split at runtime. Nobody
// plans the split and the hosting decision together — which is exactly the shape
// production systems converge on: a cheap bulk tier you may self-host, plus a
// frontier tier you rent by the token.
//
// The core reduction: **a mix is N duty-cycle problems with a split between
// them.** Splitting traffic scales each tier's PEAK by its share while leaving
// the DUTY CYCLE untouched — the traffic shape doesn't change just because you
// routed some of it elsewhere. So the existing engine works per tier unmodified.
//
// Sizing note that matters: because each tier is provisioned for its own peak,
// splitting traffic makes self-hosting *harder* to justify per tier, not easier.
// A 70/30 split gives the bulk tier 70% of the tokens but still forces a fleet
// sized for 70% of peak — running at the same duty cycle. This is the honest
// result and it is why "just self-host the bulk tier" is not automatically right.

import { modelEconomics, apiPricing } from './hwcalc.js'

// Quality bar → minimum capability tier a candidate must clear.
// `quality` in the catalog is a coarse 1–4 editorial tier, NOT a benchmark score.
export const QUALITY_BARS = [
  { id: 'any', label: 'Anything that works', min: 1, note: 'Cheapest model that can do the job at all.' },
  { id: 'mid', label: 'Mid-tier or better', min: 2, note: 'Standard production quality for routine work.' },
  { id: 'strong', label: 'Strong models only', min: 3, note: 'Near-frontier open weights.' },
  { id: 'frontier', label: 'Frontier required', min: 4, note: 'Only the top tier will do — expect to pay for it.' }
]

// Task type → which modalities are plausible candidates, and how much of the
// traffic is genuinely "hard".
//
// The hard-share defaults are directional, taken from published routing work:
// RouteLLM reported ~85% cost reduction on MT-Bench while holding ~95% of GPT-4
// Turbo quality by sending only ~14% of queries to the strong model; a widely
// cited production mix is 60% simple / 30% moderate / 10% complex. Agentic and
// coding traffic skews harder because a wrong plan compounds across steps.
// These are STARTING POINTS for the slider, not measurements of your traffic.
export const TASK_TYPES = [
  { id: 'chatbot', label: 'Chatbot / assistant', modalities: ['text', 'reasoning'], hardShare: 20,
    note: 'Most turns are easy; a minority need real reasoning.' },
  { id: 'rag', label: 'RAG / document Q&A', modalities: ['text', 'RAG', 'reasoning'], hardShare: 15, minCtx: 128,
    note: 'Retrieval does the heavy lifting, so a smaller model usually suffices. Long context matters more than raw capability.' },
  { id: 'batch', label: 'Batch / offline pipeline', modalities: ['text', 'reasoning'], hardShare: 10,
    note: 'Latency-tolerant and repetitive — the best case for a cheap bulk tier plus batch discounts.' },
  { id: 'agentic', label: 'Agentic / tool use', modalities: ['reasoning', 'code', 'text'], hardShare: 35,
    note: 'Errors compound across steps, so more traffic needs the strong tier than in chat.' },
  { id: 'coding', label: 'Coding assistant', modalities: ['code', 'reasoning', 'text'], hardShare: 30,
    note: 'Completion is easy; multi-file reasoning and debugging are not.' }
]

// Candidate set for a bar + task. Documented rules, deliberately simple (MVP):
//   1. clear the capability bar
//   2. plausible modality for the task (text is treated as universal)
//   3. long enough context if the task needs it
//   4. commercially self-hostable, unless the user opts into non-commercial
export function candidates(models, { barId, taskId, allowNonCommercial = false }) {
  const bar = QUALITY_BARS.find((b) => b.id === barId) || QUALITY_BARS[0]
  const task = TASK_TYPES.find((t) => t.id === taskId) || TASK_TYPES[0]
  return models.filter((m) => {
    if (m.quality < bar.min) return false
    if (!task.modalities.includes(m.modality) && m.modality !== 'text') return false
    if (task.minCtx && m.ctx < task.minCtx) return false
    if (!allowNonCommercial && !m.commercial) return false
    return true
  })
}

// Effective $/1M for ranking candidates at this workload's actual token mix.
// Uses the same pricing path as the rest of the tool so rankings can't drift
// from the numbers shown elsewhere.
export function per1M(model, { outputShare, cacheHitPct = 0, batchPct = 0 }) {
  const price = model.price || { blendedOnly: model.apiPer1M }
  return apiPricing(price, { monthlyTokens: 1e6, outputShare, cacheHitPct, batchPct }).effectivePer1M
}

// Default tier picks, per the planner's rule: cheapest candidate that clears the
// bar handles the easy majority; the strongest available model handles the hard
// minority. The hard tier may be a CLOSED frontier API — that is usually the
// real alternative, and excluding it would flatter the open-weights answer.
export function defaultTiers(openCandidates, frontierList, { taskId, priceCtx }) {
  const task = TASK_TYPES.find((t) => t.id === taskId) || TASK_TYPES[0]
  if (!openCandidates.length) return null

  const byPrice = [...openCandidates].sort((a, b) => per1M(a, priceCtx) - per1M(b, priceCtx))
  const bulk = byPrice[0]

  // Strongest open candidate; tie-break on price so we don't recommend an
  // expensive model that is no better than a cheap one.
  const strongestOpen = [...openCandidates]
    .sort((a, b) => b.quality - a.quality || per1M(a, priceCtx) - per1M(b, priceCtx))[0]

  // Cheapest genuinely frontier closed model, as the alternative hard tier.
  const closedFrontier = [...frontierList]
    .filter((f) => f.tier === 'frontier')
    .sort((a, b) => per1M(a, priceCtx) - per1M(b, priceCtx))[0]

  // If the cheapest and the strongest candidate are the SAME model, a split buys
  // nothing — which happens whenever the quality bar is set so high that only one
  // capability tier survives the filter. The honest escalation target is then a
  // closed frontier API, because no *open* model in reach is any stronger.
  const degenerate = strongestOpen.id === bulk.id
  const hard = degenerate && closedFrontier ? closedFrontier : strongestOpen

  return {
    hardShare: task.hardShare,
    bulk,
    hard,
    // True only when we could not find a distinct escalation target at all.
    noEscalation: degenerate && !closedFrontier,
    escalatesToClosed: degenerate && !!closedFrontier,
    hardAlternatives: [strongestOpen, ...frontierList].filter(Boolean),
    suggestedClosedHard: closedFrontier || null
  }
}

// Economics for one tier. Open models get the full self-host-vs-API treatment;
// closed models are API-only by definition.
function tierEconomics(model, share, { workload, opts, gpu, precision }) {
  const s = Math.max(0, Math.min(1, share))
  const monthlyTokens = workload.monthlyTokens * s
  const priceCtx = {
    outputShare: workload.outputShare,
    cacheHitPct: opts.cacheHitPct || 0,
    batchPct: opts.batchPct || 0
  }
  const price = model.price || { blendedOnly: model.apiPer1M }
  const api = apiPricing(price, { monthlyTokens, ...priceCtx })

  if (model.closed) {
    return {
      model, share: s, monthlyTokens, closed: true,
      apiMonthly: api.monthly, effectivePer1M: api.effectivePer1M,
      selfHost: null, best: 'api', bestMonthly: api.monthly
    }
  }

  // Peak scales with the tier's share; duty cycle does NOT — routing a slice of
  // traffic elsewhere changes the volume, not the shape.
  const tierOpts = {
    ...opts,
    peakTokPerMin: workload.peakTokPerMin * s,
    dutyPct: workload.dutyPct,
    outputShare: workload.outputShare
  }
  const eRent = modelEconomics(model, gpu, precision, { ...tierOpts, mode: 'rent' })
  const eOwn = modelEconomics(model, gpu, precision, { ...tierOpts, mode: 'own' })
  const basis = eOwn.selfHostMonthly < eRent.selfHostMonthly ? 'own' : 'rent'
  const e = basis === 'own' ? eOwn : eRent

  const best = e.selfHostMonthly < api.monthly ? 'self' : 'api'
  return {
    model, share: s, monthlyTokens, closed: false,
    apiMonthly: api.monthly, effectivePer1M: api.effectivePer1M,
    selfHost: {
      basis, monthly: e.selfHostMonthly, per1M: e.selfHostPer1M, gpus: e.numGpus,
      capex: e.capex, vram: e.vram, breakEvenDuty: e.breakEvenDuty,
      breakEvenTokensPerDay: e.breakEvenTokensPerDay, paybackMonths: e.paybackMonths
    },
    best,
    bestMonthly: Math.min(e.selfHostMonthly, api.monthly)
  }
}

// The full mix: per-tier economics, the blended bill, and what the split is
// actually buying you versus the two degenerate strategies (everything cheap,
// everything strong).
export function mixEconomics({ tiers, workload, opts, gpu, precision }) {
  const rows = tiers
    .filter((t) => t.model && t.share > 0)
    .map((t) => tierEconomics(t.model, t.share / 100, { workload, opts, gpu, precision }))

  const apiOnlyMonthly = rows.reduce((a, r) => a + r.apiMonthly, 0)
  const bestMixMonthly = rows.reduce((a, r) => a + r.bestMonthly, 0)

  // Baseline: route 100% of traffic to the strongest tier in the mix. This is
  // what a team does before they build routing, and the number the savings
  // claim is measured against.
  const strongest = tiers.filter((t) => t.model).reduce(
    (best, t) => (!best || (t.model.closed ? 5 : t.model.quality) > (best.model.closed ? 5 : best.model.quality) ? t : best),
    null
  )
  const allStrongMonthly = strongest
    ? tierEconomics(strongest.model, 1, { workload, opts, gpu, precision }).apiMonthly
    : 0

  const savedVsAllStrong = allStrongMonthly > 0 ? 1 - apiOnlyMonthly / allStrongMonthly : 0
  const blendedPer1M = workload.monthlyTokens > 0
    ? bestMixMonthly / (workload.monthlyTokens / 1e6)
    : 0

  return {
    rows,
    apiOnlyMonthly,        // every tier on pay-per-token
    bestMixMonthly,        // each tier on its cheaper option (self-host or API)
    allStrongMonthly,      // the no-routing baseline
    savedVsAllStrong,      // fraction saved by routing at all
    selfHostSaving: apiOnlyMonthly - bestMixMonthly,
    blendedPer1M,
    strongestId: strongest?.model?.id || null,
    anySelfHost: rows.some((r) => r.best === 'self'),
    // Both tiers ended up on the same model — the "split" is cosmetic and the
    // savings are necessarily zero. Callers should say so rather than show a
    // recommendation that reads like a real routing plan.
    degenerate: rows.length > 1 && rows.every((r) => r.model.id === rows[0].model.id)
  }
}
