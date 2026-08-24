// Regenerates every number in docs/measuring-open-model-inference.md.
//
// Exists because a reviewer pointed out that the paper's tables could not be
// reproduced from the repo: no recorded precision, basis, duty cycle or GPU
// price, and a self-host side that moves daily with a live spot feed. Now the
// paper's figures come from here, and here prints the configuration it used.
//
// Run: node scripts/paper-figures.mjs   (add --live to re-fetch instead of using
// the committed snapshots; default is the pinned path so the paper is stable.)

import { readFileSync } from 'node:fs'
import { MODELS, pricedGpus, pricedModels, servingPrecisionFor } from '../client/src/hwdata.js'
import { modelEconomics, deriveWorkload, decomposeCost, vramNeed, gpusNeeded } from '../client/src/hwcalc.js'
import { BENCHMARKS, throughputFor } from '../client/src/throughput.js'
import { servingPrecisionMap } from '../server/openrouter.js'

const J = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
const orSnap = J('../server/openrouter-snapshot.json')
const hist = J('../server/price-history.json')
const LIVE = process.argv.includes('--live')

const feed = LIVE
  ? await (await fetch('http://localhost:3001/api/prices')).json()
  : { prices: J('../server/paper-prices.json').prices, asOf: J('../server/paper-prices.json').asOf }
const gpuFeed = LIVE
  ? await (await fetch('http://localhost:3001/api/gpus')).json()
  : J('../server/paper-gpu-prices.json')

// ---- the exact configuration behind every table below -------------------------
const CFG = {
  dailyRequests: 200000, avgTokensIn: 2000, avgTokensOut: 500, peakiness: 3,
  gpuId: 'h100', mode: 'auto', cacheHitPct: 0, batchPct: 0, haFactor: 1,
  amortMonths: 36, kwhCost: 0.12, pue: 1.3, overheadPct: 15,
  personnelMonthly: 3000, spacePerKwMonth: 150
}
const SP = servingPrecisionMap(orSnap)
const gpu = pricedGpus(gpuFeed.feed || gpuFeed).find((g) => g.id === CFG.gpuId)
const priced = pricedModels(feed)
const w = deriveWorkload(CFG)
const opts = { ...CFG, peakTokPerMin: w.peakTokPerMin, dutyPct: w.dutyPct, outputShare: w.outputShare }

const hr = (t) => console.log(`\n${'─'.repeat(78)}\n${t}\n`)
const f2 = (n) => (n == null || !isFinite(n) ? '—' : n.toFixed(2))

console.log('PAPER FIGURES — opentoken')
console.log(`prices as of ${feed.asOf} · GPU feed ${gpuFeed.asOf || gpuFeed.feed?.asOf || 'constants'} · openrouter snapshot ${orSnap.fetchedAt?.slice(0,10)}`)
console.log(`workload: ${CFG.dailyRequests.toLocaleString()} req/day, ${CFG.avgTokensIn} in / ${CFG.avgTokensOut} out,`)
console.log(`peakiness ${CFG.peakiness} => ${Math.round(w.peakTokPerMin).toLocaleString()} tok/min peak, ${w.dutyPct.toFixed(1)}% duty`)
console.log(`hardware: ${gpu.name} @ $${gpu.rentHr}/hr (${gpu.rentSource}), capex $${gpu.capex}, ${CFG.amortMonths}mo amortisation`)
console.log(`staffing $${CFG.personnelMonthly}/mo · overhead ${CFG.overheadPct}% · HA ${CFG.haFactor}x · duty from traffic shape`)

