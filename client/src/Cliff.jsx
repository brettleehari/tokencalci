import React, { useMemo, useState } from 'react'
import { analyseOperatingPoint } from './sensitivity.js'
import { compact } from './calc.js'

// THE CLIFF FINDER.
//
// Cost is piecewise constant in fleet size, because GPUs-per-replica and replica
// count are both ceiling functions. Within a step, one more token of context is
// free. At the edge, it is a whole GPU. So the useful question is not "what does
// context cost" — that has no single answer — but "where am I standing".
//
// This reports exactly that: how much of the current step is consumed, how far the
// next boundary is in units a team can actually change, and the local elasticity of
// every input. The elasticities are measured by perturbation rather than derived,
// because the analytic derivative is zero almost everywhere and undefined at the
// steps, which would be true and useless.

const N = ({ value, onChange, step = 1, min = 0, max }) => (
  <input className="cliff-num" type="number" value={value} step={step} min={min} max={max}
    onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))} />
)

export default function Cliff({ model, gpu, precision, baseOpts }) {
  const [avgIn, setAvgIn] = useState(2000)
  const [avgOut, setAvgOut] = useState(500)
  const [ctxTokens, setCtx] = useState(2500)
  const [dailyRequests, setReq] = useState(200000)
  const [peakiness, setPeak] = useState(2.5)
  const [prefixReuse, setReuse] = useState(0.2)

  const a = useMemo(() => {
    if (!model || !gpu) return null
    try {
      return analyseOperatingPoint(model, gpu, precision, {
        avgIn, avgOut, ctxTokens, dailyRequests, peakiness, prefixReuse,
        opts: { ...baseOpts, mode: 'own' }
      })
    } catch { return null }
  }, [model, gpu, precision, baseOpts, avgIn, avgOut, ctxTokens, dailyRequests, peakiness, prefixReuse])

  if (!a) return null
  const pct = Math.round(a.fit.stepUsed * 100)
  const tight = a.fit.stepUsed > 0.85
  const rows = a.rows.filter((r) => r.id !== 'prefixReuse')
  const reuse = a.rows.find((r) => r.id === 'prefixReuse')

  return (
    <div className="cliff">
      <p className="cliff-lede">
        Fleet size is a ceiling function, so cost is <b>piecewise constant</b>: within a
        step another token of context is free, and at the edge it is a whole GPU. The
        useful question is not what context costs — that has no single answer — but
        where you are standing.
      </p>

      <div className="cliff-inputs">
        <label>Prompt <N value={avgIn} onChange={setAvgIn} step={500} /><span>tokens</span></label>
        <label>Generation <N value={avgOut} onChange={setAvgOut} step={100} /><span>tokens</span></label>
        <label>Resident context <N value={ctxTokens} onChange={setCtx} step={500} /><span>tokens</span></label>
        <label>Volume <N value={dailyRequests} onChange={setReq} step={25000} /><span>req/day</span></label>
        <label>Peakiness <N value={peakiness} onChange={setPeak} step={0.5} min={1} /><span>× avg</span></label>
        <label>Prefix reuse
          <input className="cliff-range" type="range" min="0" max="0.9" step="0.05"
            value={prefixReuse} onChange={(e) => setReuse(Number(e.target.value))} />
          <span>{Math.round(prefixReuse * 100)}%</span>
        </label>
      </div>

      <div className={'cliff-gauge' + (tight ? ' tight' : '')}>
        <div className="cliff-gauge-head">
          <span>Current step — {a.fit.gpusPerReplica}× {gpu.name} per replica</span>
          <b>{pct}% consumed</b>
        </div>
        <div className="cliff-bar"><div className="cliff-fill" style={{ width: `${Math.min(100, pct)}%` }} /></div>
        <div className="cliff-gauge-foot">
          {tight
            ? <>You are at the edge. A small increase in context or concurrency buys another
               GPU per replica — a <b>{a.fit.stepCostMultiple.toFixed(2)}×</b> step in fleet cost.</>
            : <>You are mid-step. Context and concurrency are currently <b>free</b> —
               spending them changes nothing until the boundary.</>}
        </div>
      </div>

      <div className="cliff-next">
        <div>
          <span className="cliff-k">Next GPU at</span>
          <b>{Math.round(a.fit.nextCtxAt).toLocaleString()}</b>
          <span className="cliff-u">tokens of context (+{Math.round(a.fit.ctxToNextGpu).toLocaleString()})</span>
        </div>
        <div>
          <span className="cliff-k">or at</span>
          <b>{Math.round(a.fit.nextConcAt).toLocaleString()}</b>
          <span className="cliff-u">concurrent requests (+{Math.round(a.fit.concToNextGpu).toLocaleString()})</span>
        </div>
        <div>
          <span className="cliff-k">Binding constraint</span>
          <b className={a.bound === 'memory' ? 'warn' : ''}>{a.bound}</b>
          <span className="cliff-u">{a.bound === 'memory' ? 'KV, not throughput' : 'throughput, not KV'}</span>
        </div>
        <div>
          <span className="cliff-k">Concurrency</span>
          <b>{a.concurrency}</b>
          <span className="cliff-u">derived, {compact(a.workload.peakTokPerMin)} tok/min peak</span>
        </div>
      </div>

      <table className="cliff-table">
        <thead>
          <tr><th>Input, +10%</th><th>Elasticity</th><th>$/1M</th><th>Fleet</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.crossesStep ? 'step' : ''}>
              <td>{r.label}</td>
              <td className={Math.abs(r.elasticity) < 0.01 ? 'zero' : r.elasticity > 1 ? 'hot' : ''}>
                {r.elasticity.toFixed(2)}
              </td>
              <td>${r.costAt.toFixed(3)} → ${r.costUp.toFixed(3)}</td>
              <td>{r.crossesStep ? <b>{r.gpusAt} → {r.gpusUp}</b> : r.gpusAt}</td>
            </tr>
          ))}
          {reuse && (
            <tr>
              <td>Prefix reuse, +10pp</td>
              <td className={Math.abs(reuse.elasticity) < 0.001 ? 'zero' : ''}>
                {(reuse.elasticity * 100).toFixed(1)}%
              </td>
              <td>${reuse.costAt.toFixed(3)} → ${reuse.costUp.toFixed(3)}</td>
              <td>{reuse.gpusAt}</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="cliff-foot">
        Elasticity is <code>∂ln(cost)/∂ln(input)</code>, measured by one-sided
        perturbation rather than derived — the analytic derivative is zero almost
        everywhere and undefined at the steps, which is true and useless. A row marked
        in orange crosses a boundary inside the perturbation, so its response is a jump
        rather than a slope. Watch <b>volume</b>: mid-step its elasticity is −1, the
        amortisation result every self-hosting case is built on, and near an edge it
        turns positive. Growth makes you cheaper until it makes you more expensive.
      </p>
    </div>
  )
}
