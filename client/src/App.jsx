import React, { useEffect, useMemo, useState } from 'react'
import {
  QUALITY_BARS, TASK_TYPES, recommendMix
} from './models.js'
import {
  apiTier, selfHostTier, breakEven, driftProjection, heuristicTokPerSec, money, compact
} from './calc.js'
import HardwareDB from './HardwareDB.jsx'
import Sovereign from './Sovereign.jsx'
import Catalog from './Catalog.jsx'

const DEFAULT_TCO = {
  mode: 'rent',        // 'rent' | 'own'
  gpuHourly: 2.5,      // $/hr for a rented H100-class GPU
  gpuCapex: 30000,     // $ to buy one
  gpuVramGB: 80,
  amortMonths: 36,
  utilization: 70,     // %
  powerW: 700,
  pue: 1.3,
  kwhCost: 0.12,
  overheadPct: 20,
  laborMonthly: 0,     // ops/eng time attributable; default 0 but surfaced
  ha: false            // keep a redundant GPU for availability
}

export default function App() {
  const [view, setView] = useState('planner')
  const [feed, setFeed] = useState(null)
  const [feedErr, setFeedErr] = useState(null)

  const [workload, setWorkload] = useState({ dailyRequests: 50000, inTok: 1500, outTok: 400 })
  const [taskId, setTaskId] = useState('rag')
  const [barId, setBarId] = useState('mid')

  const task = TASK_TYPES.find((t) => t.id === taskId)
  const [hardShare, setHardShare] = useState(task.hardShare)
  const [callsPerTask, setCallsPerTask] = useState(task.callsPerTask)

  const [cachePct, setCachePct] = useState(0)
  const [batchPct, setBatchPct] = useState(0)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [tco, setTco] = useState(DEFAULT_TCO)
  const [driftPct, setDriftPct] = useState(40) // ~LLMflation; editable scenario

  // When the task type changes, reset its share/multiplier defaults.
  useEffect(() => {
    setHardShare(task.hardShare)
    setCallsPerTask(task.callsPerTask)
  }, [taskId])

  useEffect(() => {
    fetch('/api/prices')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setFeed(d)
      })
      .catch((e) => setFeedErr(e.message))
  }, [])

  const mix = useMemo(() => recommendMix(feed, barId, taskId), [feed, barId, taskId])

  const tiers = useMemo(() => {
    if (!mix) return null
    const build = (entry, priceInfo, share) => {
      const price = { in: priceInfo.in, out: priceInfo.out, cacheRead: priceInfo.cacheRead }
      const api = apiTier({ workload, share, callsPerTask, price, cachePct, batchPct })
      let self = null, be = null, verdict = ''
      if (entry.open) {
        const params = entry.moeActive || entry.params
        const tierTco = { ...tco, tokPerSec: heuristicTokPerSec(params), params }
        self = selfHostTier({ apiTierResult: api, tco: tierTco })
        be = breakEven({ apiTierResult: api, apiMonthly: api.monthly, selfHost: self })
        const amort = tco.mode === 'own' ? tco.amortMonths : 12
        const selfTotal = self.capex + self.monthlyOpex * amort
        const apiTotal = api.monthly * amort
        const wins = selfTotal < apiTotal ? 'self-host' : 'api'
        verdict = buildVerdict({ entry, api, self, be, wins, tco })
      } else {
        verdict = `Closed weights — cannot self-host. Keep ${entry.label} on the API.`
      }
      return { entry, priceInfo, share, api, self, be, verdict, canSelfHost: entry.open }
    }
    const bulkShare = 100 - hardShare
    return {
      bulk: build(mix.bulk.m, mix.bulk.p, bulkShare),
      strong: build(mix.strong.m, mix.strong.p, hardShare)
    }
  }, [mix, workload, hardShare, callsPerTask, cachePct, batchPct, tco])

  const blendedMonthly = tiers ? tiers.bulk.api.monthly + tiers.strong.api.monthly : 0

  return (
    <div className="wrap">
      <header>
        <h1>Token TCO Planner <span className="beta">beta</span></h1>
        <p className="tag">
          Workload goal → recommended model mix → local-vs-cloud TCO &amp; break-even,
          grounded in a live community price feed.
        </p>
        <PriceStamp feed={feed} feedErr={feedErr} />
        <nav className="tabs">
          <button className={view === 'planner' ? 'on' : ''} onClick={() => setView('planner')}>
            Planner
          </button>
          <button className={view === 'hardware' ? 'on' : ''} onClick={() => setView('hardware')}>
            Hardware &amp; self-host DB
          </button>
          <button className={view === 'sovereign' ? 'on' : ''} onClick={() => setView('sovereign')}>
            Sovereign
          </button>
          <button className={view === 'catalog' ? 'on' : ''} onClick={() => setView('catalog')}>
            Models &amp; providers
          </button>
        </nav>
      </header>

      {view === 'hardware' && <HardwareDB />}
      {view === 'sovereign' && <Sovereign />}
      {view === 'catalog' && <Catalog />}

      {view === 'planner' && (
      <>
      <section className="panel">
        <h2>1 · Define the workload</h2>
        <div className="grid">
          <Num label="Daily requests" value={workload.dailyRequests}
            onChange={(v) => setWorkload({ ...workload, dailyRequests: v })} />
          <Num label="Avg input tokens / request" value={workload.inTok}
            onChange={(v) => setWorkload({ ...workload, inTok: v })} />
          <Num label="Avg output tokens / request" value={workload.outTok}
            onChange={(v) => setWorkload({ ...workload, outTok: v })} />
          <Select label="Task type" value={taskId} onChange={setTaskId}
            options={TASK_TYPES.map((t) => ({ value: t.id, label: t.label }))} />
          <Select label="Quality bar" value={barId} onChange={setBarId}
            options={QUALITY_BARS.map((b) => ({ value: b.id, label: b.label }))} />
          <Num label="LLM calls per task (agentic loops)" value={callsPerTask} step={1}
            onChange={setCallsPerTask} hint="Agentic workloads make many calls per task" />
        </div>

        <button className="link" onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? '− Hide' : '+ Show'} discounts &amp; self-host assumptions
        </button>

        {showAdvanced && (
          <Advanced
            cachePct={cachePct} setCachePct={setCachePct}
            batchPct={batchPct} setBatchPct={setBatchPct}
            tco={tco} setTco={setTco}
          />
        )}
      </section>

      {tiers && (
        <>
          <section className="panel">
            <h2>2 · Recommended mix</h2>
            <p className="muted">
              Route the easy majority to a cheap bulk model, the hard minority to a
              stronger one (design rationale: RouteLLM-style routing). Drag to adjust.
            </p>
            <div className="split">
              <div className="splitlabels">
                <span><b>{100 - hardShare}%</b> → {tiers.bulk.entry.label} <em>(bulk)</em></span>
                <span><b>{hardShare}%</b> → {tiers.strong.entry.label} <em>(strong)</em></span>
              </div>
              <input type="range" min="0" max="100" value={hardShare}
                onChange={(e) => setHardShare(+e.target.value)} />
            </div>
            <div className="blended">
              Blended API cost: <b>{money(blendedMonthly)}/mo</b>
              <span className="muted"> ({money(blendedMonthly * 12)}/yr)</span>
            </div>
          </section>

          <section className="panel">
            <h2>3 · Local-vs-cloud, tier by tier</h2>
            <TierCard t={tiers.bulk} tco={tco} driftPct={driftPct} />
            <TierCard t={tiers.strong} tco={tco} driftPct={driftPct} />
          </section>

          <section className="panel">
            <h2>4 · LLMflation scenario</h2>
            <p className="muted">
              Per-token API prices have fallen roughly 10×/year. Self-host capex is
              sunk and fixed; the API line keeps dropping. Assume API prices fall
              this much per year and see whether self-host still pays off.
            </p>
            <div className="split">
              <div className="splitlabels"><span>API price drop / year: <b>{driftPct}%</b></span></div>
              <input type="range" min="0" max="80" value={driftPct}
                onChange={(e) => setDriftPct(+e.target.value)} />
            </div>
            {tiers.bulk.canSelfHost && (
              <DriftNote t={tiers.bulk} driftPct={driftPct} tco={tco} />
            )}
          </section>
        </>
      )}
      </>
      )}

      <Caveats feed={feed} />
      <footer>
        Beta · all figures directional · numbers trace to your inputs or the dated
        feed above. Not financial advice.
      </footer>
    </div>
  )
}