// ---- TABLE 1: cost multiple, at served precision, floor AND loaded ------------
hr('TABLE 1 — cost vs neocloud, at the precision providers actually serve')
console.log('model                served  TPT  VRAM   fleet   floor$  floor×   loaded$  loaded×  verdict')
const PICKS = ['qwen3-30b-a3b', 'gemma4-31b', 'llama-70b', 'gpt-oss-120b', 'deepseek-v3']
for (const id of PICKS) {
  const m = priced.find((x) => x.id === id); if (!m) { console.log(`  ${id}: not priced`); continue }
  const sp = servingPrecisionFor(m, SP[id])
  const e = modelEconomics(m, gpu, sp.id, opts)
  const d = decomposeCost(e)
  const tpt = gpusNeeded(m, gpu, sp.id)
  console.log(
    `${m.label.padEnd(20)} ${sp.id.padEnd(6)} ${String(tpt).padStart(3)}  ` +
    `${String(vramNeed(m, sp.id)).padStart(4)}GB ${String(e.numGpus).padStart(4)}gpu ` +
    `${f2(d.floor.per1M).padStart(7)} ${f2(d.floor.multipleOfNeocloud).padStart(6)}× ` +
    `${f2(e.selfHostPer1M).padStart(8)} ${f2(e.ratio).padStart(7)}×  ${e.winsSelfHost ? 'SELF-HOST' : 'neocloud'}`
  )
}
console.log('\nfloor = bare compute at 100% utilisation, nobody paid, no overhead, no idle.')
console.log('loaded = what you actually pay at this workload. These are different quantities.')

// fp16 reference column, so the change from the published version is visible.
console.log('\nfp16 reference (the unquantised footprint, NOT a deployment):')
for (const id of PICKS) {
  const m = priced.find((x) => x.id === id); if (!m) continue
  const e = modelEconomics(m, gpu, 'fp16', opts)
  console.log(`  ${m.label.padEnd(20)} ${String(gpusNeeded(m, gpu, 'fp16')).padStart(3)} TPT  ${String(vramNeed(m,'fp16')).padStart(5)}GB  ${f2(e.ratio).padStart(6)}× loaded`)
}

// ---- TABLE 2: price index, three estimators ----------------------------------
hr('TABLE 2 — price index over the fixed basket, three estimators')
const s = hist.series, a = s[0], b = s[s.length - 1]
const common = Object.keys(a.models).filter((id) => b.models[id] && a.models[id].in > 0)
const rel = common.map((id) => b.models[id].in / a.models[id].in)
const months = 18, yrs = months / 12
const carli = rel.reduce((x, y) => x + y, 0) / rel.length
const jevons = Math.exp(rel.reduce((x, r) => x + Math.log(r), 0) / rel.length)
const median = [...rel].sort((x, y) => x - y)[rel.length >> 1]
console.log(`basket n=${rel.length}   ${a.date} -> ${b.date}`)
for (const [name, v] of [['Carli (arithmetic mean of relatives)', carli], ['Jevons (geometric)', jevons], ['Median relative', median]])
  console.log(`  ${name.padEnd(38)} total ${v.toFixed(3)}   annualised ${(v ** (1 / yrs)).toFixed(3)}×/yr`)

// provider drift, and the grew-vs-stable split
let pa = 0, pb = 0
const grew = [], stable = []
for (const id of common) {
  const na = a.models[id].providers, nb = b.models[id].providers
  if (na && nb) { pa += na; pb += nb; (nb >= na * 3 ? grew : stable).push(b.models[id].in / a.models[id].in) }
}
const geo = (xs) => Math.exp(xs.reduce((x, r) => x + Math.log(r), 0) / xs.length)
console.log(`\nprovider observations inside the "fixed" basket: ${pa} -> ${pb} (${(pb / pa).toFixed(2)}x)`)
console.log(`  gained >=3x providers (n=${grew.length}): geomean relative ${geo(grew).toFixed(3)}`)
console.log(`  stable provider count (n=${stable.length}): geomean relative ${geo(stable).toFixed(3)}`)

