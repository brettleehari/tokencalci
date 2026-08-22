// MEASURED price history, and the two very different decline rates it reveals.
//
// The received wisdom — repeated by vendors, analysts and (until now) this tool —
// is that inference prices fall ~10x/year. Recovered from LiteLLM's own git
// history, that is not what per-token list prices did:
//
//   FIXED BASKET (the same models, tracked over time)
//     Prices are STICKY. A model you picked 18 months ago costs about what it
//     cost then. This is the rate that applies if you commit to one model.
//
//   CHEAPEST AVAILABLE (the frontier of what you could switch to)
//     Falls fast, because new cheaper models keep arriving. This is the rate that
//     applies only if you keep migrating to whatever is cheapest.
//
// The gap between the two is large, and which one you use should depend on
// whether you actually plan to re-platform every time something cheaper ships.
// Quoting the fast rate while staying on one model overstates the case against
// buying hardware — the error this module exists to correct.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MS_PER_MONTH = 1000 * 86400 * 30.44

let cache = null

export async function getHistory() {
  if (cache) return cache
  try {
    const txt = await readFile(join(__dirname, 'price-history.json'), 'utf8')
    cache = JSON.parse(txt)
  } catch {
    cache = null
  }
  return cache
}

const monthsBetween = (a, b) => (new Date(b) - new Date(a)) / MS_PER_MONTH
// Convert a total ratio over N months into an annualised multiple.
const annualise = (ratio, months) => (months > 0 ? Math.pow(ratio, 12 / months) : 1)
const round = (n) => (isFinite(n) ? Math.round(n * 1000) / 1000 : null)

// The headline analysis: both rates, plus the series behind them.
export function analyseHistory(hist) {
  if (!hist?.series?.length) return null
  const s = hist.series
  const base = s[0]
  const last = s[s.length - 1]
  const span = monthsBetween(base.date, last.date)

  // --- Fixed basket: only models priced at BOTH ends, so composition can't move it.
  const common = Object.keys(base.models).filter((id) => last.models[id])
  const indexAt = (p) => {
    const vals = common.filter((id) => p.models[id]).map((id) => p.models[id].in / base.models[id].in)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  const fixedSeries = s.map((p) => ({ date: p.date, index: round(indexAt(p)) })).filter((x) => x.index != null)
  const fixedRatio = indexAt(last)
  const fixedAnnual = annualise(fixedRatio, span)

  // --- Cheapest available: includes new entrants, which is where the fall lives.
  const cheapestAt = (p) => {
    const vals = Object.values(p.models).map((m) => m.in).filter((v) => v > 0)
    return vals.length ? Math.min(...vals) : null
  }
  const cheapSeries = s.map((p) => ({
    date: p.date,
    cheapest: round(cheapestAt(p)),
    catalogPriced: Object.keys(p.models).length
  }))
  const c0 = cheapestAt(base)
  const c1 = cheapestAt(last)
  const cheapAnnual = c1 > 0 ? annualise(c1 / c0, span) : 1

  // Per-model detail, for anyone who wants to check the basket rather than trust it.
  const perModel = common.map((id) => {
    const a = base.models[id].in
    const b = last.models[id].in
    return { id, from: base.date, fromUSD: a, toUSD: b, ratio: round(b / a), annualised: round(annualise(b / a, span)) }
  }).sort((x, y) => x.ratio - y.ratio)

  const unchanged = perModel.filter((m) => Math.abs(m.ratio - 1) < 0.02).length

  return {
    window: { from: base.date, to: last.date, months: Math.round(span), points: s.length },
    fixedBasket: {
      models: common.length,
      totalRatio: round(fixedRatio),
      annualMultiple: round(fixedAnnual),
      annualChangePct: round((fixedAnnual - 1) * 100),
      unchangedModels: unchanged,
      series: fixedSeries,
      meaning: 'Same models tracked over time. Apply this if you commit to one model.'
    },
    cheapestAvailable: {
      fromUSD: round(c0),
      toUSD: round(c1),
      totalRatio: round(c0 / c1),
      annualMultiple: round(c0 / c1 > 0 ? annualise(c0 / c1, span) : 1),
      annualDeclinePct: round((1 - cheapAnnual) * 100),
      series: cheapSeries,
      meaning: 'The cheapest catalog model at each date. Apply this only if you re-platform to whatever is cheapest.'
    },
    perModel,
    // The default the projections should use, and why.
    recommendedDriftPctPerYear: round(Math.max(0, (1 - cheapAnnual) * 100)),
    caveats: [
      'Each point is the LiteLLM price file as committed on that date, normalized and resolved through the same matcher the live app uses.',
      'Some matchers span model generations (e.g. DeepSeek V3 → V3.2), so a few series compare successive releases rather than one frozen model. Treat individual rows as indicative and the basket as the signal.',
      'These are published list prices. They exclude negotiated enterprise rates, committed-use discounts, and free tiers.',
      'A falling price for the CHEAPEST model is not the same as a falling price for the capability you need — cheap new models are not always substitutes.'
    ]
  }
}

export async function historyPayload() {
  const hist = await getHistory()
  if (!hist) return { error: 'no price history available — run: node server/backfill-history.js' }
  const a = analyseHistory(hist)
  return { generatedAt: hist.generatedAt, source: hist.source, ...a }
}
