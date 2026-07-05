import React, { useMemo, useState } from 'react'
import { GPUS, MODELS, PRECISIONS } from './hwdata.js'
import { modelEconomics, fmtGB, fmtTokMin } from './hwcalc.js'
import { money, compact } from './calc.js'

const DEFAULTS = {
  mode: 'rent', amortMonths: 36, kwhCost: 0.12, pue: 1.3, overheadPct: 15,
  personnelMonthly: 3000, spacePerKwMonth: 150,
  peakTokPerMin: 100000, dutyPct: 30
}

export default function HardwareDB() {
  const [gpuId, setGpuId] = useState('h100')
  const [precision, setPrecision] = useState('fp16')
  const [opts, setOpts] = useState(DEFAULTS)
  const gpu = GPUS.find((g) => g.id === gpuId)
  const set = (k) => (v) => setOpts({ ...opts, [k]: v })

  const rows = useMemo(
    () => MODELS.map((m) => ({ m, e: modelEconomics(m, gpu, precision, opts) })),
    [gpuId, precision, opts]
  )

  const duty = opts.dutyPct / 100
  const monthlyTokens = opts.peakTokPerMin * duty * 43200

  return (
    <>
      <section className="panel">
        <h2>Self-host TCO vs. neocloud API — same open model, apples to apples</h2>
        <p className="muted">
          Self-host cost is <b>fixed</b>: you provision for <b>peak</b> tokens/min and
          pay 24×7 whether or not tokens flow. Neocloud API is <b>variable</b>: you
          pay per token used, and idle time is free. So the answer depends entirely
          on your demand profile — peak load and how much of the time you actually
          need it (duty cycle).
        </p>

        <h4>Demand</h4>
        <div className="grid">
          <Num label="Peak demand (tokens / min)" value={opts.peakTokPerMin} step={10000}
            onChange={set('peakTokPerMin')} hint="Sizes the self-host fleet" />
          <label className="field"><span>Duty cycle: {opts.dutyPct}% of the time</span>
            <input type="range" min="1" max="100" value={opts.dutyPct}
              onChange={(e) => set('dutyPct')(+e.target.value)} />
            <em className="hint">How much of the time you actually need peak</em>
          </label>
          <div className="field"><span>Tokens actually used / month</span>
            <div className="readout">{compact(monthlyTokens)}</div>
            <em className="hint">= peak × duty × 43,200 min</em>
          </div>
        </div>

        <h4>Hardware &amp; cost basis</h4>
        <div className="grid">
          <label className="field"><span>GPU</span>
            <select value={gpuId} onChange={(e) => setGpuId(e.target.value)}>
              {GPUS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.vram}GB · ${g.rentHr}/hr · {money(g.capex + g.nodePerGpu)} node
                </option>
              ))}
            </select>
          </label>
          <label className="field"><span>Precision</span>
            <select value={precision} onChange={(e) => setPrecision(e.target.value)}>
              {PRECISIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Cost basis</span>
            <select value={opts.mode} onChange={(e) => set('mode')(e.target.value)}>
              <option value="rent">Rent GPUs ($/hr, 24×7)</option>
              <option value="own">Own (capex + power + space)</option>
            </select>
          </label>
          <Num label="Personnel $/mo (run the stack)" value={opts.personnelMonthly} step={500}
            onChange={set('personnelMonthly')} hint="Applies to rent AND own — $0 only on API" />
          {opts.mode === 'own' && <>
            <Num label="Colo space $/kW·mo" value={opts.spacePerKwMonth} step={10} onChange={set('spacePerKwMonth')} />
            <Num label="$/kWh" value={opts.kwhCost} step={0.01} onChange={set('kwhCost')} />
            <Num label="Amortization (months)" value={opts.amortMonths} onChange={set('amortMonths')} />
          </>}
        </div>
      </section>

      <section className="panel formula">
        <h3>The equation</h3>
        <pre className="eq">{`peak p        = tokens/min the fleet must serve   (sizes hardware)
duty d        = fraction of time you need peak     (0..1)
tokens used M = p · d · 43,200 min/month

SELF-HOST  (fixed, provisioned for peak):
  GPUs N      = max( ⌈VRAM ÷ GPU_VRAM⌉ , ⌈p ÷ throughput⌉ )
  TCO C_self  = capex/amort + power + space + people , ×(1+overhead)   [FIXED]
  $/1M self   = C_self ÷ (M ÷ 1e6)          → explodes as d → 0 (idle cliff)

NEOCLOUD API  (variable, pay-per-token):
  bill C_api  = (M ÷ 1e6) · price_per_1M     [scales with use, idle = $0]

WINNER: self-host if  C_self < C_api
BREAK-EVEN duty d* :  C_self = (p · d* · 43,200 ÷ 1e6) · price_per_1M`}</pre>
      </section>

      <section className="panel">
        <h3>Per model — at {compact(opts.peakTokPerMin)}/min peak, {opts.dutyPct}% duty</h3>
        <div className="tablewrap">
          <table className="db">
            <thead>
              <tr>
                <th>Model</th><th>VRAM</th><th>GPUs<br /><span className="th2">for peak</span></th>
                <th>Capex</th>
                <th>Self-host<br /><span className="th2">$/mo (fixed)</span></th>
                <th>Neocloud<br /><span className="th2">$/mo (used)</span></th>
                <th>$/1M<br /><span className="th2">self-host</span></th>
                <th>$/1M<br /><span className="th2">neocloud</span></th>
                <th>Break-even<br /><span className="th2">duty</span></th>
                <th>Winner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, e }) => (
                <tr key={m.id}>
                  <td className="mname">{m.label}<br /><span className="th2">{m.params}B{m.active < m.params ? ` · ${m.active}B act` : ''}</span></td>
                  <td>{fmtGB(e.vram)}</td>
                  <td>{e.numGpus}×</td>
                  <td>{money(e.capex)}</td>
                  <td>{money(e.selfHostMonthly)}</td>
                  <td>{money(e.apiMonthly)}</td>
                  <td className={e.winsSelfHost ? 'good' : ''}>${e.selfHostPer1M < 1000 ? e.selfHostPer1M.toFixed(2) : compact(e.selfHostPer1M)}</td>
                  <td>${e.apiPer1M.toFixed(2)}</td>
                  <td>{e.breakEvenDuty > 1 ? 'never' : (e.breakEvenDuty * 100).toFixed(0) + '%'}</td>
                  <td className={e.winsSelfHost ? 'w-self' : 'w-api'}>{e.winsSelfHost ? 'Self-host' : 'Neocloud'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          "Break-even duty" = the duty cycle above which self-host beats the API for
          that model (fleet size held fixed). "never" = even at 100% duty the neocloud
          API is cheaper. Watch the winner flip as you raise duty or peak demand.
        </p>
      </section>

      <section className="panel">
        <h3>Monthly cost: self-host (fixed) vs neocloud (scales with duty)</h3>
        <CostBars rows={rows} />
      </section>

      <section className="panel">
        <h3>Break-even duty cycle to justify self-hosting</h3>
        <p className="muted">Shorter bar = self-host pays off even at low utilization. Bars at 100% and "never" mean the API wins across almost all realistic duty cycles.</p>
        <DutyBars rows={rows} />
      </section>

      <section className="panel formula">
        <h3>Where the numbers come from</h3>
        <ul className="src">
          <li><b>GPU capex + node</b> (incl. system RAM/chassis/NIC): street prices, DGX/HGX BOMs — Vast, RunPod, Shadeform.</li>
          <li><b>Power</b>: GPU TDP × PUE (~1.3) × $/kWh (EIA/Eurostat). <b>Space</b>: colo $/kW·mo (~$100–200).</li>
          <li><b>Neocloud API price</b> (same open model): OpenRouter <code>/models</code>, LiteLLM feed — Together / Fireworks / DeepInfra / Groq.</li>
          <li><b>Throughput</b>: heuristic (gpu_poor / selfhostllm / vLLM benchmarks) — directional, not measured.</li>
        </ul>
        <p className="muted small">Mid-2026, directional. Every figure recomputes from the inputs above.</p>
      </section>
    </>
  )
}

