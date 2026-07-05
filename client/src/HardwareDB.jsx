import React, { useMemo, useState } from 'react'
import { GPUS, MODELS, PRECISIONS } from './hwdata.js'
import { modelEconomics, fmtGB, fmtTokMin } from './hwcalc.js'
import { money, compact } from './calc.js'

const DEFAULTS = {
  mode: 'rent', utilization: 70, amortMonths: 36,
  kwhCost: 0.12, pue: 1.3, overheadPct: 20, laborMonthly: 0
}

export default function HardwareDB() {
  const [gpuId, setGpuId] = useState('h100')
  const [precision, setPrecision] = useState('fp16')
  const [opts, setOpts] = useState(DEFAULTS)
  const gpu = GPUS.find((g) => g.id === gpuId)

  const rows = useMemo(
    () => MODELS.map((m) => ({ m, e: modelEconomics(m, gpu, precision, opts) })),
    [gpuId, precision, opts]
  )

  const set = (k) => (v) => setOpts({ ...opts, [k]: v })

  return (
    <>
      <section className="panel">
        <h2>Model → hardware → cost database</h2>
        <p className="muted">
          What it costs to self-host popular open-weight models at today's GPU
          prices, and the volume at which self-host beats that model's API price.
          Pick a GPU and precision; every number is computed from the inputs — see
          the formula note below.
        </p>
        <div className="grid">
          <label className="field"><span>GPU</span>
            <select value={gpuId} onChange={(e) => setGpuId(e.target.value)}>
              {GPUS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.vram}GB · ${g.rentHr}/hr · {money(g.capex)}
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
              <option value="rent">Rent ($/hr, 24×7)</option>
              <option value="own">Own (capex ÷ {opts.amortMonths}mo + power)</option>
            </select>
          </label>
          <label className="field"><span>Utilization: {opts.utilization}%</span>
            <input type="range" min="10" max="100" value={opts.utilization}
              onChange={(e) => set('utilization')(+e.target.value)} />
          </label>
        </div>
      </section>

      <section className="panel">
        <h3>The database</h3>
        <div className="tablewrap">
          <table className="db">
            <thead>
              <tr>
                <th>Model</th><th>VRAM</th><th>GPUs</th><th>Capex</th>
                <th>Opex/mo</th><th>Tokens/min</th>
                <th>$/1M self-host<br /><span className="th2">at full load</span></th>
                <th>$/1M API</th>
                <th>Break-even<br /><span className="th2">tokens/day</span></th>
                <th>Winner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, e }) => (
                <tr key={m.id}>
                  <td className="mname">{m.label}<br /><span className="th2">{m.params}B{m.active < m.params ? ` · ${m.active}B active` : ''}</span></td>
                  <td>{fmtGB(e.vram)}</td>
                  <td>{e.numGpus}× {gpu.name.split(' ')[0]}</td>
                  <td>{money(e.capex)}</td>
                  <td>{money(e.opexMonthly)}</td>
                  <td>{fmtTokMin(e.tokensPerMin)}</td>
                  <td className={e.ratio < 1 ? 'good' : ''}>${e.selfHostPer1M.toFixed(3)}</td>
                  <td>${e.apiPer1M.toFixed(2)}</td>
                  <td>{compact(e.breakEvenTokensPerDay)}{!e.reachable && <span className="warn-mark" title="Above one fleet's capacity — needs more GPUs"> ⚠</span>}</td>
                  <td className={e.ratio < 1 ? 'w-self' : 'w-api'}>{e.ratio < 1 ? 'Self-host' : 'API'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          ⚠ = the break-even volume exceeds what one fleet can serve, so you'd add
          GPUs (and cost) before reaching it. "Winner" compares $/1M at full
          utilization — at lower utilization the self-host column rises (idle cliff).
        </p>
      </section>

      <section className="panel">
        <h3>$/1M tokens — self-host (full load) vs API</h3>
        <GroupedBars rows={rows} gpu={gpu} />
      </section>

      <section className="panel">
        <h3>Break-even volume (tokens/day) to justify self-hosting</h3>
        <p className="muted">Log scale. Shorter bar = self-host pays off at lower volume. ⚠ marks break-evens beyond one fleet's capacity.</p>
        <BreakEvenBars rows={rows} />
      </section>

      <section className="panel formula">
        <h3>How break-even is calculated</h3>
        <ol>
          <li><b>VRAM need</b> = params × bytes/param (precision) × 1.3 headroom → <b>GPUs</b> = ⌈VRAM ÷ GPU VRAM⌉.</li>
          <li><b>Opex/mo</b> = (rent × GPUs × 720h) <i>or</i> (capex ÷ amortization + power×PUE×kWh), × (1 + overhead).</li>
          <li><b>Capacity</b> = throughput (tok/s) × seconds/month × utilization. <b>$/1M self-host</b> = opex ÷ (capacity ÷ 1M).</li>
          <li><b>Break-even tokens/day</b> = monthly opex ÷ (API $/token) ÷ 30. Below it the API bill is smaller than fixed self-host opex; above it self-host wins — until you exceed capacity and must buy more GPUs.</li>
        </ol>
        <p className="muted small">
          Directional, mid-2026. Throughput is heuristic (batching/context/engine
          dependent), not measured. GPU prices are mid-market rental ranges.
        </p>
      </section>
    </>
  )
}

// Grouped horizontal bars: self-host vs API $/1M per model.
function GroupedBars({ rows }) {
  const max = Math.max(...rows.flatMap(({ e }) => [Math.min(e.selfHostPer1M, e.apiPer1M * 8), e.apiPer1M]))
  return (
    <div className="chart">
      {rows.map(({ m, e }) => {
        const sh = Math.min(e.selfHostPer1M, e.apiPer1M * 8) // clamp runaway low-util values
        return (
          <div className="crow" key={m.id}>
            <div className="clabel">{m.label}</div>
            <div className="cbars">
              <div className="cbar">
                <div className="fill self" style={{ width: pct(sh, max) }} />
                <span className="cval">${e.selfHostPer1M.toFixed(3)} self-host</span>
              </div>
              <div className="cbar">
                <div className="fill api" style={{ width: pct(e.apiPer1M, max) }} />
                <span className="cval">${e.apiPer1M.toFixed(2)} API</span>
              </div>
            </div>
          </div>
        )
      })}
      <div className="legend"><span className="dot self" /> self-host (full load) <span className="dot api" /> API</div>
    </div>
  )
}

function BreakEvenBars({ rows }) {
  const vals = rows.map(({ e }) => e.breakEvenTokensPerDay).filter((v) => isFinite(v) && v > 0)
  const min = Math.min(...vals), max = Math.max(...vals)
  const lg = (v) => Math.log10(Math.max(v, 1))
  const lo = lg(min), hi = lg(max)
  return (
    <div className="chart">
      {rows.map(({ m, e }) => (
        <div className="crow" key={m.id}>
          <div className="clabel">{m.label}</div>
          <div className="cbars">
            <div className="cbar">
              <div className="fill be" style={{ width: (hi > lo ? ((lg(e.breakEvenTokensPerDay) - lo) / (hi - lo)) * 100 : 50) + '%' }} />
              <span className="cval">{compact(e.breakEvenTokensPerDay)}/day{!e.reachable && ' ⚠'}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function pct(v, max) { return Math.min(100, (v / max) * 100) + '%' }
