// Public, read-only JSON API over the same self-host-vs-neocloud economics engine
// the UI uses. Consumed by the web app and by other agents (see SKILL.md).
import { GPUS, PRECISIONS, NEOCLOUDS, pricedModels, servingPrecisionFor } from '../client/src/hwdata.js'
import { modelEconomics, deriveWorkload, apiPricing } from '../client/src/hwcalc.js'
import { frontierModels } from '../client/src/pricing.js'
import { getGpuPrices } from './gpuprices.js'
import { pricedGpus, CAPEX_AS_OF, QUALITY_BASIS } from '../client/src/hwdata.js'
import { SOURCE_LAYERS, KNOWN_GAPS, CREDITS, CONFIDENCE_META } from '../client/src/sources.js'
import { crossCheck, jurisdictions, freshness, servingPrecisionMap } from './openrouter.js'

const BASE = {
  amortMonths: 36, kwhCost: 0.12, pue: 1.3, overheadPct: 15,
  personnelMonthly: 3000, spacePerKwMonth: 150
}
const round = (n) => (isFinite(n) ? Math.round(n * 100) / 100 : null)

// Resolve a workload from EITHER the human-facing params (dailyRequests +
// avgTokensIn/Out + peakiness) or the original peakTokPerMin/dutyPct pair.
// The original pair keeps working unchanged — this is a published API.
function resolveWorkload(q) {
  if (q.dailyRequests != null) {
    const w = deriveWorkload({
      dailyRequests: +q.dailyRequests,
      avgTokensIn: q.avgTokensIn != null ? +q.avgTokensIn : 2000,
      avgTokensOut: q.avgTokensOut != null ? +q.avgTokensOut : 500,
      peakiness: q.peakiness != null ? +q.peakiness : 3
    })
    return { ...w, stated: 'requests' }
  }
  const peakTokPerMin = +q.peakTokPerMin || 100000
  const dutyPct = q.dutyPct != null ? +q.dutyPct : 30
  const outputShare = q.outputShare != null ? +q.outputShare : 0.25
  return {
    peakTokPerMin, dutyPct, outputShare,
    dailyTokens: peakTokPerMin * (dutyPct / 100) * 1440,
    stated: 'peak-duty'
  }
}

