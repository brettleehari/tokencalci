// Public, read-only JSON API over the same self-host-vs-neocloud economics engine
// the UI uses. Consumed by the web app and by other agents (see SKILL.md).
import { GPUS, PRECISIONS, NEOCLOUDS, pricedModels } from '../client/src/hwdata.js'
import { modelEconomics } from '../client/src/hwcalc.js'

const BASE = {
  amortMonths: 36, kwhCost: 0.12, pue: 1.3, overheadPct: 15,
  personnelMonthly: 3000, spacePerKwMonth: 150
}
const round = (n) => (isFinite(n) ? Math.round(n * 100) / 100 : null)

// One model's full decision at a given workload.
export function computeDecision(q, feed) {
  const modelId = q.model || 'llama-70b'
  const peakTokPerMin = +q.peakTokPerMin || 100000
  const dutyPct = q.dutyPct != null ? +q.dutyPct : 30
  const precision = q.precision || 'fp16'
  const gpuId = q.gpu || 'h100'
  const sovereign = q.sovereign === true || q.sovereign === 'true'
  const modeReq = q.mode || 'auto' // 'rent' | 'own' | 'auto'

  const priced = pricedModels(feed)
  const m = priced.find((x) => x.id === modelId)
  if (!m) return { error: `unknown model '${modelId}'`, availableModels: priced.map((x) => x.id) }
  if (!PRECISIONS.some((p) => p.id === precision)) return { error: `unknown precision '${precision}'`, availablePrecisions: PRECISIONS.map((p) => p.id) }
  const g = GPUS.find((x) => x.id === gpuId)
  if (!g) return { error: `unknown gpu '${gpuId}'`, availableGpus: GPUS.map((x) => x.id) }

  const opts = { ...BASE, peakTokPerMin, dutyPct, haFactor: sovereign ? 2 : 1 }
  const eRent = modelEconomics(m, g, precision, { ...opts, mode: 'rent' })
  const eOwn = modelEconomics(m, g, precision, { ...opts, mode: 'own' })
  const basis = modeReq === 'rent' ? 'rent' : modeReq === 'own' ? 'own'
    : (eOwn.selfHostMonthly < eRent.selfHostMonthly ? 'own' : 'rent')
  const e = basis === 'own' ? eOwn : eRent

  let verdict, recommendation
  if (sovereign) {
    verdict = 'self-host-required'
    recommendation = `Data must stay in-house, so a neocloud API is off the table. Self-host (${basis}) at roughly ${e.ratio.toFixed(1)}× the neocloud cost — the price of control.`
  } else if (e.winsSelfHost) {
    verdict = 'self-host'
    recommendation = `Self-host (${basis} the GPUs) — at ${dutyPct}% duty its fixed cost beats pay-per-token; neocloud would cost ~${(1 / e.ratio).toFixed(1)}× more.`
  } else {
    verdict = 'neocloud'
    recommendation = `Use a neocloud API — self-host (${basis}, the cheaper basis) would still cost ~${e.ratio.toFixed(1)}× the neocloud bill at ${dutyPct}% duty.`
  }

  return {
    model: { id: m.id, label: m.label, params: m.params, active: m.active, license: m.license, commercial: m.commercial, modality: m.modality, contextK: m.ctx, cutoff: m.cutoff, org: m.org, country: m.country },
    workload: { peakTokPerMin, dutyPct, monthlyTokens: Math.round(e.monthlyTokens), precision, gpu: g.id },
    verdict,
    recommendation,
    sovereign,
    selfHost: {
      basis, gpus: e.numGpus, vramGB: e.vram, capexUSD: round(e.capex),
      monthlyUSD: round(e.selfHostMonthly), per1MUSD: round(e.selfHostPer1M),
      breakEvenDuty: e.breakEvenDuty > 1 ? null : round(e.breakEvenDuty),
      rent: { monthlyUSD: round(eRent.selfHostMonthly), per1MUSD: round(eRent.selfHostPer1M), gpus: eRent.numGpus },
      own: { monthlyUSD: round(eOwn.selfHostMonthly), per1MUSD: round(eOwn.selfHostPer1M), gpus: eOwn.numGpus }
    },
    neocloud: { per1MUSD: m.apiPer1M, livePrice: !!m.livePrice, monthlyUSD: round(e.apiMonthly) },
    pricesAsOf: feed?.asOf || null,
    caveats: [
      'Throughput (tokens/sec) is a heuristic by model size, not measured.',
      'Neocloud prices fall ~10x/year — figures are directional; check pricesAsOf.',
      'Different models use different tokenizers, so token-based price comparisons across models are approximate.',
      m.commercial ? null : `${m.label} is non-commercial (${m.license}) — a paid license is required to self-host it in a product.`
    ].filter(Boolean)
  }
}

// Compare the first N models at one workload (drives the top-10 view).
export function computeCompare(q, feed) {
  const limit = Math.min(+q.limit || 10, 50)
  const priced = pricedModels(feed)
  const results = priced.slice(0, limit).map((m) => {
    const d = computeDecision({ ...q, model: m.id }, feed)
    return { id: m.id, label: m.label, verdict: d.verdict, selfHostBasis: d.selfHost.basis, selfHostPer1MUSD: d.selfHost.per1MUSD, neocloudPer1MUSD: d.neocloud.per1MUSD, breakEvenDuty: d.selfHost.breakEvenDuty }
  })
  return {
    workload: { peakTokPerMin: +q.peakTokPerMin || 100000, dutyPct: q.dutyPct != null ? +q.dutyPct : 30, precision: q.precision || 'fp16' },
    count: results.length, results, pricesAsOf: feed?.asOf || null
  }
}

export function catalog(feed) {
  return { asOf: feed?.asOf || null, live: !!feed?.live, count: pricedModels(feed).length, models: pricedModels(feed) }
}
export function gpus() { return { gpus: GPUS } }
export function providers() { return { neoclouds: NEOCLOUDS } }
export function precisions() { return { precisions: PRECISIONS } }

export const API_INDEX = {
  name: 'should-i-self-host API',
  description: 'Decide whether to self-host an open LLM or use a neocloud API, with live-priced TCO.',
  skill: '/SKILL.md',
  endpoints: {
    'GET /api/decide': 'Verdict + full TCO for one model. Query: model, peakTokPerMin, dutyPct, precision, gpu, mode(rent|own|auto), sovereign(bool).',
    'GET /api/compare': 'Compare the first N models at a workload. Query: limit, peakTokPerMin, dutyPct, precision, sovereign.',
    'GET /api/models': 'The 50-model catalog with dimensions (size, context, license, modality, cutoff, price).',
    'GET /api/providers': 'Neocloud providers + reference pricing.',
    'GET /api/gpus': 'GPU catalog (VRAM, rent/own price, power).',
    'GET /api/precisions': 'Serving precisions (fp16/fp8/int4).',
    'GET /api/prices': 'The dated live pricing feed (LiteLLM).'
  }
}