function buildVerdict({ entry, api, self, be, wins, tco }) {
  const parts = []
  if (wins === 'self-host') {
    parts.push(`Self-host wins at this volume.`)
  } else {
    parts.push(`Keep ${entry.label} on the API at this volume.`)
  }
  if (be.breakEvenTokensPerDay && isFinite(be.breakEvenTokensPerDay)) {
    parts.push(`Break-even ≈ ${compact(be.breakEvenTokensPerDay)} tokens/day.`)
  }
  if (self.utilizationOfFleet < 0.35) {
    parts.push(`Idle warning: your volume uses only ${(self.utilizationOfFleet * 100).toFixed(0)}% of one GPU's capacity — self-host cost doesn't scale down, so $/token stays high.`)
  }
  if (tco.mode === 'own' && be.paybackMonths) {
    parts.push(`Hardware payback ≈ ${be.paybackMonths.toFixed(0)} months.`)
  }
  return parts.join(' ')
}

function TierCard({ t, tco }) {
  const { entry, priceInfo, share, api, self, be, verdict, canSelfHost } = t
  return (
    <div className="tier">
      <div className="tierhead">
        <h3>{entry.label} <span className="prov">{entry.provider}</span></h3>
        <span className="share">{share}% of traffic</span>
      </div>
      <div className="pricerow muted">
        ${priceInfo.in}/${priceInfo.out} per 1M in/out
        {priceInfo.cacheRead != null && <> · cache read ${priceInfo.cacheRead}</>}
        {' · '}{priceInfo.live ? 'live feed' : 'bundled'}
      </div>
      <div className="cols">
        <div className="col">
          <div className="collabel">API</div>
          <div className="big">{money(api.monthly)}<small>/mo</small></div>
          <div className="muted">{compact(api.monthlyTokens)} tokens/mo</div>
        </div>
        <div className="col">
          <div className="collabel">Self-host</div>
          {canSelfHost ? (
            <>
              <div className="big">{money(self.monthlyOpex)}<small>/mo opex</small></div>
              <div className="muted">
                {self.numGpus}× GPU{self.capex ? ` · ${money(self.capex)} capex` : ''}
              </div>
              <div className="muted">
                ${self.costPer1M_atVolume < 1000 ? self.costPer1M_atVolume.toFixed(2) : compact(self.costPer1M_atVolume)}/1M at your volume
                {' · '}${self.costPer1M_atCapacity.toFixed(2)}/1M at full load
              </div>
            </>
          ) : (
            <div className="big na">N/A</div>
          )}
        </div>
      </div>
      <div className={`verdict ${canSelfHost && verdict.startsWith('Self-host') ? 'good' : ''}`}>
        {verdict}
      </div>
    </div>
  )
}

