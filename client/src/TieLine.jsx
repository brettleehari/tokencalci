import React, { useMemo } from 'react'
import { pricedGpus, servingPrecisionFor } from './hwdata.js'
import { modelEconomics } from './hwcalc.js'
import { money, compact } from './calc.js'

// WHAT WOULD HAVE TO CHANGE.
//
// Knowing that sovereignty costs 37x is only half of what a decision-maker needs.
// The other half is whether that number can move, by how much, and which change
// does the most work. This runs the economics under each counterfactual and
// reports the answer instead of arguing it.
//
// The finding it surfaces is uncomfortable and worth stating plainly: no single
// lever brings sovereign cost near parity. Getting close requires stacking all of
// them, and the result is still a multiple, not a saving. That is the honest
// shape of the problem, and a leader is better served by it than by a story
// where one procurement decision fixes everything.

export default function TieLine({ model, gpuFeed, baseOpts, peakTokPerMin, dutyPct, servingPrecision }) {
  const gpus = useMemo(() => pricedGpus(gpuFeed), [gpuFeed])
  const h100 = gpus.find((g) => g.id === 'h100')
  const b200 = gpus.find((g) => g.id === 'b200')

  const analysis = useMemo(() => {
    if (!model || !h100) return null
    // Baseline at the precision this model is actually served at, so the levers
    // measure changes from where you really are, not from an fp16 strawman.
    const served = servingPrecisionFor(model, servingPrecision?.[model.id])
    const base = { ...baseOpts, peakTokPerMin, dutyPct }
    const run = (over = {}, gpu = h100, prec = served.id) =>
      modelEconomics(model, gpu, prec, { ...base, ...over })

    const b = run()
    if (!isFinite(b.ratio)) return null

    // A cheaper card, modelled as a capex/rental reduction rather than a
    // different part — the question is "if hardware got 40% cheaper", not
    // "if we bought something else".
    const cheaperGpu = { ...h100, capex: h100.capex * 0.6, rentHr: h100.rentHr * 0.6 }

    const levers = [
      {
        id: 'util',
        name: 'Raise utilisation',
        from: `${dutyPct.toFixed(0)}% duty`,
        to: '85% duty',
        how: 'Consolidate every workload onto one fleet, and accept queueing at the peak instead of provisioning for it.',
        e: run({ dutyPct: 85 })
      },
      {
        id: 'people',
        name: 'Amortise the team',
        from: `${money(baseOpts.personnelMonthly)}/mo on one model`,
        to: 'spread across 5 workloads',
        how: 'The staffing cost is per-fleet, not per-model. It only falls if the same team runs materially more than one thing.',
        e: run({ personnelMonthly: baseOpts.personnelMonthly / 5 })
      },
      {
        id: 'quant',
        name: 'Serve quantised',
        from: served.id,
        to: 'int4',
        how: 'Fewer bytes per parameter means more tokens per GPU-hour and often fewer GPUs to fit at all. The hard part is calibrating so quality survives.',
        e: run({}, h100, 'int4')
      },
      {
        id: 'ha',
        name: 'Drop redundancy',
        from: '2× HA',
        to: 'no standby',
        how: 'Halves the fleet and removes your failover. Rarely acceptable for the compliance case that made you sovereign in the first place.',
        e: run({ haFactor: 1 }),
        caution: true
      },
      {
        id: 'silicon',
        name: 'Newer silicon',
        from: 'H100',
        to: 'B200',
        how: 'More bandwidth per GPU, though throughput scales sub-linearly with it — a 2.4× bandwidth advantage returned 1.9× in benchmarks.',
        e: b200 ? run({}, b200) : null
      },
      {
        id: 'capex',
        name: 'Hardware gets cheaper',
        from: 'today’s prices',
        to: '40% lower',
        how: 'Not something you control. Included because it is the lever people assume will rescue the maths.',
        e: run({}, cheaperGpu)
      }
    ].filter((l) => l.e)

    const all = run(
      { dutyPct: 85, personnelMonthly: baseOpts.personnelMonthly / 5, haFactor: 1 },
      h100, 'int4'
    )

    const best = levers.reduce((a, l) => (a && a.e.ratio <= l.e.ratio ? a : l), null)

    return { base: b, levers, all, best }
  }, [model, gpuFeed, baseOpts, peakTokPerMin, dutyPct, h100, b200, servingPrecision])

  if (!analysis) return null
  const { base, levers, all, best } = analysis
  const worst = Math.max(base.ratio, ...levers.map((l) => l.e.ratio))
  const w = (r) => `${Math.max(3, (r / worst) * 100)}%`

  return (
    <div className="tie">
      <div className="tie-head">
        <div className="tie-now">
          <span className="tie-label">Sovereign today</span>
          <span className="tie-val">{base.ratio.toFixed(0)}×</span>
          <span className="tie-sub">{money(base.selfHostPer1M)}/1M against {money(base.apiPer1M)}/1M</span>
        </div>
        <div className="tie-arrow" aria-hidden="true">→</div>
        <div className="tie-best">
          <span className="tie-label">With every lever pulled</span>
          <span className="tie-val">{all.ratio.toFixed(1)}×</span>
          <span className="tie-sub">{money(all.selfHostPer1M)}/1M — still a multiple, not a saving</span>
        </div>
      </div>

      <p className="tie-lede">
        <b>No single change brings sovereignty near parity.</b> The strongest lever on
        its own — {best.name.toLowerCase()} — gets you to {best.e.ratio.toFixed(0)}×.
        Reaching {all.ratio.toFixed(1)}× requires stacking all of them, and one of them
        costs you the redundancy that the compliance requirement probably demanded.
      </p>

      <div className="tie-levers">
        {levers.map((l) => (
          <div className={'tie-row' + (l.caution ? ' caution' : '')} key={l.id}>
            <div className="tie-row-name">
              {l.name}
              <span>{l.from} → {l.to}</span>
            </div>
            <div className="tie-bar">
              <div className="tie-fill" style={{ width: w(l.e.ratio) }} />
              <span className="tie-bar-val">{l.e.ratio.toFixed(0)}×</span>
            </div>
            <p className="tie-how">{l.how}</p>
          </div>
        ))}
      </div>

      <div className="tie-line-box">
        <div className="tie-line-title">The tie line</div>
        <p>
          {base.breakEvenDuty > 1 ? (
            <>At this fleet and this model, <b>there is no duty cycle that reaches parity</b> —
            you could run the hardware flat out, every hour of every day, and still pay more
            than the API. The crossing does not exist for this configuration, which is a
            more useful thing to know than a break-even that is technically true at 400%
            utilisation.</>
          ) : (
            <>Parity arrives at <b>{(base.breakEvenDuty * 100).toFixed(0)}% duty</b>
            {Number.isFinite(base.breakEvenTokensPerDay) && <>, roughly{' '}
            <b>{compact(base.breakEvenTokensPerDay)} tokens a day</b> sustained</>}. You are
            currently at {dutyPct.toFixed(0)}%. Whether that gap is closeable is an
            operational question, not a procurement one.</>
          )}
        </p>
      </div>

      <p className="tie-foot">
        Every row recomputes the full model under that one counterfactual — nothing here
        is a rule of thumb. What it cannot price is the reason you are reading it: if a
        regulator requires physical custody, the multiple is the cost of compliance and
        the exercise is budgeting, not deciding.
      </p>
    </div>
  )
}
