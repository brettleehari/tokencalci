import React, { useMemo, useState } from 'react'
import { GPUS, pricedGpus, pricedModels } from './hwdata.js'
import { modelEconomics, deriveWorkload, apiPricing, fmtGB } from './hwcalc.js'
import { frontierModels } from './pricing.js'
import { money, compact } from './calc.js'

const BASE = {
  amortMonths: 36, kwhCost: 0.12, pue: 1.3, overheadPct: 15,
  personnelMonthly: 3000, spacePerKwMonth: 150
}
const PRECISION = 'fp16'

// Peak-to-average ratio presets. Peakiness and duty cycle are the same knob from
// two ends (duty = 1/peakiness), so stating traffic shape in plain terms gives us
// the duty cycle for free — see deriveWorkload().
const SHAPES = [
  { id: 1,   label: 'Flat — batch/offline', hint: 'runs 24×7 at a steady rate' },
  { id: 2.5, label: 'Business hours',       hint: 'weekday working-hours peak' },
  { id: 4,   label: 'Consumer-spiky',       hint: 'sharp evening/launch peaks' }
]

export default function Decide({ onNavigate, feed, gpuFeed, history, orInfo }) {
  const [modelId, setModelId] = useState('deepseek-v3')
  const [sovereign, setSovereign] = useState(false)
  // Workload can be stated the way people actually know it (requests + prompt
  // sizes) or, for those who think in fleet terms, directly as peak and duty.
  const [inputMode, setInputMode] = useState('requests')
  const [dailyRequests, setDailyRequests] = useState(200000)
  const [avgIn, setAvgIn] = useState(2000)
  const [avgOut, setAvgOut] = useState(500)
  const [peakiness, setPeakiness] = useState(2.5)
  const [rawPeak, setRawPeak] = useState(100000)
  const [rawDuty, setRawDuty] = useState(30)
  // API-side levers every real team pulls, and no other calculator models.
  const [cacheHitPct, setCacheHit] = useState(0)
  const [batchPct, setBatch] = useState(0)

  const models = useMemo(() => pricedModels(feed), [feed])
  // Second-source detail for the selected model, from the weekly OpenRouter
  // snapshot. The ratio is computed here so the snapshot endpoint stays
  // independent of the live price feed.
  const second = useMemo(() => {
    const b = orInfo?.byModel?.[modelId]
    const mine = models.find((x) => x.id === modelId)?.price?.in
    if (!b?.medianIn || !mine) return null
    const ratio = Math.round((mine / b.medianIn) * 100) / 100
    return { ...b, openrouterMedianIn: b.medianIn, ratio, agrees: ratio <= 1.5 && ratio >= 1 / 1.5 }
  }, [orInfo, modelId, models])
  // H100 stays the reference card here; live rental price when the feed reached us.
  const GPU = useMemo(() => pricedGpus(gpuFeed).find((g) => g.id === 'h100'), [gpuFeed])
  const top10 = models.slice(0, 10)
  const model = models.find((m) => m.id === modelId) || models[0]

  const derived = useMemo(
    () => deriveWorkload({ dailyRequests, avgTokensIn: avgIn, avgTokensOut: avgOut, peakiness }),
    [dailyRequests, avgIn, avgOut, peakiness]
  )
  const byRequests = inputMode === 'requests'
  const peakTokPerMin = byRequests ? derived.peakTokPerMin : rawPeak
  const dutyPct = byRequests ? derived.dutyPct : rawDuty
  const outputShare = derived.outputShare

  const baseOpts = {
    ...BASE, peakTokPerMin, dutyPct, outputShare, cacheHitPct, batchPct,
    haFactor: sovereign ? 2 : 1
  }
  const deps = [model, GPU, peakTokPerMin, dutyPct, outputShare, cacheHitPct, batchPct, sovereign]

  const eRent = useMemo(() => modelEconomics(model, GPU, PRECISION, { ...baseOpts, mode: 'rent' }), deps)
  const eOwn = useMemo(() => modelEconomics(model, GPU, PRECISION, { ...baseOpts, mode: 'own' }), deps)
  // Auto-pick the cheaper hardware basis (no toggle — the 3D graph shows both).
  const mode = eOwn.selfHostMonthly < eRent.selfHostMonthly ? 'own' : 'rent'
  const e = mode === 'own' ? eOwn : eRent

  const ratio = e.ratio
  const economicWinner = e.winsSelfHost ? 'self' : 'api'
  const monthlyTokens = peakTokPerMin * (dutyPct / 100) * 43200

  let verdict, cls, reason
  if (sovereign) {
    verdict = 'Self-host — it’s required'
    cls = 'v-sov'
    reason = `Your data can’t leave your infrastructure, so a neocloud API is off the table. Expect to pay roughly ${ratio.toFixed(1)}× what the same model costs on a neocloud — that gap is the price of control.`
  } else if (economicWinner === 'api') {
    verdict = 'Use a neocloud API'
    cls = 'v-api'
    reason = `At ${compact(peakTokPerMin)}/min peak and ${dutyPct}% duty, self-host (${mode === 'own' ? 'owned' : 'rented'} — the cheaper basis) would still cost about ${ratio.toFixed(1)}× the neocloud bill. Self-host is a fixed cost sized for peak; you’re idle ${100 - dutyPct}% of the time, so pay-per-token wins.`
  } else {
    verdict = `Self-host it — ${mode === 'own' ? 'own' : 'rent'} the GPUs`
    cls = 'v-self'
    reason = `Your sustained load is high enough that self-host’s fixed cost (${mode === 'own' ? 'owned' : 'rented'} is cheaper here) beats pay-per-token — the neocloud bill would be about ${(1 / ratio).toFixed(1)}× your self-host cost. Break-even sits around ${(e.breakEvenDuty * 100).toFixed(0)}% duty.`
  }

  return (
    <>
      {/* ---- HERO: 3D view — cost × rent/own vs neocloud × time ---- */}
      <section className="panel">
        <h2 className="q">Self-host vs neocloud over time</h2>
        <p className="muted">
          Three dimensions in one view: <b>cost per million tokens</b> (height), the three
          approaches — <b>self-host rented, self-host owned, and neocloud</b> (depth), and
          how they move over the next <b>5 years</b> (across). Self-host is a fixed plane;
          the neocloud price keeps falling. Pick a model below.
        </p>
        <div className="modeswitch">
          <button className={byRequests ? 'on' : ''} onClick={() => setInputMode('requests')}>By traffic</button>
          <button className={!byRequests ? 'on' : ''} onClick={() => setInputMode('peak')}>By peak &amp; duty</button>
        </div>

        {byRequests ? (
          <>
            <div className="grid narrow">
              <label className="field"><span>Requests per day</span>
                <input type="number" step="10000" min="0" value={dailyRequests} onChange={(ev) => setDailyRequests(Math.max(0, +ev.target.value || 0))} />
              </label>
              <label className="field"><span>Avg input tokens / request</span>
                <input type="number" step="100" min="0" value={avgIn} onChange={(ev) => setAvgIn(Math.max(0, +ev.target.value || 0))} />
                <em className="hint">Prompt + retrieved context</em>
              </label>
              <label className="field"><span>Avg output tokens / request</span>
                <input type="number" step="50" min="0" value={avgOut} onChange={(ev) => setAvgOut(Math.max(0, +ev.target.value || 0))} />
                <em className="hint">The reply</em>
              </label>
              <label className="field"><span>Traffic shape</span>
                <select value={peakiness} onChange={(ev) => setPeakiness(+ev.target.value)}>
                  {SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <em className="hint">{SHAPES.find((s) => s.id === peakiness)?.hint}</em>
              </label>
            </div>
            <p className="derivenote">
              → <b>{compact(derived.dailyTokens)}</b> tokens/day
              ({Math.round(outputShare * 100)}% output) · peak <b>{compact(peakTokPerMin)}</b> tok/min
              · duty cycle <b>{dutyPct.toFixed(0)}%</b>
              <em> — a peak-to-average ratio of {peakiness}× means you sit at peak {dutyPct.toFixed(0)}% of the time.
              That idle time is what self-host pays for and the API doesn’t.</em>
            </p>
          </>
        ) : (
          <div className="grid narrow">
            <label className="field"><span>Peak demand (tokens/min)</span>
              <input type="number" step="10000" value={rawPeak} onChange={(ev) => setRawPeak(+ev.target.value || 0)} />
            </label>
            <label className="field"><span>Duty cycle: {rawDuty}% of the time</span>
              <input type="range" min="1" max="100" value={rawDuty} onChange={(ev) => setRawDuty(+ev.target.value)} />
              <em className="hint">How much of the time you’re actually busy</em>
            </label>
          </div>
        )}

        <div className="grid narrow">
          <label className="field"><span>Prompt cache hit rate: {cacheHitPct}%</span>
            <input type="range" min="0" max="95" value={cacheHitPct} onChange={(ev) => setCacheHit(+ev.target.value)} />
            <em className="hint">Share of <b>input</b> tokens served from cache. Cuts the API bill only.</em>
          </label>
          <label className="field"><span>Batch API share: {batchPct}%</span>
            <input type="range" min="0" max="100" value={batchPct} onChange={(ev) => setBatch(+ev.target.value)} />
            <em className="hint">Latency-tolerant traffic at the standard 50% batch discount.</em>
          </label>
          <label className="check sovtoggle">
            <input type="checkbox" checked={sovereign} onChange={(ev) => setSovereign(ev.target.checked)} />
            My data must stay in-house (sovereignty / compliance)
          </label>
        </div>
        <Iso3DChart eRent={eRent} eOwn={eOwn} neo0={e.apiPer1M} model={model} dutyPct={dutyPct} />
      </section>

      {/* ---- top-10 selector ---- */}
      <section className="panel">
        <h3>Pick a model — top 10 open models at a glance</h3>
        <p className="muted">Self-host (cheaper of rent/own) vs neocloud, $/1M tokens at your workload. Click to load it into the 3D view.</p>
        <Top10Chart models={top10} baseOpts={baseOpts} selectedId={modelId} onSelect={setModelId} dutyPct={dutyPct} gpu={GPU} />
      </section>

      {/* ---- SELECTED MODEL VERDICT ---- */}
      <section className={`panel heroverdict ${cls}`}>
        <div className="vhead">
          <div className="vtitle">{model.label} — {verdict}</div>
          <label className="vpick">Model
            <select value={modelId} onChange={(ev) => setModelId(ev.target.value)}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        </div>
        <p className="vreason">{reason}</p>
        {!model.commercial && (
          <div className="licwarn">
            ⚠ <b>{model.label}</b> ships under a <b>non-commercial license ({model.license})</b> — you’d
            need a paid license to self-host it in a product. It’s fine for research/internal
            evaluation, but a neocloud that has licensed it may be your only compliant option.
          </div>
        )}
        <div className="statrow">
          <Stat label={`Self-host (${mode === 'own' ? 'owned' : 'rented'})`} value={money(e.selfHostMonthly) + '/mo'} sub={`fixed · ${e.numGpus}× H100 · $${e.selfHostPer1M < 1000 ? e.selfHostPer1M.toFixed(2) : compact(e.selfHostPer1M)}/1M`} />
          <Stat label="Neocloud API" value={money(e.apiMonthly) + '/mo'} sub={`variable · $${e.apiPer1M.toFixed(3)}/1M effective · ${compact(monthlyTokens)} tok/mo`} />
          <Stat label="Break-even" value={e.breakEvenDuty > 1 ? 'never' : (e.breakEvenDuty * 100).toFixed(0) + '% duty'}
            sub={isFinite(e.breakEvenTokensPerDay) ? `≈ ${compact(e.breakEvenTokensPerDay)} tokens/day sustained` : 'self-host never catches up'} />
          <Stat label={mode === 'own' ? 'Hardware payback' : 'Model VRAM'}
            value={mode === 'own' ? (e.paybackMonths ? e.paybackMonths.toFixed(0) + ' mo' : 'never') : fmtGB(e.vram)}
            sub={mode === 'own' ? (e.paybackMonths ? 'to repay capex from API savings' : 'API is cheaper than running cost alone') : `${PRECISION} · fits ${e.numGpus}× 80GB`} />
        </div>

        <PriceProvenance model={model} e={e} cacheHitPct={cacheHitPct} batchPct={batchPct} outputShare={outputShare} second={second} />
      </section>

      <section className="panel">
        <h3>Break-even by duty cycle</h3>
        <p className="muted">
          Self-host is a <b>flat line</b> (fixed, {mode === 'own' ? 'owned' : 'rented'}). The neocloud bill
          <b> rises with your duty cycle</b>. Where they cross is your break-even; the dashed line is where you are now.
        </p>
        <CostDutyChart e={e} peakTokPerMin={peakTokPerMin} dutyPct={dutyPct} mode={mode} />
        <div className="sources">
          <b>Sources</b>
          <ul>
            <li><b>API / neocloud prices:</b> LiteLLM <code>model_prices_and_context_window.json</code> (live, dated) + OpenRouter <code>/models</code>; provider pages (DeepInfra, Together, Fireworks, Groq…).</li>
            <li><b>GPU pricing:</b> rental marketplaces — Vast.ai, RunPod, Shadeform; street capex for owned hardware.</li>
            <li><b>Throughput (tokens/sec):</b> heuristic by model size, in the spirit of <code>RahulSChand/gpu_poor</code> and <code>selfhostllm.org</code> — directional, not measured.</li>
            <li><b>Model specs</b> (params, VRAM, license, context, cutoff): model cards / Hugging Face; models.dev.</li>
            <li><b>Power &amp; space:</b> EIA / Eurostat electricity $/kWh; colocation ~$100–200 per kW·month.</li>
          </ul>
        </div>
      </section>

      <FrontierCompare
        feed={feed} e={e} outputShare={outputShare}
        cacheHitPct={cacheHitPct} batchPct={batchPct}
        selfHostMonthly={e.selfHostMonthly} mode={mode}
      />

      <section className="panel">
        <h3>Price outlook — three scenarios</h3>
        <p className="muted">
          The 3D view uses a single (conservative) decline. Here’s the full range: the neocloud price
          for <b>{model.label}</b> projected under best / conservative / worst scenarios (dashed), with the
          uncertainty band, against your fixed self-host cost ({mode === 'own' ? 'owned' : 'rented'}).
        </p>
        <ScenarioChart e={e} mode={mode} />
      </section>

      <section className="panel">
        <h3>Why this answer</h3>
        <ul className="src">
          <li><b>Fixed vs variable is the whole game.</b> Self-host cost doesn’t shrink when you’re idle; the API bill does. Low duty cycle → API wins; high, steady load → self-host can win.</li>
          <li><b>Peak sizes the hardware, duty sizes the bill.</b> You must provision {e.numGpus} GPUs for your peak, but only actually use them {dutyPct}% of the time.</li>
          <li><b>The real self-host cost isn’t the GPU.</b> Personnel to run the serving stack and idle capacity usually dominate — the GPU rental is the small part.</li>
          <li>
            <b>Prices move less than you’ve been told.</b>{' '}
            {history
              ? `Measured over ${history.window.months} months of the price feed’s own history, a fixed basket of the same models moved ${history.fixedBasket.annualMultiple}×/year — essentially flat. Only the cheapest available option falls quickly (${history.cheapestAvailable.annualDeclinePct}%/year), and capturing that means re-platforming to whatever is cheapest. If you intend to stay on one model, the API side is not going to drift away from you the way the "~10×/year" story implies.`
              : 'Per-model list prices are stickier than the commonly repeated "~10×/year"; the projections here let you set the rate yourself.'}
          </li>
          {!model.commercial && <li><b>License matters.</b> {model.label} is non-commercial — legality, not just cost, may decide this.</li>}
        </ul>
        <div className="cta">
          <button className="link" onClick={() => onNavigate('hardware')}>Tune the full TCO →</button>
          <button className="link" onClick={() => onNavigate('sovereign')}>See the sovereignty premium over time →</button>
          <button className="link" onClick={() => onNavigate('catalog')}>Compare all models →</button>
          <button className="link" onClick={() => onNavigate('guide')}>Read the guide →</button>
        </div>
      </section>

      <p className="muted small tokcav">
        Note: Different models use different tokenizers, so the same text becomes a different number
        of tokens per model — direct token-based price comparisons may not be entirely accurate.
      </p>
    </>
  )
}

/* ============================================================
   Isometric 3D view: X = time (now→5yr), Y = $/1M (height),
   Z = approach (self-host rented / owned / neocloud). Self-host
   planes are flat; neocloud declines (conservative −35%/yr).
   ============================================================ */
function Iso3DChart({ eRent, eOwn, neo0, model, dutyPct }) {
  const months = 60
  const rentCost = eRent.selfHostPer1M
  const ownCost = eOwn.selfHostPer1M
  const neoAt = (m) => neo0 * Math.pow(1 - 0.35, m / 12)

  // log cost scale
  const vals = [rentCost, ownCost, neo0, neoAt(months)].filter((v) => v > 0)
  const lmin = Math.log10(Math.min(...vals) * 0.7)
  const lmax = Math.log10(Math.max(...vals) * 1.5)
  const cf = (v) => Math.min(1, Math.max(0, (Math.log10(Math.max(v, 1e-5)) - lmin) / (lmax - lmin)))

  // oblique projection
  const OX = 92, OY = 252, TW = 410, CH = 196, ZX = 30, ZY = -19
  const P = (tf, cfrac, z) => [OX + tf * TW + z * ZX, OY - cfrac * CH + z * ZY]
  const pt = (t, cost, z) => P(t / months, cf(cost), z)

  // z: 0 = neocloud (front), 1 = owned (mid), 2 = rented (back)
  const series = [
    { z: 2, name: 'Rented', color: '#34c759', fill: 'rgba(52,199,89,.16)', flat: rentCost },
    { z: 1, name: 'Owned', color: '#ff9f0a', fill: 'rgba(255,159,10,.16)', flat: ownCost },
    { z: 0, name: 'Neocloud', color: '#0071e3', fill: 'rgba(0,113,227,.16)', flat: null }
  ]
  const costAt = (s, m) => (s.flat != null ? s.flat : neoAt(m))
  const topEdge = (s) => Array.from({ length: months + 1 }, (_, m) => `${m ? 'L' : 'M'}${pt(m, costAt(s, m), s.z).map((n) => n.toFixed(1)).join(',')}`).join(' ')
  const wall = (s) => {
    const top = Array.from({ length: months + 1 }, (_, m) => pt(m, costAt(s, m), s.z))
    const base = [P(1, 0, s.z), P(0, 0, s.z)]
    return [...top, ...base].map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z'
  }

  const yticks = []
  for (let p = Math.floor(lmin); p <= Math.ceil(lmax); p++) yticks.push(Math.pow(10, p))
  const xlabs = [[0, 'now'], [12, '1yr'], [24, '2yr'], [36, '3yr'], [48, '4yr'], [60, '5yr']]

  const W = 690, H = 300

  return (
    <div className="chartwrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="linechart iso" role="img" aria-label="3D view of self-host vs neocloud cost over time">
        {/* floor */}
        <path d={`M${P(0, 0, 0).join(',')} L${P(1, 0, 0).join(',')} L${P(1, 0, 2).join(',')} L${P(0, 0, 2).join(',')} Z`} fill="#eef0f3" />
        {/* cost gridlines on the front-left plane */}
        {yticks.map((t, i) => (
          <g key={i}>
            <line x1={P(0, cf(t), 0)[0]} y1={P(0, cf(t), 0)[1]} x2={P(1, cf(t), 0)[0]} y2={P(1, cf(t), 0)[1]} stroke="#e2e2e7" strokeWidth="1" />
            <text x={P(0, cf(t), 0)[0] - 6} y={P(0, cf(t), 0)[1] + 3} textAnchor="end" className="axl">${t < 1 ? t.toFixed(2) : t.toFixed(0)}</text>
          </g>
        ))}
        {/* time gridlines on floor */}
        {xlabs.map(([m]) => (
          <line key={m} x1={pt(m, vals[0] * 0 + Math.pow(10, lmin), 0)[0]} y1={P(m / months, 0, 0)[1]} x2={P(m / months, 0, 2)[0]} y2={P(m / months, 0, 2)[1]} stroke="#dfe2e6" strokeWidth="1" />
        ))}
        {xlabs.map(([m, lab]) => (
          <text key={lab} x={P(m / months, 0, 0)[0]} y={P(m / months, 0, 0)[1] + 16} textAnchor="middle" className="axl">{lab}</text>
        ))}

        {/* series back-to-front (rented z2, owned z1, neocloud z0) */}
        {series.map((s) => (
          <g key={s.z}>
            <path d={wall(s)} fill={s.fill} />
            <path d={topEdge(s)} fill="none" stroke={s.color} strokeWidth="2.5" />
            <text
              x={pt(months, costAt(s, months), s.z)[0] + 6}
              y={pt(months, costAt(s, months), s.z)[1] + 3}
              className="lbl" fill={s.color}
            >{s.name}</text>
          </g>
        ))}
      </svg>
      <div className="legend">
        $/1M tokens (log height) · time → 5 years (depth = approach) ·
        <span className="dot" style={{ background: '#34c759' }} /> rented
        <span className="dot" style={{ background: '#ff9f0a' }} /> owned
        <span className="dot" style={{ background: '#0071e3' }} /> neocloud ·
        {rentCost <= neo0 || ownCost <= neo0
          ? ' self-host starts cheaper — but the neocloud plane keeps dropping.'
          : ' neocloud is already lower and only falls further at this duty.'}
      </div>
    </div>
  )
}

// Interactive top-10 comparison: log-scaled $/1M bars (cheaper self-host vs neocloud).
function Top10Chart({ models, baseOpts, selectedId, onSelect, dutyPct, gpu }) {
  const rows = models.map((m) => {
    const eR = modelEconomics(m, gpu, PRECISION, { ...baseOpts, mode: 'rent' })
    const eO = modelEconomics(m, gpu, PRECISION, { ...baseOpts, mode: 'own' })
    const e = eO.selfHostMonthly < eR.selfHostMonthly ? eO : eR
    return { m, e, basis: e === eO ? 'own' : 'rent' }
  })
  const vals = rows.flatMap(({ e }) => [e.selfHostPer1M, e.apiPer1M]).filter((v) => isFinite(v) && v > 0)
  const lg = (v) => Math.log10(Math.max(v, 0.01))
  const lo = lg(Math.min(...vals)), hi = lg(Math.max(...vals))
  const w = (v) => (hi > lo ? Math.max(3, ((lg(v) - lo) / (hi - lo)) * 100) : 50) + '%'

  return (
    <div className="top10">
      {rows.map(({ m, e, basis }, i) => (
        <button key={m.id} className={'t10row' + (m.id === selectedId ? ' sel' : '')} onClick={() => onSelect(m.id)} title="Click to load in the 3D view">
          <div className="t10label"><span className="t10rank">{i + 1}</span>{m.label}</div>
          <div className="t10bars">
            <div className="cbar"><div className="fill self" style={{ width: w(e.selfHostPer1M) }} /><span className="cval">${e.selfHostPer1M < 1000 ? e.selfHostPer1M.toFixed(2) : compact(e.selfHostPer1M)} ({basis})</span></div>
            <div className="cbar"><div className="fill api" style={{ width: w(e.apiPer1M) }} /><span className="cval">${e.apiPer1M.toFixed(2)}{m.livePrice ? ' •' : ''}</span></div>
          </div>
          <div className={'t10win ' + (e.winsSelfHost ? 'w-self' : 'w-api')}>{e.winsSelfHost ? 'self-host' : 'neocloud'}</div>
        </button>
      ))}
      <div className="legend">
        $/1M tokens (log scale) · <span className="dot self" /> self-host (cheaper of rent/own, {dutyPct}% duty)
        <span className="dot api" /> neocloud · <b>•</b> = live price
      </div>
    </div>
  )
}

// Monthly cost vs duty cycle: self-host flat (fixed), neocloud linear (variable).
function CostDutyChart({ e, peakTokPerMin, dutyPct, mode }) {
  const W = 640, H = 250, padL = 58, padR = 18, padT = 16, padB = 34
  const neoAt = (d) => (peakTokPerMin * (d / 100) * 43200 / 1e6) * e.apiPer1M
  const self = e.selfHostMonthly
  const neoMax = neoAt(100)
  const yMax = (Math.max(self, neoMax) || 1) * 1.12
  const x = (d) => padL + (d / 100) * (W - padL - padR)
  const y = (v) => padT + (1 - v / yMax) * (H - padT - padB)
  const be = e.breakEvenDuty
  const beX = be <= 1 ? x(be * 100) : null
  const curNeo = neoAt(dutyPct)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax)

  return (
    <div className="chartwrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="linechart" role="img" aria-label="Self-host vs neocloud cost by duty cycle">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#e2e2e7" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="axl">{money(t)}</text>
          </g>
        ))}
        {[0, 25, 50, 75, 100].map((d) => (
          <text key={d} x={x(d)} y={H - 12} textAnchor="middle" className="axl">{d}%</text>
        ))}
        <text x={(padL + W - padR) / 2} y={H - 1} textAnchor="middle" className="axl">duty cycle (share of time busy)</text>
        <path d={`M${x(0)},${y(0)} L${x(100)},${y(neoMax)} L${x(100)},${y(0)} Z`} fill="rgba(0,113,227,0.10)" />
        <path d={`M${x(0)},${y(0)} L${x(100)},${y(neoMax)}`} fill="none" stroke="#0071e3" strokeWidth="2.5" />
        <path d={`M${x(0)},${y(self)} L${x(100)},${y(self)}`} fill="none" stroke="#34c759" strokeWidth="2.5" />
        {beX != null && (
          <g>
            <circle cx={beX} cy={y(self)} r="5" fill="#ff9f0a" />
            <text x={beX} y={y(self) - 10} textAnchor="middle" className="lbl" fill="#ff9f0a">break-even {(be * 100).toFixed(0)}%</text>
          </g>
        )}
        <line x1={x(dutyPct)} y1={padT} x2={x(dutyPct)} y2={H - padB} stroke="#86868b" strokeWidth="1" strokeDasharray="4 3" />
        <circle cx={x(dutyPct)} cy={y(self)} r="3.5" fill="#34c759" />
        <circle cx={x(dutyPct)} cy={y(curNeo)} r="3.5" fill="#0071e3" />
        <text x={x(dutyPct)} y={padT + 10} textAnchor={dutyPct > 80 ? 'end' : 'middle'} className="axl">you: {dutyPct}%</text>
        <text x={W - padR} y={y(self) - 6} textAnchor="end" className="lbl" fill="#34c759">self-host (fixed, {mode === 'own' ? 'owned' : 'rented'})</text>
        <text x={W - padR} y={y(neoMax) + 14} textAnchor="end" className="lbl" fill="#0071e3">neocloud (variable)</text>
      </svg>
      <div className="legend">
        Monthly cost · <span className="dot" style={{ background: '#34c759' }} /> self-host {money(self)}/mo
        <span className="dot" style={{ background: '#0071e3' }} /> neocloud {money(curNeo)}/mo at your {dutyPct}% duty
      </div>
    </div>
  )
}