// One model's full decision at a given workload.
export function computeDecision(q, feed, gpuFeed, orSnap) {
  const modelId = q.model || 'llama-70b'
  const w = resolveWorkload(q)
  const { peakTokPerMin, dutyPct, outputShare } = w
  const cacheHitPct = q.cacheHitPct != null ? +q.cacheHitPct : 0
  const batchPct = q.batchPct != null ? +q.batchPct : 0
  const gpuId = q.gpu || 'h100'
  const sovereign = q.sovereign === true || q.sovereign === 'true'
  const modeReq = q.mode || 'auto' // 'rent' | 'own' | 'auto'

  const priced = pricedModels(feed)
  const m = priced.find((x) => x.id === modelId)
  if (!m) return { error: `unknown model '${modelId}'`, availableModels: priced.map((x) => x.id) }
  // Default to the precision this model's weights were RELEASED in, not fp16.
  // Scoring a model at a precision it never shipped in penalises exactly the
  // quantisation-aware work that gets it under a VRAM boundary — and VRAM fit is
  // the thing this whole API argues decides the answer. Callers can override.
  const nat = servingPrecisionFor(m, servingPrecisionMap(orSnap)[m.id])
  const precision = q.precision || nat.id
  if (!PRECISIONS.some((p) => p.id === precision)) return { error: `unknown precision '${precision}'`, availablePrecisions: PRECISIONS.map((p) => p.id) }
  const g = pricedGpus(gpuFeed).find((x) => x.id === gpuId)
  if (!g) return { error: `unknown gpu '${gpuId}'`, availableGpus: GPUS.map((x) => x.id) }

  const opts = {
    ...BASE, peakTokPerMin, dutyPct, outputShare, cacheHitPct, batchPct,
    haFactor: sovereign ? 2 : 1
  }
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

  // What the SAME workload would cost on a frontier closed API — the baseline a
  // team is really choosing against when they consider self-hosting an open model.
  const frontier = frontierModels(feed).map((f) => {
    const fp = apiPricing(f.price, { monthlyTokens: e.monthlyTokens, outputShare, cacheHitPct, batchPct })
    return {
      id: f.id, label: f.label, org: f.org, tier: f.tier,
      inPer1MUSD: f.price.in, outPer1MUSD: f.price.out,
      effectivePer1MUSD: round(fp.effectivePer1M), monthlyUSD: round(fp.monthly),
      vsSelfHost: e.selfHostMonthly > 0 ? round(fp.monthly / e.selfHostMonthly) : null,
      feedKey: f.price.keys[0]
    }
  })

  return {
    model: { id: m.id, label: m.label, params: m.params, active: m.active, license: m.license, commercial: m.commercial, modality: m.modality, contextK: m.ctx, cutoff: m.cutoff, org: m.org, country: m.country },
    workload: {
      peakTokPerMin: Math.round(peakTokPerMin), dutyPct: round(dutyPct),
      outputShare: round(outputShare), monthlyTokens: Math.round(e.monthlyTokens),
      dailyTokens: Math.round(w.dailyTokens), statedAs: w.stated,
      cacheHitPct, batchPct, precision, gpu: g.id,
      precisionBasis: q.precision ? 'caller-specified' : `${nat.basis} — ${nat.label}`
    },
    gpuPricing: {
      id: g.id, name: g.name, rentHrUSD: g.rentHr, source: g.rentSource, asOf: g.rentAsOf,
      spread: g.rentSpread, capexUSD: g.capex, capexAsOf: CAPEX_AS_OF,
      note: g.rentSource === 'live'
        ? 'Rental price is the live median across currently-rentable community-marketplace offers; enterprise/contracted capacity costs more. Capex is a dated constant.'
        : 'Live GPU feed unavailable — rental price is a dated constant.'
    },
    verdict,
    recommendation,
    sovereign,
    selfHost: {
      basis, gpus: e.numGpus, vramGB: e.vram, capexUSD: round(e.capex),
      monthlyUSD: round(e.selfHostMonthly), per1MUSD: round(e.selfHostPer1M),
      breakEvenDuty: e.breakEvenDuty > 1 ? null : round(e.breakEvenDuty),
      breakEvenTokensPerDay: Number.isFinite(e.breakEvenTokensPerDay) ? Math.round(e.breakEvenTokensPerDay) : null,
      // Explains a null above: the crossover exists arithmetically but lies beyond
      // what this fleet can physically serve, so quoting it would be misleading.
      breakEvenBeyondFleetCapacity: !!e.breakEvenExceedsCapacity,
      paybackMonths: e.paybackMonths != null ? round(e.paybackMonths) : null,
      rent: { monthlyUSD: round(eRent.selfHostMonthly), per1MUSD: round(eRent.selfHostPer1M), gpus: eRent.numGpus },
      own: { monthlyUSD: round(eOwn.selfHostMonthly), per1MUSD: round(eOwn.selfHostPer1M), gpus: eOwn.numGpus }
    },
    neocloud: {
      // Same model, served per-token. Priced from real input/output rates.
      source: m.price.source,
      inPer1MUSD: m.price.in, outPer1MUSD: m.price.out,
      cacheReadPer1MUSD: e.api.cacheReadRate != null ? round(e.api.cacheReadRate) : null,
      listPer1MUSD: round(e.api.listPer1M),
      effectivePer1MUSD: round(e.apiPer1M),
      monthlyUSD: round(e.apiMonthly),
      livePrice: !!m.livePrice,
      // The provider spread is the biggest single source of error in this whole
      // comparison — surfaced, not hidden behind a median.
      providerSpread: m.price.spread
        ? { providers: m.price.spread.n, inMin: m.price.spread.inMin, inMax: m.price.spread.inMax, outMin: m.price.spread.outMin, outMax: m.price.spread.outMax, servedBy: m.price.spread.providers }
        : null,
      feedKeys: m.price.keys.slice(0, 8)
    },
    frontierAPI: frontier,
    // Second, independent source. Agreement raises confidence; disagreement is
    // reported rather than smoothed away, and serving precision is disclosed so
    // the self-host precision you picked is compared like for like.
    secondSource: crossCheck(m.id, m.price.in, orSnap),
    pricesAsOf: feed?.asOf || null,
    caveats: [
      'Throughput (tokens/sec) is fitted to third-party vLLM serving benchmarks at batch 256, not measured in-house; it has no batch-size or context-length term.',
      'Measured from the LiteLLM price history (see /api/history): per-model list prices are STICKY (~0.98x/yr for a fixed basket over 18 months). The fall comes from cheaper NEW models arriving (cheapest available fell ~46%/yr). The widely-quoted ~10x/year is not supported for per-token list prices.',
      'Different models use different tokenizers, so token-based price comparisons across models are approximate.',
      m.price.source === 'curated'
        ? `${m.label} has no per-token match in the live feed — its price is a curated, directional figure with no input/output split, so cache and batch discounts are not applied to it.`
        : `Price is the MEDIAN across ${m.price.spread.n} live provider listings; the spread is in neocloud.providerSpread.`,
      e.api.cacheApplied && e.api.cacheReadIsEstimate
        ? 'No provider cache-read rate in the feed for this model — cache savings assume 10% of the input rate.'
        : null,
      batchPct > 0 ? 'Batch discount modeled as a flat 50% (the rate OpenAI, Anthropic and Gemini all charge); batch trades latency for price.' : null,
      cacheHitPct > 0 ? 'Cache savings apply to INPUT tokens only, and ignore cache-write premiums and TTL expiry.' : null,
      (() => {
        const cc = crossCheck(m.id, m.price.in, orSnap)
        if (!cc) return null
        const bits = []
        if (cc.agrees === false) bits.push(cc.note)
        if (cc.quantization?.mixed) {
          bits.push(`Providers serve ${m.label} at ${cc.quantization.distinctPrecisions} different precisions (${Object.keys(cc.quantization.byPrecision).filter((k) => k !== 'unknown').join(', ')}). You selected ${precision} for self-hosting, so the API median is NOT a like-for-like comparison — a cheap listing may be a heavily quantized one.`)
        }
        if (cc.uptime && cc.uptime.min < 95) bits.push(`Observed provider uptime on this model ranges ${cc.uptime.min}%-${cc.uptime.max}%. The API side of this comparison assumes availability; the cheapest provider is not always the reliable one.`)
        return bits.length ? bits.join(' ') : null
      })(),
      m.commercial ? null : `${m.label} is non-commercial (${m.license}) — a paid license is required to self-host it in a product.`
    ].filter(Boolean)
  }
}

