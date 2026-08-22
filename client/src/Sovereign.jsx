import React, { useMemo, useState } from 'react'
import { PRECISIONS, pricedGpus, pricedModels } from './hwdata.js'
import { modelEconomics, sovereignProjection, fmtGB } from './hwcalc.js'
import { money, compact } from './calc.js'

// Sovereign preset: own hardware, HA redundancy, dedicated 24/7 team, compliance
// overhead, domestic power. Bursty (low duty) because you can't burst to a cloud.
const SOV = {
  mode: 'own', haFactor: 2, amortMonths: 48, kwhCost: 0.15, pue: 1.35,
  overheadPct: 30, personnelMonthly: 50000, spacePerKwMonth: 180
}

const SEG = [
  { key: 'personnel', label: 'Personnel', color: '#ff9f0a' },
  { key: 'compute', label: 'Hardware (amortized)', color: '#0071e3' },
  { key: 'overhead', label: 'Compliance / overhead', color: '#af52de' },
  { key: 'space', label: 'Space', color: '#34c759' },
  { key: 'power', label: 'Power', color: '#ff2d55' }
]

export default function Sovereign({ feed, gpuFeed, history, orInfo }) {
  const [modelId, setModelId] = useState('llama-405b')
  const [precision, setPrecision] = useState('fp8')
  const [dutyPct, setDutyPct] = useState(30)
  const [peakTokPerMin, setPeak] = useState(500000)
  // Default to the MEASURED decline, not the folklore figure. Two rates apply and
  // they differ ~20x, so the user picks which world they're in (see below).
  const [driftMode, setDriftMode] = useState('switch')
  const [driftOverride, setDriftOverride] = useState(null)
  const measured = {
    stay: history ? Math.max(0, -history.fixedBasket.annualChangePct) : 2,
    switch: history ? history.cheapestAvailable.annualDeclinePct : 46
  }
  const driftPct = driftOverride ?? Math.round(measured[driftMode])

  const models = useMemo(() => pricedModels(feed), [feed])
  const model = models.find((m) => m.id === modelId)
  const gpu = useMemo(() => pricedGpus(gpuFeed).find((g) => g.id === 'h100'), [gpuFeed])

  const e = useMemo(
    () => modelEconomics(model, gpu, precision, { ...SOV, peakTokPerMin, dutyPct }),
    [model, gpu, precision, peakTokPerMin, dutyPct]
  )
  const months = 48
  const proj = useMemo(
    () => sovereignProjection({ sovPer1M: e.selfHostPer1M, neoPer1M0: e.apiPer1M, driftPctPerYear: driftPct, months }),
    [e, driftPct]
  )
  const premiumNow = proj[0].premium
  const premiumEnd = proj[months].premium

  return (
    <>
      <section className="panel">
        <h2>Sovereign model — the cost of full control</h2>
        <p className="muted">
          A sovereign deployment runs entirely on hardware you own, in your
          jurisdiction — no external API, data never leaves. That removes the
          neocloud escape hatch <i>by policy</i>, so you pay for peak capacity 24×7
          even while idle, plus redundancy, a dedicated team, and compliance. The
          neocloud price becomes a <b>reference</b> — the premium you pay for control.
        </p>
        <div className="grid">
          <label className="field"><span>Sovereign model</span>
            <select value={modelId} onChange={(ev) => setModelId(ev.target.value)}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Precision</span>
            <select value={precision} onChange={(ev) => setPrecision(ev.target.value)}>
              {PRECISIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Peak demand (tokens/min)</span>
            <input type="number" step="50000" value={peakTokPerMin}
              onChange={(ev) => setPeak(+ev.target.value || 0)} />
          </label>
          <label className="field"><span>Duty cycle: {dutyPct}%</span>
            <input type="range" min="5" max="100" value={dutyPct} onChange={(ev) => setDutyPct(+ev.target.value)} />
            <em className="hint">Sovereign load is often bursty — you eat the idle</em>
          </label>
        </div>
        <div className="statrow">
          <Stat label="Capex" value={money(e.capex)} sub={`${e.numGpus}× H100 (incl. ${e.numGpus - e.usableGpus} redundant)`} />
          <Stat label="Opex / month" value={money(e.selfHostMonthly)} sub="fixed, 24×7" />
          <Stat label="$/1M tokens" value={'$' + e.selfHostPer1M.toFixed(2)} sub={`vs $${e.apiPer1M.toFixed(2)} neocloud`} />
          <Stat label="Sovereignty premium" value={premiumNow.toFixed(1) + '×'} sub="today" hot />
        </div>
      </section>

      <JurisdictionPanel orInfo={orInfo} />

      <section className="panel">
        <h3>Where the monthly cost goes</h3>
        <p className="muted">Personnel and idle capacity dominate — not the GPUs.</p>
        <CostStack breakdown={e.breakdown} total={e.selfHostMonthly} />
      </section>

      <section className="panel">
        <h3>How the prediction goes — premium widens as neocloud prices fall</h3>
        <div className="modeswitch">
          <button className={driftMode === 'stay' ? 'on' : ''} onClick={() => { setDriftMode('stay'); setDriftOverride(null) }}>
            I'll stay on this model
          </button>
          <button className={driftMode === 'switch' ? 'on' : ''} onClick={() => { setDriftMode('switch'); setDriftOverride(null) }}>
            I'll keep switching to the cheapest
          </button>
        </div>
        <p className="muted small">
          {history ? (
            <>These are <b>measured</b>, not assumed — from {history.window.months} months of the price
            feed's own git history. Stay on one model and its price barely moves
            (<b>{measured.stay.toFixed(0)}%/year</b>, a fixed basket of {history.fixedBasket.models} models).
            Re-platform to whatever is cheapest and you capture <b>{measured.switch.toFixed(0)}%/year</b>.
            The gap between those two is the single biggest lever on whether owning hardware pays off,
            and it's a decision about your engineering appetite, not about the market.</>
          ) : (
            <>Measured history unavailable — these rates are directional defaults.</>
          )}
        </p>
        <div className="split">
          <div className="splitlabels"><span>Neocloud prices fall <b>{driftPct}%</b>/year{driftOverride == null ? ' (measured)' : ' (your override)'}</span></div>
          <input type="range" min="0" max="80" value={driftPct} onChange={(ev) => setDriftOverride(+ev.target.value)} />
        </div>
        <ProjectionChart proj={proj} months={months} />
        <p className="note warn">
          Your sovereign cost is <b>fixed</b> at ${e.selfHostPer1M.toFixed(2)}/1M. The
          same model on a neocloud falls from ${e.apiPer1M.toFixed(2)} toward
          ${proj[months].neocloud.toFixed(3)}/1M over 4 years — so the premium grows
          from <b>{premiumNow.toFixed(1)}×</b> today to <b>{premiumEnd.toFixed(0)}×</b> by
          month {months}. Sovereignty is never justified on cost alone; it's justified
          by data control, compliance, and guaranteed availability. The chart shows
          exactly how much you're paying for that — and how fast it grows.
        </p>
      </section>
    </>
  )
}

// Sovereignty is a jurisdiction question before it is a cost question. If your data
// merely has to stay in a region — rather than in your own racks — a provider
// headquartered there may satisfy the requirement at a fraction of the premium above.
function JurisdictionPanel({ orInfo }) {
  const j = orInfo?.jurisdictions
  if (!j?.providers?.length) return null
  const byHq = Object.entries(j.byHeadquarters)
    .filter(([k]) => k !== 'unstated')
    .sort((a, b) => b[1].length - a[1].length)

  return (
    <section className="panel">
      <h3>Who serves from where — provider jurisdictions</h3>
      <p className="muted">
        Before paying the sovereignty premium, check whether your requirement is
        <b> in-house</b> or merely <b>in-region</b>. If a provider headquartered in an
        acceptable jurisdiction satisfies your compliance obligation, you get
        pay-per-token economics without buying hardware. These are stated
        headquarters for <b>{j.withJurisdiction}</b> of <b>{j.total}</b> providers,
        from the weekly OpenRouter snapshot.
      </p>
      <div className="jurisgrid">
        {byHq.map(([country, names]) => (
          <div className="jurisbox" key={country}>
            <div className="jurishq">{country} <span>{names.length}</span></div>
            <div className="jurisnames">{names.slice(0, 8).join(', ')}{names.length > 8 ? `, +${names.length - 8} more` : ''}</div>
          </div>
        ))}
      </div>
      <p className="muted small">
        Headquarters is not the same as data residency — a US-headquartered provider
        may run EU datacenters, and vice versa. Treat this as a shortlist to verify
        against each provider's own terms, not as a compliance answer.
      </p>
    </section>
  )
}

function Stat({ label, value, sub, hot }) {
  return (
    <div className={'stat' + (hot ? ' hot' : '')}>
      <div className="statlabel">{label}</div>
      <div className="statval">{value}</div>
      <div className="statsub">{sub}</div>
    </div>
  )
}

function CostStack({ breakdown, total }) {
  return (
    <div>
      <div className="stack">
        {SEG.map((s) => {
          const v = breakdown[s.key] || 0
          const w = total > 0 ? (v / total) * 100 : 0
          if (w < 0.5) return null
          return <div key={s.key} className="seg" style={{ width: w + '%', background: s.color }} title={`${s.label}: ${money(v)}`} />
        })}
      </div>
      <div className="stacklegend">
        {SEG.map((s) => {
          const v = breakdown[s.key] || 0
          if (v <= 0) return null
          return (
            <span key={s.key} className="legitem">
              <span className="dot" style={{ background: s.color }} /> {s.label} — {money(v)} ({((v / total) * 100).toFixed(0)}%)
            </span>
          )
        })}
      </div>
    </div>
  )
}

// SVG line chart: sovereign (flat) vs neocloud (decaying) $/1M over months.
function ProjectionChart({ proj, months }) {
  const W = 620, H = 240, padL = 48, padR = 16, padT = 14, padB = 28
  const maxY = Math.max(proj[0].sovereign, proj[0].neocloud) * 1.1
  const x = (m) => padL + (m / months) * (W - padL - padR)
  const y = (v) => padT + (1 - v / maxY) * (H - padT - padB)
  const line = (key) => proj.map((p, i) => `${i ? 'L' : 'M'}${x(p.month).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ')
  const areaNeo = `${line('neocloud')} L${x(months)},${y(0)} L${x(0)},${y(0)} Z`
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY)

  return (
    <div className="chartwrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="linechart" role="img" aria-label="Sovereign vs neocloud cost projection">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#e2e2e7" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="axl">${t.toFixed(t < 1 ? 2 : 1)}</text>
          </g>
        ))}
        {[0, 12, 24, 36, 48].map((m) => (
          <text key={m} x={x(m)} y={H - 8} textAnchor="middle" className="axl">{m === 0 ? 'now' : m + 'mo'}</text>
        ))}
        <path d={areaNeo} fill="rgba(0,113,227,0.12)" />
        <path d={line('neocloud')} fill="none" stroke="#0071e3" strokeWidth="2.5" />
        <path d={line('sovereign')} fill="none" stroke="#ff9f0a" strokeWidth="2.5" />
        <text x={x(months)} y={y(proj[months].sovereign) - 6} textAnchor="end" className="lbl" fill="#ff9f0a">sovereign (fixed)</text>
        <text x={x(months)} y={y(proj[months].neocloud) - 6} textAnchor="end" className="lbl" fill="#0071e3">neocloud (falling)</text>
      </svg>
      <div className="legend">$/1M tokens over 4 years · <span className="dot" style={{ background: '#ff9f0a' }} /> your sovereign cost <span className="dot" style={{ background: '#0071e3' }} /> same model on neocloud</div>
    </div>
  )
}