// Forward price outlook: self-host flat (solid) vs neocloud under 3 dashed scenarios.
function ScenarioChart({ e, mode }) {
  const months = 60
  const self = e.selfHostPer1M
  const neo0 = e.apiPer1M
  const SCEN = [
    { key: 'pes', label: 'Worst · prices flatten (−15%/yr)', rate: 15, color: '#8cc0ff', dash: '2 4' },
    { key: 'con', label: 'Conservative (−35%/yr)', rate: 35, color: '#0071e3', dash: '7 4' },
    { key: 'opt', label: 'Best · prices crash (−55%/yr)', rate: 55, color: '#00337a', dash: '1 4' }
  ]
  const neoAt = (rate, m) => neo0 * Math.pow(1 - rate / 100, m / 12)
  const W = 640, H = 275, padL = 56, padR = 16, padT = 16, padB = 42
  const vals = [self, neo0, neoAt(55, months)].filter((v) => v > 0)
  const ylo = Math.log10(Math.min(...vals) * 0.7)
  const yhi = Math.log10(Math.max(...vals) * 1.4)
  const x = (m) => padL + (m / months) * (W - padL - padR)
  const y = (v) => padT + (1 - (Math.log10(Math.max(v, 1e-4)) - ylo) / (yhi - ylo)) * (H - padT - padB)
  const linePath = (rate) => Array.from({ length: months + 1 }, (_, m) => `${m ? 'L' : 'M'}${x(m).toFixed(1)},${y(neoAt(rate, m)).toFixed(1)}`).join(' ')
  const bandTop = Array.from({ length: months + 1 }, (_, m) => `${m ? 'L' : 'M'}${x(m).toFixed(1)},${y(neoAt(15, m)).toFixed(1)}`).join(' ')
  const bandBot = Array.from({ length: months + 1 }, (_, m) => `L${x(months - m).toFixed(1)},${y(neoAt(55, months - m)).toFixed(1)}`).join(' ')
  const yticks = []
  for (let p = Math.floor(ylo); p <= Math.ceil(yhi); p++) yticks.push(Math.pow(10, p))
  const xlabs = [[0, 'now'], [6, '6mo'], [12, '1yr'], [24, '2yr'], [36, '3yr'], [48, '4yr'], [60, '5yr']]
  let cross = null
  if (self < neo0) { for (let m = 0; m <= months; m++) { if (neoAt(35, m) < self) { cross = m; break } } }

  return (
    <div className="chartwrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="linechart" role="img" aria-label="Neocloud price outlook scenarios vs fixed self-host cost">
        {yticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#e2e2e7" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="axl">${t < 1 ? t.toFixed(2) : t.toFixed(0)}</text>
          </g>
        ))}
        {xlabs.map(([m, lab]) => (
          <g key={m}>
            <line x1={x(m)} y1={padT} x2={x(m)} y2={H - padB} stroke="#eef0f2" strokeWidth="1" />
            <text x={x(m)} y={H - 24} textAnchor="middle" className="axl">{lab}</text>
          </g>
        ))}
        <rect x={x(0)} y={padT} width={x(12) - x(0)} height={H - padT - padB} fill="rgba(0,113,227,0.04)" />
        <text x={(x(0) + x(12)) / 2} y={padT + 11} textAnchor="middle" className="axl">near term</text>
        <path d={`${bandTop} ${bandBot} Z`} fill="rgba(0,113,227,0.08)" />
        {SCEN.map((s) => (
          <path key={s.key} d={linePath(s.rate)} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />
        ))}
        <path d={`M${x(0)},${y(self)} L${x(months)},${y(self)}`} fill="none" stroke="#34c759" strokeWidth="2.5" />
        <text x={W - padR} y={y(self) - 6} textAnchor="end" className="lbl" fill="#248a3d">self-host (fixed, {mode === 'own' ? 'owned' : 'rented'})</text>
        {cross != null && (
          <g>
            <circle cx={x(cross)} cy={y(self)} r="4.5" fill="#ff9f0a" />
            <text x={x(cross)} y={y(self) + 16} textAnchor="middle" className="lbl" fill="#b25e00">~{cross} mo</text>
          </g>
        )}
      </svg>
      <div className="legend">
        {SCEN.map((s) => (
          <span key={s.key} style={{ marginRight: 14 }}>
            <span style={{ display: 'inline-block', width: 16, borderTop: `2px dashed ${s.color}`, verticalAlign: 'middle', marginRight: 5 }} />
            {s.label}
          </span>
        ))}
        <span><span className="dot" style={{ background: '#34c759' }} /> self-host (fixed)</span>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>
        {self >= neo0
          ? `The neocloud already undercuts self-host and only falls further — self-hosting doesn't pay off on cost in any scenario at this duty.`
          : cross != null
            ? `Self-host wins today, but under the conservative scenario the neocloud price drops below your fixed cost in ~${cross} months — after that, self-hosting stops paying off.`
            : `Self-host stays cheaper than the neocloud across all three scenarios for the full 5 years at this duty.`}
      </p>
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="statlabel">{label}</div>
      <div className="statval">{value}</div>
      <div className="statsub">{sub}</div>
    </div>
  )
}