function DriftNote({ t, driftPct, tco }) {
  const window = tco.mode === 'own' ? tco.amortMonths : 24
  const proj = driftProjection({
    apiMonthly: t.api.monthly,
    selfHostOpex: t.self.monthlyOpex,
    driftPctPerYear: driftPct,
    months: window
  })
  if (proj.apiUnderOpexAt === null) {
    return (
      <p className="note">
        Even after {window} months of {driftPct}%/yr price drops, the API bill for{' '}
        <b>{t.entry.label}</b> stays above its self-host opex — so self-hosting keeps
        paying off in this scenario.
      </p>
    )
  }
  if (proj.apiUnderOpexAt === 0) {
    return (
      <p className="note">
        The API bill for <b>{t.entry.label}</b> is <i>already</i> below its self-host
        opex at your current volume — price drift only widens that gap. Self-hosting
        doesn't pay off here regardless of the scenario.
      </p>
    )
  }
  return (
    <p className="note warn">
      In ~<b>{proj.apiUnderOpexAt} months</b> the falling API price for{' '}
      <b>{t.entry.label}</b> drops <i>below</i> your self-host opex. Past that point
      you'd be paying more to self-host than to stay on the API — factor that into
      any hardware purchase.
    </p>
  )
}

function Advanced({ cachePct, setCachePct, batchPct, setBatchPct, tco, setTco }) {
  const set = (k) => (v) => setTco({ ...tco, [k]: v })
  return (
    <div className="advanced">
      <h4>API discounts</h4>
      <div className="grid">
        <Num label="% of input tokens cacheable" value={cachePct} onChange={setCachePct}
          hint="Static context (RAG, system prompts) reused across calls" />
        <Num label="% of traffic batchable" value={batchPct} onChange={setBatchPct}
          hint="Batch APIs are ~50% off but higher latency" />
      </div>
      <h4>Self-host assumptions</h4>
      <div className="grid">
        <Select label="GPU" value={tco.mode} onChange={set('mode')}
          options={[{ value: 'rent', label: 'Rent ($/hr)' }, { value: 'own', label: 'Own (capex)' }]} />
        {tco.mode === 'rent'
          ? <Num label="GPU $/hr" value={tco.gpuHourly} step={0.1} onChange={set('gpuHourly')} />
          : <Num label="GPU purchase $" value={tco.gpuCapex} onChange={set('gpuCapex')} />}
        <Num label="GPU VRAM (GB)" value={tco.gpuVramGB} onChange={set('gpuVramGB')} />
        <Num label="Amortization (months)" value={tco.amortMonths} onChange={set('amortMonths')} />
        <Num label="Utilization %" value={tco.utilization} onChange={set('utilization')} />
        <Num label="Power draw (W)" value={tco.powerW} onChange={set('powerW')} />
        <Num label="PUE" value={tco.pue} step={0.05} onChange={set('pue')} />
        <Num label="$/kWh" value={tco.kwhCost} step={0.01} onChange={set('kwhCost')} />
        <Num label="Overhead %" value={tco.overheadPct} onChange={set('overheadPct')} />
        <Num label="Ops labor $/mo" value={tco.laborMonthly} onChange={set('laborMonthly')}
          hint="Engineering time to run it — often omitted, rarely zero" />
      </div>
      <label className="check">
        <input type="checkbox" checked={tco.ha} onChange={(e) => set('ha')(e.target.checked)} />
        Keep a redundant GPU for availability (HA)
      </label>
    </div>
  )
}