// ---- TABLE 3: throughput residuals -------------------------------------------
hr('TABLE 3 — throughput model residuals, fit points marked')
const FIT = new Set(['70B/h100/8/fp16', '70B/h100/8/fp8', '70B/h100/8/int4', '3B/h100/1/fp16'])
let heldOut = []
console.log('model                     gpu   n  prec   observed  predicted   ratio   role')
for (const bm of BENCHMARKS) {
  const p = throughputFor({ activeB: bm.activeB, totalB: bm.totalB ?? bm.activeB, gpuId: bm.gpu, precision: bm.precision, numGpus: bm.gpus })
  const ratio = p.totalTokPerSec / bm.totalTokPerSec
  const key = `${bm.activeB}B/${bm.gpu}/${bm.gpus}/${bm.precision}`
  const isFit = FIT.has(key)
  const excluded = bm.excluded || bm.src === 'cerebrium-2026' || ((bm.totalB ?? bm.activeB) > 300 && bm.gpus >= 4) || ratio > 3
  const role = isFit ? 'FIT POINT (identity)' : excluded ? (ratio > 3 && bm.src !== 'cerebrium-2026' ? 'EXCLUDED (declared blind spot)' : 'EXCLUDED (cross-harness)') : 'held out'
  if (!isFit && bm.src !== 'cerebrium-2026') heldOut.push(Math.max(ratio, 1 / ratio))
  console.log(`${(bm.model||'').padEnd(25)} ${bm.gpu.padEnd(5)} ${String(bm.gpus).padStart(2)}  ${bm.precision.padEnd(5)} ${String(bm.totalTokPerSec).padStart(8)} ${String(Math.round(p.totalTokPerSec)).padStart(10)}  ${ratio.toFixed(3).padStart(7)}   ${role}`)
}
const blind = heldOut.filter((r) => r > 3)
const clean = heldOut.filter((r) => r <= 3)
console.log(`\nheld out, excluding the declared large-MoE blind spot: n=${clean.length}, geomean ${geo(clean).toFixed(3)}×`)
console.log(`held out, including it:                              n=${heldOut.length}, geomean ${geo(heldOut).toFixed(3)}×`)
console.log(`worst genuinely held-out residual: ${Math.max(...clean).toFixed(2)}× (A100 — no FP8 tensor cores, architecture not bandwidth)`)

// ---- TABLE 4: feed cross-check, computed not asserted ------------------------
hr('TABLE 4 — cross-feed disagreement, with sample sizes and contamination')
let n = 0, dis = 0, worst = { r: 1 }, thin = 0, contaminated = 0, keyHeavy = 0, keyTot = 0, provTot = 0
for (const m of priced) {
  const or = orSnap.endpoints?.[m.id]?.providers || []
  const mine = m.price?.in
  const orIns = or.map((p) => p.in).filter((x) => x > 0).sort((x, y) => x - y)
  if (!mine || !orIns.length) continue
  const orMed = orIns[orIns.length >> 1]
  const nMine = m.price?.spread?.n ?? 0
  const nProv = (m.price?.spread?.providers || []).length
  if (nMine > nProv && nProv > 0) keyHeavy++
  keyTot += nMine; provTot += nProv
  n++
  const r = Math.max(mine / orMed, orMed / mine)
  if (nMine <= 2 || orIns.length <= 2) thin++
  if ((m.price?.spread?.providers || []).includes('openrouter')) contaminated++
  if (r > 1.5) { dis++; if (r > worst.r) worst = { r, id: m.id } }
}
console.log(`comparable models: ${n}`)
console.log(`disagree >1.5x:    ${dis}  (${(dis / n * 100).toFixed(0)}%)   worst ${worst.id} at ${worst.r.toFixed(2)}x`)
console.log(`thin on one side (n<=2): ${thin}  — these are sampling artefacts, not feed disagreement`)
console.log(`LiteLLM medians containing an OpenRouter row: ${contaminated} — to that extent the feeds are NOT independent`)
console.log(`medians taken over KEYS not providers: ${keyHeavy}/${n} models have more keys than providers (${keyTot} keys vs ${provTot} providers)`)
console.log()