/* Where this model's price came from, and what the discounts did to it. The
   provider spread matters more than the headline: the same open model can cost
   5× more at one provider than another, which swamps every other input here. */
function PriceProvenance({ model, e, cacheHitPct, batchPct, outputShare, second }) {
  const p = model.price
  const sp = p.spread
  const discounted = e.api.effectivePer1M < e.api.listPer1M - 1e-9
  return (
    <div className="provenance">
      {p.source === 'live' ? (
        <>
          <div className="provline">
            <span className="badge live">live</span>
            <b>${p.in}</b>/1M in · <b>${p.out}</b>/1M out
            {p.cacheRead != null && <> · <b>${p.cacheRead}</b>/1M cached in</>}
            <em> — median of {sp.n} provider listing{sp.n === 1 ? '' : 's'} in the feed</em>
          </div>
          {sp.n > 1 && (
            <div className="provline spread">
              Provider spread: input <b>${sp.inMin}–${sp.inMax}</b>, output <b>${sp.outMin}–${sp.outMax}</b>
              <em> — {sp.providers.slice(0, 6).join(', ')}{sp.providers.length > 6 ? `, +${sp.providers.length - 6} more` : ''}.
              Which provider you pick moves this answer more than any other input on this page.</em>
            </div>
          )}
        </>
      ) : (
        <div className="provline">
          <span className="badge curated">curated</span>
          No per-token match for <b>{model.label}</b> in the live feed — this is a directional
          figure with no input/output split, so cache and batch discounts don’t apply to it.
        </div>
      )}
      {second && (
        <>
          <div className={'provline second ' + (second.agrees === false ? 'disagree' : 'agree')}>
            <span className={'badge ' + (second.agrees === false ? 'curated' : 'live')}>
              {second.agrees === false ? 'feeds disagree' : '2 feeds agree'}
            </span>
            OpenRouter median <b>${second.openrouterMedianIn}</b>/1M in across {second.providers} provider
            {second.providers === 1 ? '' : 's'} — {second.ratio}× vs our LiteLLM figure.
            {second.agrees === false && <em> Treat this model’s cost as uncertain and check the provider you’d actually use.</em>}
          </div>
          {second.quantization?.mixed && (
            <div className="provline spread">
              <b>Served at {second.quantization.distinctPrecisions} different precisions</b>
              {' ('}{Object.entries(second.quantization.byPrecision)
                .filter(([k]) => k !== 'unknown')
                .map(([k, v]) => `${k} $${v.medianIn}`).join(', ')}{')'}
              <em> — you picked fp16 for self-hosting, so a cheap API listing may be a heavily
              quantized one. That is not a like-for-like comparison.</em>
            </div>
          )}
          {second.uptime && second.uptime.min < 95 && (
            <div className="provline spread">
              Observed provider uptime <b>{second.uptime.min}%–{second.uptime.max}%</b>
              <em> — the API side of this comparison assumes availability; the cheapest
              provider is not always the reliable one.</em>
            </div>
          )}
        </>
      )}
      <div className="provline">
        Blended at <b>your</b> {Math.round(outputShare * 100)}% output mix: list
        <b> ${e.api.listPer1M.toFixed(3)}</b>/1M
        {discounted && <> → effective <b>${e.api.effectivePer1M.toFixed(3)}</b>/1M after
          {cacheHitPct > 0 ? ` ${cacheHitPct}% cache` : ''}{cacheHitPct > 0 && batchPct > 0 ? ' +' : ''}
          {batchPct > 0 ? ` ${batchPct}% batch` : ''}</>}
        {e.api.cacheApplied && e.api.cacheReadIsEstimate && (
          <em> — no published cache-read rate for this model; savings assume 10% of the input rate.</em>
        )}
      </div>
    </div>
  )
}