// Self-host (fixed) vs neocloud (variable) monthly cost per model.
function CostBars({ rows }) {
  const max = Math.max(...rows.flatMap(({ e }) => [e.selfHostMonthly, e.apiMonthly]))
  return (
    <div className="chart">
      {rows.map(({ m, e }) => (
        <div className="crow" key={m.id}>
          <div className="clabel">{m.label}</div>
          <div className="cbars">
            <div className="cbar"><div className="fill self" style={{ width: pct(e.selfHostMonthly, max) }} /><span className="cval">{money(e.selfHostMonthly)} self-host</span></div>
            <div className="cbar"><div className="fill api" style={{ width: pct(e.apiMonthly, max) }} /><span className="cval">{money(e.apiMonthly)} neocloud</span></div>
          </div>
        </div>
      ))}
      <div className="legend"><span className="dot self" /> self-host (fixed) <span className="dot api" /> neocloud (scales with duty)</div>
    </div>
  )
}

function DutyBars({ rows }) {
  return (
    <div className="chart">
      {rows.map(({ m, e }) => {
        const capped = e.breakEvenDuty > 1
        const w = capped ? 100 : Math.max(2, e.breakEvenDuty * 100)
        return (
          <div className="crow" key={m.id}>
            <div className="clabel">{m.label}</div>
            <div className="cbars">
              <div className="cbar">
                <div className={'fill ' + (capped ? 'be' : 'self')} style={{ width: w + '%' }} />
                <span className="cval">{capped ? 'never (API wins)' : (e.breakEvenDuty * 100).toFixed(0) + '% duty'}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function pct(v, max) { return Math.min(100, (v / max) * 100) + '%' }

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
