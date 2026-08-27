// Generates Figure 2 from the model itself, so the curve is computed rather than
// drawn. If the cost model changes, re-run this and the figure follows; a diagram
// that has to be redrawn by hand is a diagram that quietly goes stale.
//
// Run: node scripts/make-figure2.mjs

import { writeFileSync, readFileSync } from 'node:fs'
import { pricedGpus, pricedModels } from '../client/src/hwdata.js'
import { modelEconomics, deriveWorkload, deriveConcurrency } from '../client/src/hwcalc.js'
import { analyseOperatingPoint } from '../client/src/sensitivity.js'

const J = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
const gpu = pricedGpus(J('../server/paper-gpu-prices.json')).find((g) => g.id === 'h100')
const model = pricedModels(J('../server/paper-prices.json')).find((m) => m.id === 'llama-70b')

const OPTS = { mode: 'own', amortMonths: 36, kwhCost: 0.12, pue: 1.3, overheadPct: 15,
               personnelMonthly: 3000, spacePerKwMonth: 150, haFactor: 1 }
const BASE = { dailyRequests: 200000, avgIn: 2000, avgOut: 500, peakiness: 2.5, prefixReuse: 0.2 }

const w = deriveWorkload({ dailyRequests: BASE.dailyRequests, avgTokensIn: BASE.avgIn,
                           avgTokensOut: BASE.avgOut, peakiness: BASE.peakiness })
const conc = deriveConcurrency({ peakTokPerMin: w.peakTokPerMin, avgTokensIn: BASE.avgIn, avgTokensOut: BASE.avgOut })

const CTX_MAX = 22000
const pts = []
for (let ctx = 400; ctx <= CTX_MAX; ctx += 50) {
  const e = modelEconomics(model, gpu, 'fp8', {
    ...OPTS, peakTokPerMin: w.peakTokPerMin, dutyPct: w.dutyPct, outputShare: w.outputShare,
    ctxTokens: ctx, concurrency: conc, prefixReuse: BASE.prefixReuse
  })
  pts.push({ ctx, cost: e.selfHostPer1M, gpus: e.numGpus })
}

// Segment the staircase into runs of constant GPU count.
const runs = []
for (const p of pts) {
  const last = runs[runs.length - 1]
  if (!last || last.gpus !== p.gpus) runs.push({ gpus: p.gpus, from: p.ctx, to: p.ctx, cost: p.cost })
  else last.to = p.ctx
}

// Two operating points the paper quotes.
const mid = analyseOperatingPoint(model, gpu, 'fp8', { ...BASE, ctxTokens: 2500, opts: OPTS })
const edge = analyseOperatingPoint(model, gpu, 'fp8', { ...BASE, ctxTokens: 4300, opts: OPTS })
const elOf = (a, id) => a.rows.find((r) => r.id === id).elasticity

// ── geometry ────────────────────────────────────────────────────────────────
const W = 1120, H = 470
const L = 92, R = 1064, T = 74, B = 348
const costs = pts.map((p) => p.cost)
const yMin = Math.min(...costs) * 0.94, yMax = Math.max(...costs) * 1.04
const X = (c) => L + ((c - 400) / (CTX_MAX - 400)) * (R - L)
const Y = (v) => B - ((v - yMin) / (yMax - yMin)) * (B - T)

// Staircase path: horizontal along each run, vertical at each riser.
let d = ''
runs.forEach((r, i) => {
  const y = Y(r.cost)
  d += (i === 0 ? `M${X(r.from).toFixed(1)} ${y.toFixed(1)}` : ` L${X(r.from).toFixed(1)} ${y.toFixed(1)}`)
  d += ` L${X(r.to).toFixed(1)} ${y.toFixed(1)}`
})

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const money = (v) => '$' + v.toFixed(2)