/* What the SAME workload costs on a frontier closed API. This is the comparison
   teams actually face — "self-host an open model, or just call GPT/Claude?" —
   and the one a same-model neocloud comparison can't answer. */
function FrontierCompare({ feed, e, outputShare, cacheHitPct, batchPct, selfHostMonthly, mode }) {
  const rows = useMemo(() => {
    return frontierModels(feed)
      .map((f) => {
        const fp = apiPricing(f.price, { monthlyTokens: e.monthlyTokens, outputShare, cacheHitPct, batchPct })
        return { ...f, monthly: fp.monthly, per1M: fp.effectivePer1M }
      })
      .sort((a, b) => a.monthly - b.monthly)
  }, [feed, e.monthlyTokens, outputShare, cacheHitPct, batchPct])

  if (!rows.length) return null
  const max = Math.max(selfHostMonthly, ...rows.map((r) => r.monthly))
  const w = (v) => `${Math.max(1, (v / max) * 100)}%`
  const cheaperThan = rows.filter((r) => r.monthly > selfHostMonthly).length

  return (
    <section className="panel">
      <h3>Versus just calling a frontier API</h3>
      <p className="muted">
        Same {compact(e.monthlyTokens)} tokens/month, priced on the closed frontier models
        from the live feed. Self-hosting an open model only makes sense if it beats the
        frontier option you’d otherwise reach for — not just the same model on a neocloud.
      </p>
      <div className="fcompare">
        <div className="frow self">
          <div className="fname">Self-host {mode === 'own' ? '(owned)' : '(rented)'}</div>
          <div className="cbar"><div className="fill self" style={{ width: w(selfHostMonthly) }} /><span className="cval">{money(selfHostMonthly)}/mo</span></div>
        </div>
        {rows.map((r) => (
          <div className={'frow' + (r.monthly < selfHostMonthly ? ' win' : '')} key={r.id}>
            <div className="fname">{r.label}<span className="th2"> {r.org}</span></div>
            <div className="cbar"><div className="fill api" style={{ width: w(r.monthly) }} /><span className="cval">{money(r.monthly)}/mo · ${r.per1M.toFixed(2)}/1M</span></div>
          </div>
        ))}
      </div>
      <p className="muted small">
        {cheaperThan > 0
          ? `At this volume self-hosting undercuts ${cheaperThan} of ${rows.length} frontier options — but you're also buying a weaker model, so compare on quality you actually need, not price alone.`
          : `At this volume every frontier API is cheaper than self-hosting, and they're stronger models. Self-host here only buys you sovereignty or latency control.`}
      </p>
    </section>
  )
}
