import React, { useMemo, useState } from 'react'
import { pricedGpus, pricedModels } from './hwdata.js'
import { frontierModels } from './pricing.js'
import { deriveWorkload, TRAFFIC_SHAPES } from './hwcalc.js'
import { QUALITY_BARS, TASK_TYPES, candidates, defaultTiers, mixEconomics, per1M } from './mix.js'
import { money, compact } from './calc.js'

const BASE = {
  amortMonths: 36, kwhCost: 0.12, pue: 1.3, overheadPct: 15,
  personnelMonthly: 3000, spacePerKwMonth: 150
}
const PRECISION = 'fp16'

export default function Mix({ feed, gpuFeed, onNavigate }) {
  const [dailyRequests, setDailyRequests] = useState(200000)
  const [avgIn, setAvgIn] = useState(2000)
  const [avgOut, setAvgOut] = useState(500)
  const [peakiness, setPeakiness] = useState(2.5)
  const [taskId, setTaskId] = useState('chatbot')
  const [barId, setBarId] = useState('mid')
  const [allowNC, setAllowNC] = useState(false)
  const [cacheHitPct, setCacheHit] = useState(0)
  const [batchPct, setBatch] = useState(0)
  // null = follow the task-type default; a number = the user moved the slider.
  const [hardShareOverride, setHardShare] = useState(null)
  const [bulkId, setBulkId] = useState(null)
  const [hardId, setHardId] = useState(null)

  const models = useMemo(() => pricedModels(feed), [feed])
  const frontier = useMemo(() => frontierModels(feed), [feed])
  const GPU = useMemo(() => pricedGpus(gpuFeed).find((g) => g.id === 'h100'), [gpuFeed])

  const w = useMemo(
    () => deriveWorkload({ dailyRequests, avgTokensIn: avgIn, avgTokensOut: avgOut, peakiness }),
    [dailyRequests, avgIn, avgOut, peakiness]
  )
  const workload = { ...w, monthlyTokens: w.dailyTokens * 30 }
  const priceCtx = { outputShare: w.outputShare, cacheHitPct, batchPct }

  const cands = useMemo(
    () => candidates(models, { barId, taskId, allowNonCommercial: allowNC }),
    [models, barId, taskId, allowNC]
  )
  const rec = useMemo(
    () => defaultTiers(cands, frontier, { taskId, priceCtx }),
    [cands, frontier, taskId, w.outputShare, cacheHitPct, batchPct]
  )

  // Anything the user picked wins; otherwise follow the recommendation. Picks are
  // dropped automatically if a filter change makes them invalid.
  const pool = [...cands, ...frontier]
  const bulk = pool.find((m) => m.id === bulkId && !m.closed) || rec?.bulk || null
  const hard = pool.find((m) => m.id === hardId) || rec?.hard || null
  const hardShare = hardShareOverride ?? rec?.hardShare ?? 20

  const mx = useMemo(() => {
    if (!bulk || !hard) return null
    return mixEconomics({
      tiers: [
        { model: bulk, share: 100 - hardShare },
        { model: hard, share: hardShare }
      ],
      workload,
      opts: { ...BASE, cacheHitPct, batchPct },
      gpu: GPU, precision: PRECISION
    })
  }, [bulk, hard, hardShare, GPU, workload.monthlyTokens, workload.peakTokPerMin, workload.dutyPct, w.outputShare, cacheHitPct, batchPct])

  const task = TASK_TYPES.find((t) => t.id === taskId)
  const bar = QUALITY_BARS.find((b) => b.id === barId)

  return (
    <>
      <section className="panel">
        <h2 className="q">Plan the mix, not just the model</h2>
        <p className="muted">
          Production systems don’t call one model. They send the easy majority to something
          cheap and escalate the hard minority. This plans that split — <b>which models,
          what share, what it costs blended</b> — and then asks the question no router asks:
          <b> should any tier be self-hosted?</b> Each tier is its own duty-cycle problem.
        </p>

        <div className="grid narrow">
          <label className="field"><span>Requests per day</span>
            <input type="number" step="10000" min="0" value={dailyRequests} onChange={(e) => setDailyRequests(Math.max(0, +e.target.value || 0))} />
          </label>
          <label className="field"><span>Avg input tokens / request</span>
            <input type="number" step="100" min="0" value={avgIn} onChange={(e) => setAvgIn(Math.max(0, +e.target.value || 0))} />
          </label>
          <label className="field"><span>Avg output tokens / request</span>
            <input type="number" step="50" min="0" value={avgOut} onChange={(e) => setAvgOut(Math.max(0, +e.target.value || 0))} />
          </label>
          <label className="field"><span>Traffic shape</span>
            <select value={peakiness} onChange={(e) => setPeakiness(+e.target.value)}>
              {TRAFFIC_SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>

        <div className="grid narrow">
          <label className="field"><span>Task type</span>
            <select value={taskId} onChange={(e) => { setTaskId(e.target.value); setHardShare(null); setBulkId(null); setHardId(null) }}>
              {TASK_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <em className="hint">{task.note}</em>
          </label>
          <label className="field"><span>Quality bar</span>
            <select value={barId} onChange={(e) => { setBarId(e.target.value); setBulkId(null); setHardId(null) }}>
              {QUALITY_BARS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
            <em className="hint">{bar.note}</em>
          </label>
          <label className="check">
            <input type="checkbox" checked={allowNC} onChange={(e) => setAllowNC(e.target.checked)} />
            Allow non-commercial licences
          </label>
        </div>

        <div className="grid narrow">
          <label className="field"><span>Prompt cache hit rate: {cacheHitPct}%</span>
            <input type="range" min="0" max="95" value={cacheHitPct} onChange={(e) => setCacheHit(+e.target.value)} />
          </label>
          <label className="field"><span>Batch API share: {batchPct}%</span>
            <input type="range" min="0" max="100" value={batchPct} onChange={(e) => setBatch(+e.target.value)} />
          </label>
        </div>

        <p className="derivenote">
          → <b>{compact(workload.monthlyTokens)}</b> tokens/month
          ({Math.round(w.outputShare * 100)}% output) · peak <b>{compact(w.peakTokPerMin)}</b> tok/min
          · duty <b>{w.dutyPct.toFixed(0)}%</b> · <b>{cands.length}</b> models clear the bar
        </p>
      </section>

      {!mx ? (
        <section className="panel">
          <p className="muted">
            No open model in the catalog clears a <b>{bar.label.toLowerCase()}</b> bar for
            <b> {task.label.toLowerCase()}</b>{allowNC ? '' : ' under a commercial licence'}.
            Loosen the bar, or allow non-commercial licences.
          </p>
        </section>
      ) : (
        <>
          <section className="panel heroverdict v-api">
            <div className="vhead"><div className="vtitle">The recommended mix</div></div>
            {mx.degenerate ? (
              <p className="vreason">
                <b>No useful split exists at this quality bar.</b> {bulk.label} is both the
                cheapest and the strongest model that clears it, so routing between tiers buys
                nothing — send everything to it at <b>{money(mx.blendedPer1M)}/1M</b>. Lower the
                bar to open up a cheaper bulk tier, or pick a stronger escalation target below.
              </p>
            ) : (
              <p className="vreason">
                Route <b>{100 - hardShare}%</b> of traffic to <b>{bulk.label}</b> and escalate the
                hard <b>{hardShare}%</b> to <b>{hard.label}</b>. That blends to
                <b> {money(mx.blendedPer1M)}/1M tokens</b> — {mx.savedVsAllStrong > 0.01
                  ? <>about <b>{Math.round(mx.savedVsAllStrong * 100)}% less</b> than sending
                    everything to {hard.label}.</>
                  : <>no cheaper than sending everything to {hard.label} at this split.</>}
                {rec.escalatesToClosed && (
                  <> No <i>open</i> model in reach is stronger than {bulk.label}, so the hard tier
                  escalates to a closed API — which means that share of your traffic leaves your
                  infrastructure.</>
                )}
              </p>
            )}

            <div className="statrow">
              <Stat label="Blended monthly" value={money(mx.bestMixMonthly) + '/mo'} sub={`${money(mx.blendedPer1M)}/1M · ${compact(workload.monthlyTokens)} tok/mo`} />
              <Stat label="All on the strong tier" value={money(mx.allStrongMonthly) + '/mo'} sub="the no-routing baseline" />
              <Stat label="Saved by routing" value={Math.round(mx.savedVsAllStrong * 100) + '%'} sub={money(mx.allStrongMonthly - mx.apiOnlyMonthly) + '/mo avoided'} />
              <Stat label="Self-host any tier?" value={mx.anySelfHost ? 'Yes' : 'No'} sub={mx.anySelfHost ? money(mx.selfHostSaving) + '/mo vs all-API' : 'pay-per-token wins on every tier'} />
            </div>

            <label className="field splitslider">
              <span>Hard-tier share: {hardShare}% of traffic → {hard.label}</span>
              <input type="range" min="0" max="100" value={hardShare} onChange={(e) => setHardShare(+e.target.value)} />
              <em className="hint">
                Default {rec.hardShare}% for {task.label.toLowerCase()}. Published routing work
                puts the hard minority anywhere from ~14% to ~40% depending on task — measure
                yours, don’t trust this number.
              </em>
            </label>
          </section>

          <section className="panel">
            <h3>Per tier — and whether to self-host it</h3>
            <p className="muted">
              Each tier is provisioned for <b>its own</b> peak at the <b>same</b> duty cycle.
              Splitting traffic therefore makes self-hosting <i>harder</i> to justify per tier,
              not easier — a smaller slice still needs a fleet sized for its peak.
            </p>
            <div className="tiers">
              {mx.rows.map((r, i) => (
                <TierCard
                  key={r.model.id + i}
                  row={r}
                  label={i === 0 ? 'Bulk tier' : 'Hard tier'}
                  pool={i === 0 ? cands : [...cands, ...frontier]}
                  onPick={(id) => (i === 0 ? setBulkId(id) : setHardId(id))}
                  priceCtx={priceCtx}
                />
              ))}
            </div>
          </section>

          <section className="panel">
            <h3>What this does and doesn’t account for</h3>
            <ul className="src">
              <li><b>Routing isn’t free.</b> Something has to decide which tier each request goes to — a classifier, a heuristic, or a cascade that retries on the strong model. That costs tokens and latency, and it is <b>not</b> in the numbers above. A cascade that escalates after a failed cheap attempt pays for both.</li>
              <li><b>Misroutes cost quality, not just money.</b> These figures assume the split is correct. Send a hard query to the bulk tier and you get a worse answer, which may cost more than the tokens you saved.</li>
              <li><b>The capability tier is editorial.</b> Our 1–4 quality rating is a coarse judgement, not a benchmark score. Validate the bulk model on <i>your</i> traffic before trusting the split — that is the whole risk of this plan.</li>
              <li><b>Splitting hurts self-host economics.</b> Two tiers means two fleets, each sized for peak. Consolidating onto one self-hosted model is sometimes cheaper than a clever split — compare against the single-model view.</li>
              <li><b>Prices are dated and move fast.</b> Every figure traces to the live feed shown at the top, or to an input you set.</li>
            </ul>
            <div className="cta">
              <button className="link" onClick={() => onNavigate('decide')}>Check a single model end-to-end →</button>
              <button className="link" onClick={() => onNavigate('hardware')}>Tune the TCO assumptions →</button>
              <button className="link" onClick={() => onNavigate('catalog')}>See every candidate model →</button>
            </div>
          </section>
        </>
      )}
    </>
  )
}

function TierCard({ row, label, pool, onPick, priceCtx }) {
  const m = row.model
  const sh = row.selfHost
  return (
    <div className={'tiercard' + (row.best === 'self' ? ' self' : '')}>
      <div className="tchead">
        <span className="tclabel">{label} · {Math.round(row.share * 100)}%</span>
        <select value={m.id} onChange={(e) => onPick(e.target.value)}>
          {pool.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}{c.closed ? ' (closed API)' : ''} — ${per1M(c, priceCtx).toFixed(3)}/1M
            </option>
          ))}
        </select>
      </div>

      <div className="tcbody">
        <div className="tcrow">
          <span>Tokens/month</span><b>{compact(row.monthlyTokens)}</b>
        </div>
        <div className="tcrow">
          <span>Effective rate</span><b>${row.effectivePer1M.toFixed(3)}/1M</b>
        </div>
        <div className={'tcrow' + (row.best === 'api' ? ' win' : '')}>
          <span>Pay-per-token</span><b>{money(row.apiMonthly)}/mo</b>
        </div>
        {sh ? (
          <>
            <div className={'tcrow' + (row.best === 'self' ? ' win' : '')}>
              <span>Self-host ({sh.basis})</span><b>{money(sh.monthly)}/mo</b>
            </div>
            <div className="tcrow sub">
              <span>{sh.gpus}× H100 · {sh.vram}GB VRAM</span>
              <span>{isFinite(sh.breakEvenTokensPerDay) ? `break-even ${compact(sh.breakEvenTokensPerDay)} tok/day` : 'never breaks even'}</span>
            </div>
          </>
        ) : (
          <div className="tcrow sub">
            <span>Closed model — API only</span><span>weights not available at any price</span>
          </div>
        )}
        {!m.closed && !m.commercial && (
          <div className="licwarn small">⚠ {m.license} is non-commercial — a paid licence is required to self-host this in a product.</div>
        )}
      </div>

      <div className={'tcverdict ' + (row.best === 'self' ? 'w-self' : 'w-api')}>
        {row.best === 'self' ? `Self-host this tier — saves ${money(row.apiMonthly - sh.monthly)}/mo` : 'Keep this tier on the API'}
      </div>
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