// Compare the first N models at one workload (drives the top-10 view).
export function computeCompare(q, feed, gpuFeed, orSnap) {
  const limit = Math.min(+q.limit || 10, 50)
  const priced = pricedModels(feed)
  const results = priced.slice(0, limit).map((m) => {
    const d = computeDecision({ ...q, model: m.id }, feed, gpuFeed, orSnap)
    return {
      id: m.id, label: m.label, verdict: d.verdict, selfHostBasis: d.selfHost.basis,
      selfHostPer1MUSD: d.selfHost.per1MUSD,
      neocloudPer1MUSD: d.neocloud.effectivePer1MUSD,
      priceSource: d.neocloud.source,
      breakEvenDuty: d.selfHost.breakEvenDuty,
      breakEvenTokensPerDay: d.selfHost.breakEvenTokensPerDay,
      paybackMonths: d.selfHost.paybackMonths
    }
  })
  const w = resolveWorkload(q)
  return {
    workload: {
      peakTokPerMin: Math.round(w.peakTokPerMin), dutyPct: round(w.dutyPct),
      outputShare: round(w.outputShare), statedAs: w.stated,
      precision: q.precision || 'per-model serving precision (see each row)'
    },
    count: results.length, results, pricesAsOf: feed?.asOf || null
  }
}

export function catalog(feed) {
  const models = pricedModels(feed)
  const live = models.filter((m) => m.livePrice).length
  return {
    asOf: feed?.asOf || null, live: !!feed?.live, count: models.length,
    // Honest provenance: how much of this catalog is actually feed-priced.
    priceCoverage: { live, curated: models.length - live, livePct: Math.round((live / models.length) * 100) },
    qualityBasis: QUALITY_BASIS,
    models
  }
}

// Provenance for machines — rendered from the SAME registry as the Sources tab,
// so the public claim and the machine-readable one cannot drift.
export function sources() {
  const byConfidence = SOURCE_LAYERS.reduce((a, l) => ({ ...a, [l.confidence]: (a[l.confidence] || 0) + 1 }), {})
  return {
    positioning: 'This tool aggregates public feeds and published figures; it does not generate data. Its contribution is dimensional — making scattered prices, GPU rates and hardware specs comparable in one question.',
    confidenceScale: CONFIDENCE_META,
    summary: byConfidence,
    layers: SOURCE_LAYERS,
    knownGaps: KNOWN_GAPS,
    credits: CREDITS,
    rule: 'Layers marked `estimate` are our own judgement and are flagged wherever they appear. Do not present them as measurements.'
  }
}