function PriceStamp({ feed, feedErr }) {
  if (feedErr) return <div className="stamp err">Price feed error: {feedErr} — using bundled fallback if available.</div>
  if (!feed) return <div className="stamp">Loading price feed…</div>
  return (
    <div className={`stamp ${feed.live ? 'live' : 'snap'}`}>
      Prices as of <b>{feed.asOf}</b> · {feed.source} · {feed.count} models
    </div>
  )
}

function Caveats({ feed }) {
  return (
    <section className="panel caveats">
      <h2>Read me — what these numbers are and aren't</h2>
      <ul>
        <li><b>Prices move fast.</b> Inference cost has fallen roughly 10×/year. Every figure is directional; check the as-of date above.</li>
        <li><b>Throughput is heuristic.</b> Self-host tokens/sec is estimated from model size, not measured. Real numbers swing with batch size, context length, quantization, and serving engine. Treat break-evens as ballpark.</li>
        <li><b>Caching is modeled simply.</b> We apply cache-read pricing to your cacheable share; we don't model cache-write premiums or TTL expiry, so real savings may be a bit lower.</li>
        <li><b>Vendor break-evens are biased.</b> Many public self-host break-even numbers come from parties selling GPUs or gateways. This tool shows its math so you can check it — every number traces to an input or the dated feed.</li>
        <li><b>Tokenizers differ.</b> Different models use different tokenizers, so the same text becomes a different number of tokens per model — direct token-based price comparisons may not be entirely accurate.</li>
      </ul>
    </section>
  )
}

// ---- small inputs ----
function Num({ label, value, onChange, step = 1, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} step={step}
        onChange={(e) => onChange(e.target.value === '' ? 0 : +e.target.value)} />
      {hint && <em className="hint">{hint}</em>}
    </label>
  )
}
function Select({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}
