import React from 'react'
import { InlineNum, InlineSelect } from './ui/Workspace.jsx'
import { money, compact } from './calc.js'
import { TRAFFIC_SHAPES } from './hwcalc.js'

// THE ANSWER, BEFORE THE QUESTION.
//
// The landing page used to open with a form. A form is homework, and a decider
// who lands on homework leaves. So the page answers first, on sensible defaults,
// and the inputs live inside the sentence — every number is editable in place.
//
// The 20-second contract: verdict, both figures, and the one-line reason, above
// the fold, with nothing to fill in first.

export default function Answer({
  model, models, e, mode, economicWinner, sovereign,
  dailyRequests, setDailyRequests, avgIn, setAvgIn, avgOut, setAvgOut,
  peakiness, setPeakiness, modelId, setModelId, dutyPct, monthlyTokens
}) {
  const rent = e.apiMonthly
  const own = e.selfHostMonthly
  const winner = sovereign ? 'self' : economicWinner
  const cheaper = Math.min(rent, own)
  const dearer = Math.max(rent, own)
  const ratio = cheaper > 0 ? dearer / cheaper : null

  return (
    <section className="answer">
      <p className="answer-sentence">
        At{' '}
        <InlineNum value={dailyRequests} onChange={setDailyRequests} step={10000} width="7.5ch" />{' '}
        requests a day of{' '}
        <InlineNum value={avgIn} onChange={setAvgIn} step={100} width="5ch" /> in /{' '}
        <InlineNum value={avgOut} onChange={setAvgOut} step={50} width="4.5ch" /> out,{' '}
        <InlineSelect
          value={String(peakiness)}
          onChange={(v) => setPeakiness(+v)}
          options={TRAFFIC_SHAPES.map((s) => ({ id: String(s.id), label: s.label.toLowerCase() }))}
        />
        , serving{' '}
        <InlineSelect
          value={modelId}
          onChange={setModelId}
          options={models.map((m) => ({ id: m.id, label: m.label }))}
        />
        :
      </p>

      <div className="answer-grid">
        <div className={'ans-card' + (winner === 'api' ? ' win' : '')}>
          <span className="ans-label">Rent it from a neocloud</span>
          <span className="ans-value">{money(rent)}<em>/mo</em></span>
          <span className="ans-sub">${e.apiPer1M.toFixed(3)} per 1M tokens</span>
        </div>
        <div className={'ans-card' + (winner === 'self' ? ' win' : '')}>
          <span className="ans-label">Run it yourself</span>
          <span className="ans-value">{money(own)}<em>/mo</em></span>
          <span className="ans-sub">{e.numGpus}× H100 · fixed, 24×7</span>
        </div>
        <div className="ans-verdict">
          <span className="ans-verdict-word">
            {sovereign ? 'Self-host' : winner === 'api' ? 'Rent it.' : 'Run it yourself.'}
          </span>
          <span className="ans-verdict-why">
            {sovereign ? (
              <>Required — your data cannot leave. Expect to pay about{' '}
                <b>{isFinite(e.ratio) ? e.ratio.toFixed(0) + '×' : 'a large premium'}</b> for that.</>
            ) : ratio ? (
              <>{winner === 'api' ? 'Self-hosting' : 'The API'} costs about{' '}
                <b>{ratio.toFixed(1)}×</b> more at {dutyPct.toFixed(0)}% duty on{' '}
                {compact(monthlyTokens)} tokens a month.</>
            ) : null}
          </span>
        </div>
      </div>
    </section>
  )
}
