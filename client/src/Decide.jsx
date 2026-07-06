import React, { useMemo, useState } from 'react'
import { GPUS, PRECISIONS, pricedModels } from './hwdata.js'
import { modelEconomics, fmtGB } from './hwcalc.js'
import { money, compact } from './calc.js'

const BASE = {
  amortMonths: 36, kwhCost: 0.12, pue: 1.3, overheadPct: 15,
  personnelMonthly: 3000, spacePerKwMonth: 150
}
const GPU = GPUS.find((g) => g.id === 'h100')

export default function Decide({ onNavigate, feed }) {
  const [modelId, setModelId] = useState('deepseek-v3')
  const [precision, setPrecision] = useState('fp16')
  const [peakTokPerMin, setPeak] = useState(100000)
  const [dutyPct, setDuty] = useState(30)
  const [mode, setMode] = useState('rent')
  const [sovereign, setSovereign] = useState(false)

  const models = useMemo(() => pricedModels(feed), [feed])
  const top10 = models.slice(0, 10)
  const model = models.find((m) => m.id === modelId) || models[0]
  const econOpts = { ...BASE, mode, peakTokPerMin, dutyPct, haFactor: sovereign ? 2 : 1 }
  const e = useMemo(() => modelEconomics(model, GPU, precision, econOpts),
    [model, precision, mode, peakTokPerMin, dutyPct, sovereign])

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
    reason = `At ${compact(peakTokPerMin)}/min peak and ${dutyPct}% duty, self-host would cost about ${ratio.toFixed(1)}× the neocloud bill. Self-host is a fixed cost sized for peak; you’re idle ${100 - dutyPct}% of the time, so pay-per-token wins.`
  } else {
    verdict = 'Self-host it'
    cls = 'v-self'
    reason = `Your sustained load is high enough that self-host’s fixed cost beats pay-per-token — the neocloud bill would be about ${(1 / ratio).toFixed(1)}× your self-host cost. Break-even sits around ${(e.breakEvenDuty * 100).toFixed(0)}% duty.`
  }

  return (
    <>
      {/* ---- HERO: interactive top-10 comparison ---- */}
      <section className="panel">
        <h2 className="q">Top 10 open models — self-host vs neocloud</h2>
        <p className="muted">
          Set your workload once, then compare the cost per million tokens of running each
          model yourself vs renting it from a neocloud API. <b>Click any model</b> for the full breakdown.
        </p>
        <div className="grid">
          <label className="field"><span>Peak demand (tokens/min)</span>
            <input type="number" step="10000" value={peakTokPerMin} onChange={(ev) => setPeak(+ev.target.value || 0)} />
          </label>
          <label className="field"><span>Duty cycle: {dutyPct}% of the time</span>
            <input type="range" min="1" max="100" value={dutyPct} onChange={(ev) => setDuty(+ev.target.value)} />
            <em className="hint">How much of the time you’re actually busy</em>
          </label>
          <label className="field"><span>Precision</span>
            <select value={precision} onChange={(ev) => setPrecision(ev.target.value)}>
              {PRECISIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Hardware basis</span>
            <select value={mode} onChange={(ev) => setMode(ev.target.value)}>
              <option value="rent">Rent GPUs</option>
              <option value="own">Own hardware</option>
            </select>
          </label>
          <label className="check sovtoggle">
            <input type="checkbox" checked={sovereign} onChange={(ev) => setSovereign(ev.target.checked)} />
            My data must stay in-house (sovereignty / compliance)
          </label>
        </div>
        <Top10Chart models={top10} precision={precision} econOpts={econOpts} selectedId={modelId} onSelect={setModelId} />
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
          <Stat label={`Self-host (${mode === 'rent' ? 'rented' : 'owned'})`} value={money(e.selfHostMonthly) + '/mo'} sub={`fixed · ${e.numGpus}× H100 ${mode === 'rent' ? 'rented 24×7' : `owned, ${BASE.amortMonths}mo amort`} · $${e.selfHostPer1M < 1000 ? e.selfHostPer1M.toFixed(2) : compact(e.selfHostPer1M)}/1M`} />
          <Stat label="Neocloud API" value={money(e.apiMonthly) + '/mo'} sub={`variable · $${e.apiPer1M.toFixed(2)}/1M${model.livePrice ? ' (live)' : ''} · ${compact(monthlyTokens)} tok/mo`} />
          <Stat label="Break-even duty" value={e.breakEvenDuty > 1 ? 'never' : (e.breakEvenDuty * 100).toFixed(0) + '%'} sub="self-host wins above this" />
          <Stat label="Model VRAM" value={fmtGB(e.vram)} sub={`${precision} · fits ${e.numGpus}× 80GB`} />
        </div>
      </section>

      <section className="panel">
        <h3>Self-host vs neocloud as your usage grows</h3>
        <p className="muted">
          Self-host is a <b>flat line</b> — you pay for peak capacity 24×7 no matter how much you use it.
          The neocloud bill <b>rises with your duty cycle</b>. Where they cross is your break-even; the
          dashed line is where you are now.
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

      <section className="panel">
        <h3>Price outlook — 6 months to 5 years, three scenarios</h3>
        <p className="muted">
          Neocloud prices have fallen ~10×/year. Your self-host cost is <b>fixed</b> (solid line,
          {mode === 'rent' ? ' rented' : ' owned'} GPUs). The dashed lines project the neocloud price
          for <b>{model.label}</b> under best / conservative / worst decline scenarios; the shaded band
          is the range between them.
        </p>
        <ScenarioChart e={e} mode={mode} />
      </section>

      <section className="panel">
        <h3>Why this answer</h3>
        <ul className="src">
          <li><b>Fixed vs variable is the whole game.</b> Self-host cost doesn’t shrink when you’re idle; the API bill does. Low duty cycle → API wins; high, steady load → self-host can win.</li>
          <li><b>Peak sizes the hardware, duty sizes the bill.</b> You must provision {e.numGpus} GPUs for your peak, but only actually use them {dutyPct}% of the time.</li>
          <li><b>The real self-host cost isn’t the GPU.</b> Personnel to run the serving stack and idle capacity usually dominate — a rented GPU is the small part.</li>
          <li><b>Prices are a moving target.</b> Neocloud prices fall ~10×/year, so a break-even that looks close today often widens against self-host over the hardware’s life.</li>
          {!model.commercial && <li><b>License matters.</b> {model.label} is non-commercial — legality, not just cost, may decide this.</li>}
        </ul>
        <div className="cta">
          <button className="link" onClick={() => onNavigate('hardware')}>Tune the full TCO →</button>
          <button className="link" onClick={() => onNavigate('sovereign')}>See the sovereignty premium over time →</button>
          <button className="link" onClick={() => onNavigate('catalog')}>Compare all 50 models →</button>
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

// Interactive top-10 comparison: log-scaled $/1M bars (self-host vs neocloud) per
// model; click a row to load its full breakdown. Recomputes with the shared controls.
function Top10Chart({ models, precision, econOpts, selectedId, onSelect }) {
  const rows = models.map((m) => ({ m, e: modelEconomics(m, GPU, precision, econOpts) }))
  const vals = rows.flatMap(({ e }) => [e.selfHostPer1M, e.apiPer1M]).filter((v) => isFinite(v) && v > 0)
  const lg = (v) => Math.log10(Math.max(v, 0.01))
  const lo = lg(Math.min(...vals)), hi = lg(Math.max(...vals))
  const w = (v) => (hi > lo ? Math.max(3, ((lg(v) - lo) / (hi - lo)) * 100) : 50) + '%'

  return (
    <div className="top10">
      {rows.map(({ m, e }, i) => (
        <button
          key={m.id}
          className={'t10row' + (m.id === selectedId ? ' sel' : '')}
          onClick={() => onSelect(m.id)}
          title="Click for the full breakdown"
        >
          <div className="t10label"><span className="t10rank">{i + 1}</span>{m.label}</div>
          <div className="t10bars">
            <div className="cbar"><div className="fill self" style={{ width: w(e.selfHostPer1M) }} /><span className="cval">${e.selfHostPer1M < 1000 ? e.selfHostPer1M.toFixed(2) : compact(e.selfHostPer1M)}</span></div>
            <div className="cbar"><div className="fill api" style={{ width: w(e.apiPer1M) }} /><span className="cval">${e.apiPer1M.toFixed(2)}{m.livePrice ? ' •' : ''}</span></div>
          </div>
          <div className={'t10win ' + (e.winsSelfHost ? 'w-self' : 'w-api')}>{e.winsSelfHost ? 'self-host' : 'neocloud'}</div>
        </button>
      ))}
      <div className="legend">
        $/1M tokens (log scale) · <span className="dot self" /> self-host ({econOpts.mode === 'rent' ? 'rented' : 'owned'} GPUs, {econOpts.dutyPct}% duty)
        <span className="dot api" /> neocloud · <b>•</b> = live price · click a model to drill in
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
        <text x={W - padR} y={y(self) - 6} textAnchor="end" className="lbl" fill="#34c759">self-host (fixed, {mode === 'rent' ? 'rented' : 'owned'})</text>
        <text x={W - padR} y={y(neoMax) + 14} textAnchor="end" className="lbl" fill="#0071e3">neocloud (variable)</text>
      </svg>
      <div className="legend">
        Monthly cost · <span className="dot" style={{ background: '#34c759' }} /> self-host {money(self)}/mo
        <span className="dot" style={{ background: '#0071e3' }} /> neocloud {money(curNeo)}/mo at your {dutyPct}% duty
      </div>
    </div>
  )
}

// Forward price outlook: self-host flat (solid) vs neocloud price under 3 dashed
// scenarios (best / conservative / worst decline), stock-forecast style with a
// shaded uncertainty band. Log y-axis so exponential decay reads as straight lines.
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

  // If self-host wins today (self < neo0), when does the conservative price fall below it?
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
        {/* near-term emphasis band (0–12 mo) */}
        <rect x={x(0)} y={padT} width={x(12) - x(0)} height={H - padT - padB} fill="rgba(0,113,227,0.04)" />
        <text x={(x(0) + x(12)) / 2} y={padT + 11} textAnchor="middle" className="axl">near term</text>

        {/* uncertainty band + scenario lines */}
        <path d={`${bandTop} ${bandBot} Z`} fill="rgba(0,113,227,0.08)" />
        {SCEN.map((s) => (
          <path key={s.key} d={linePath(s.rate)} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />
        ))}
        {/* fixed self-host */}
        <path d={`M${x(0)},${y(self)} L${x(months)},${y(self)}`} fill="none" stroke="#34c759" strokeWidth="2.5" />
        <text x={W - padR} y={y(self) - 6} textAnchor="end" className="lbl" fill="#248a3d">self-host (fixed, {mode === 'rent' ? 'rented' : 'owned'})</text>

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