const gridY = []
for (let v = Math.ceil(yMin * 20) / 20; v <= yMax; v += 0.1) gridY.push(v)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
     font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
     role="img" aria-labelledby="f2t f2d">
  <title id="f2t">Cost is piecewise constant in resident context</title>
  <desc id="f2d">Self-host cost per million tokens plotted against resident context. The curve is a
  staircase: flat runs where additional context is free, separated by vertical risers where the fleet
  gains a GPU per replica. Two operating points are marked — one mid-step where the elasticity of
  context is zero, one near a riser where it exceeds two.</desc>
  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <text x="${L}" y="34" font-size="15" font-weight="700" fill="#1d1d1f">Cost is piecewise constant in resident context</text>
  <text x="${L}" y="54" font-size="12.5" fill="#6e6e73">Llama 3.3 70B at fp8 · 200,000 requests/day · concurrency held at ${conc} · same model, same hardware throughout</text>

  <!-- grid -->
  ${gridY.map((v) => `<line x1="${L}" y1="${Y(v).toFixed(1)}" x2="${R}" y2="${Y(v).toFixed(1)}" stroke="#ededf0"/>
  <text x="${L - 10}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#86868b">${money(v)}</text>`).join('\n  ')}
  <line x1="${L}" y1="${B}" x2="${R}" y2="${B}" stroke="#d2d2d7"/>
  <line x1="${L}" y1="${T}" x2="${L}" y2="${B}" stroke="#d2d2d7"/>
  ${[0, 5000, 10000, 15000, 20000].filter((c) => c >= 400).map((c) =>
    `<text x="${X(c).toFixed(1)}" y="${B + 20}" text-anchor="middle" font-size="11" fill="#86868b">${(c / 1000)}K</text>`).join('\n  ')}
  <text x="${((L + R) / 2).toFixed(0)}" y="${B + 42}" text-anchor="middle" font-size="12" fill="#6e6e73">resident context per active request (tokens)</text>
  <text x="26" y="${((T + B) / 2).toFixed(0)}" font-size="12" fill="#6e6e73" transform="rotate(-90 26 ${((T + B) / 2).toFixed(0)})" text-anchor="middle">self-host $ per 1M tokens</text>

  <!-- risers, drawn behind the curve -->
  ${runs.slice(1).map((r) => `<line x1="${X(r.from).toFixed(1)}" y1="${Y(runs[runs.indexOf(r) - 1].cost).toFixed(1)}" x2="${X(r.from).toFixed(1)}" y2="${Y(r.cost).toFixed(1)}" stroke="#ff9f0a" stroke-width="2.5"/>`).join('\n  ')}

  <!-- the staircase -->
  <path d="${d}" fill="none" stroke="#0071e3" stroke-width="2.8" stroke-linejoin="round"/>

  <!-- GPU count per run -->
  ${runs.map((r) => {
    const cx = (X(r.from) + X(r.to)) / 2
    if (X(r.to) - X(r.from) < 40) return ''
    return `<text x="${cx.toFixed(1)}" y="${(Y(r.cost) - 11).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="#0071e3" font-weight="650">${r.gpus} GPU</text>`
  }).join('\n  ')}

  <!-- "free" annotation on the widest run -->
  ${(() => {
    const wide = runs.reduce((a, r) => (X(r.to) - X(r.from) > X(a.to) - X(a.from) ? r : a))
    const cx = (X(wide.from) + X(wide.to)) / 2
    return `<text x="${cx.toFixed(1)}" y="${(Y(wide.cost) + 22).toFixed(1)}" text-anchor="middle" font-size="11" fill="#34c759" font-weight="650">context is free along here</text>
  <text x="${cx.toFixed(1)}" y="${(Y(wide.cost) + 37).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="#6e6e73">elasticity 0.00 — the marginal token costs nothing</text>`
  })()}

  <!-- riser callout -->
  <text x="${(X(runs[1].from) + 12).toFixed(1)}" y="${(T + 16).toFixed(1)}" font-size="11" fill="#c67700" font-weight="650">each riser = +1 GPU per replica</text>
  <text x="${(X(runs[1].from) + 12).toFixed(1)}" y="${(T + 31).toFixed(1)}" font-size="10.5" fill="#6e6e73">the marginal token costs a whole card</text>

  <!-- operating points -->
  <circle cx="${X(2500).toFixed(1)}" cy="${Y(mid.at.cost).toFixed(1)}" r="6" fill="#34c759" stroke="#fff" stroke-width="2"/>
  <circle cx="${X(4300).toFixed(1)}" cy="${Y(edge.at.cost).toFixed(1)}" r="6" fill="#ff9f0a" stroke="#fff" stroke-width="2"/>

  <!-- the comparison panel: the finding -->
  <rect x="${L}" y="382" width="${R - L}" height="72" rx="10" fill="#f5f5f7" stroke="#d2d2d7"/>
  <circle cx="${L + 24}" cy="404" r="5" fill="#34c759"/>
  <text x="${L + 38}" y="408" font-size="12.5" fill="#1d1d1f"><tspan font-weight="700">Mid-step, 2,500 tokens.</tspan> ${(mid.fit.stepUsed * 100).toFixed(0)}% of the step consumed. Elasticity of context <tspan font-weight="700" fill="#34c759">${elOf(mid, 'ctxTokens').toFixed(2)}</tspan> · of volume <tspan font-weight="700" fill="#34c759">${elOf(mid, 'dailyRequests').toFixed(2)}</tspan> (growth dilutes fixed cost)</text>
  <circle cx="${L + 24}" cy="432" r="5" fill="#ff9f0a"/>
  <text x="${L + 38}" y="436" font-size="12.5" fill="#1d1d1f"><tspan font-weight="700">Near the riser, 4,300 tokens.</tspan> ${(edge.fit.stepUsed * 100).toFixed(0)}% consumed. Elasticity of context <tspan font-weight="700" fill="#c67700">${elOf(edge, 'ctxTokens').toFixed(2)}</tspan> · of volume <tspan font-weight="700" fill="#c67700">+${elOf(edge, 'dailyRequests').toFixed(2)}</tspan> — growth now buys hardware</text>
</svg>
`

writeFileSync(new URL('../docs/figures/figure2-piecewise-cost.svg', import.meta.url), svg)
writeFileSync(new URL('../client/public/figures/figure2-piecewise-cost.svg', import.meta.url), svg)
console.log(`Figure 2 written. ${runs.length} steps, risers at ${runs.slice(1).map((r) => r.from).join(', ')} tokens.`)
console.log(`mid-step  ctx 2500: ${(mid.fit.stepUsed * 100).toFixed(0)}% consumed, context elasticity ${elOf(mid, 'ctxTokens').toFixed(2)}, volume ${elOf(mid, 'dailyRequests').toFixed(2)}`)
console.log(`near edge ctx 4300: ${(edge.fit.stepUsed * 100).toFixed(0)}% consumed, context elasticity ${elOf(edge, 'ctxTokens').toFixed(2)}, volume ${elOf(edge, 'dailyRequests').toFixed(2)}`)