// The OpenRouter connector's own surface: freshness, jurisdiction, coverage.
export function openrouter(snap) {
  const fresh = freshness(snap)
  if (!snap) return { ...fresh, refreshWith: 'npm run refresh:openrouter' }
  return {
    ...fresh,
    source: snap.source,
    counts: snap.counts,
    jurisdictions: jurisdictions(snap),
    // Per-catalog-model detail the UI looks up. Deliberately feed-independent:
    // the client computes the LiteLLM-vs-OpenRouter ratio from its own price, so
    // this endpoint stays cacheable and doesn't need the price feed.
    byModel: Object.fromEntries(
      Object.entries(snap.endpoints || {}).map(([id, e]) => {
        const ins = e.providers.map((p) => p.in).filter((v) => v != null).sort((a, b) => a - b)
        const outs = e.providers.map((p) => p.out).filter((v) => v != null).sort((a, b) => a - b)
        const ups = e.providers.map((p) => p.uptime30m).filter((v) => v != null)
        const mid = (a) => (a.length ? (a.length % 2 ? a[a.length >> 1] : (a[(a.length >> 1) - 1] + a[a.length >> 1]) / 2) : null)
        const r4 = (n) => (n == null ? null : Math.round(n * 1e4) / 1e4)
        return [id, {
          openrouterId: e.orId,
          providers: e.providers.length,
          medianIn: r4(mid(ins)),
          medianOut: r4(mid(outs)),
          quantization: e.quantization,
          uptime: ups.length ? { min: r4(Math.min(...ups)), max: r4(Math.max(...ups)), sampled: ups.length } : null
        }]
      })
    ),
    // Observed serving precision per model — the evidence behind the tool's
    // default precision, shipped to the client so it computes the same answer.
    servingPrecision: servingPrecisionMap(snap),
    mixedPrecisionModels: Object.entries(snap.endpoints || {})
      .filter(([, e]) => e.quantization?.mixed)
      .map(([id, e]) => ({
        id, openrouterId: e.orId, providers: e.providers.length,
        precisions: Object.keys(e.quantization.byPrecision).filter((k) => k !== 'unknown'),
        byPrecision: e.quantization.byPrecision
      })),
    unmatched: snap.unmatched || [],
    refreshWith: 'npm run refresh:openrouter',
    caveats: [
      'Weekly batch, not a live call — the server reads a committed snapshot so it keeps working when OpenRouter is unreachable.',
      'Throughput and latency exist in the OpenRouter schema but are null without an API key, so this connector does not yet close the measured-throughput gap.',
      'Uptime and quantization are as reported by OpenRouter for traffic routed through their gateway.'
    ]
  }
}

export function frontier(feed) {
  return { asOf: feed?.asOf || null, count: frontierModels(feed).length, models: frontierModels(feed) }
}

// GPU catalog with LIVE rental prices where the marketplace feed reached us.
export async function gpus() {
  const feed = await getGpuPrices()
  return {
    asOf: feed.asOf, live: feed.live, source: feed.source, tier: feed.tier,
    covered: feed.covered,
    capexAsOf: CAPEX_AS_OF,
    capexNote: 'Purchase prices are dated constants, not a live feed — no comparable open feed exists.',
    gpus: pricedGpus(feed),
    caveats: feed.caveats
  }
}
export function providers() { return { neoclouds: NEOCLOUDS } }
export function precisions() { return { precisions: PRECISIONS } }

export const API_INDEX = {
  name: 'should-i-self-host API',
  description: 'Decide whether to self-host an open LLM or use a neocloud API, with live-priced TCO.',
  skill: '/SKILL.md',
  endpoints: {
    'GET /api/decide': 'Verdict + full TCO for one model. Workload EITHER as dailyRequests + avgTokensIn + avgTokensOut + peakiness, OR as peakTokPerMin + dutyPct + outputShare. Also: model, precision, gpu, mode(rent|own|auto), sovereign(bool), cacheHitPct, batchPct.',
    'GET /api/compare': 'Compare the first N models at a workload. Query: limit, plus any /api/decide workload params.',
    'GET /api/models': 'The 50-model catalog with dimensions (size, context, license, modality, cutoff) and live input/output pricing with provider spread.',
    'GET /api/openrouter': 'OpenRouter connector: snapshot freshness, provider jurisdictions (HQ + datacenters), and which models are served at more than one precision.',
    'GET /api/sources': 'Full provenance: every data layer with its source, refresh cadence, confidence class and limitations, plus known gaps and upstream credits.',
    'GET /api/frontier': 'Frontier closed-model API prices (GPT / Claude / Gemini) from the live feed — the baseline self-hosting is judged against.',
    'GET /api/providers': 'Neocloud providers + reference pricing.',
    'GET /api/gpus': 'GPU catalog (VRAM, rent/own price, power).',
    'GET /api/precisions': 'Serving precisions (fp16/fp8/int4).',
    'GET /api/prices': 'The dated live pricing feed (LiteLLM).'
  }
}
