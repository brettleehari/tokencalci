import React, { useMemo, useState } from 'react'
import { pricedGpus, pricedModels } from './hwdata.js'
import { frontierModels } from './pricing.js'
import { deriveWorkload, TRAFFIC_SHAPES } from './hwcalc.js'
import { QUALITY_BARS, TASK_TYPES, candidates, defaultTiers, mixEconomics, per1M } from './mix.js'
import { money, compact } from './calc.js'
import {
  Workspace, Config, Rail, Section, Field, Slider,
  Verdict, LineItem, RailGroup, BottomLine, Note
} from './ui/Workspace.jsx'

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
  const [copied, setCopied] = useState(false)

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
    <Workspace>
      <Config>
        <Section
          title="Workload"
          note="The same traffic definition as the Estimate view. Requests and token sizes convert exactly to peak and duty cycle."
        >
          <Field label="Requests per day">
            <input type="number" step="10000" min="0" value={dailyRequests}
              onChange={(e) => setDailyRequests(Math.max(0, +e.target.value || 0))} />
          </Field>
          <Field label="Avg input tokens" unit="/ req">
            <input type="number" step="100" min="0" value={avgIn}
              onChange={(e) => setAvgIn(Math.max(0, +e.target.value || 0))} />
          </Field>
          <Field label="Avg output tokens" unit="/ req">
            <input type="number" step="50" min="0" value={avgOut}
              onChange={(e) => setAvgOut(Math.max(0, +e.target.value || 0))} />
          </Field>
          <Field label="Traffic shape">
            <select value={peakiness} onChange={(e) => setPeakiness(+e.target.value)}>
              {TRAFFIC_SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <div className="ws-derived">
            <b>{compact(workload.monthlyTokens)}</b> tokens/month ({Math.round(w.outputShare * 100)}% output)
            {' · '}peak <b>{compact(w.peakTokPerMin)}</b> tok/min{' · '}duty <b>{w.dutyPct.toFixed(0)}%</b>
            {' · '}<b>{cands.length}</b> models clear the bar
          </div>
        </Section>

        <Section
          title="What the work is"
          note="Task type sets which models are plausible candidates and how much of the traffic is genuinely hard. The quality bar sets the floor every candidate must clear."
        >
          <Field label="Task type" hint={task.note}>
            <select value={taskId} onChange={(e) => { setTaskId(e.target.value); setHardShare(null); setBulkId(null); setHardId(null) }}>
              {TASK_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Quality bar" hint={bar.note}>
            <select value={barId} onChange={(e) => { setBarId(e.target.value); setBulkId(null); setHardId(null) }}>
              {QUALITY_BARS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </Field>
          <div className="ws-field">
            <label className="ws-check">
              <input type="checkbox" checked={allowNC} onChange={(e) => setAllowNC(e.target.checked)} />
              Allow non-commercial licences
            </label>
            <span className="ws-hint">Includes weights you cannot legally ship in a product.</span>
          </div>
        </Section>

        {mx && (
          <Section
            title="The split"
            note={`Default ${rec.hardShare}% for ${task.label.toLowerCase()}. Published routing work puts the hard minority anywhere from ~14% to ~40% depending on task — measure yours rather than trusting this number.`}
          >
            <Slider
              label={`Escalated to ${hard.label}`}
              value={hardShare} min={0} max={100}
              onChange={setHardShare} format={(v) => v + '%'}
              wide
              hint={`The remaining ${100 - hardShare}% goes to ${bulk.label}.`}
            />
          </Section>
        )}

        <Section
          title="API-side discounts"
          note="Applied to both tiers. Self-host cost is unaffected."
        >
          <Slider label="Prompt cache hit rate" value={cacheHitPct} min={0} max={95}
            onChange={setCacheHit} format={(v) => v + '%'} />
          <Slider label="Batch API share" value={batchPct} min={0} max={100}
            onChange={setBatch} format={(v) => v + '%'} />
        </Section>

        {mx && (
          <Section
            title="Per tier — and whether to self-host it"
            note="Each tier is provisioned for its own peak at the same duty cycle. Splitting traffic therefore makes self-hosting harder to justify per tier, not easier — a smaller slice still needs a fleet sized for its peak."
          >
            <div className="tiers ws-full">
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
          </Section>
        )}

        <Section title="What this does and doesn't account for">
          <ul className="src ws-full">
            <li><b>Routing isn't free.</b> Something has to decide which tier each request goes to — a classifier, a heuristic, or a cascade that retries on the strong model. That costs tokens and latency, and it is <b>not</b> in the numbers here. A cascade that escalates after a failed cheap attempt pays for both.</li>
            <li><b>Misroutes cost quality, not just money.</b> These figures assume the split is correct. Send a hard query to the bulk tier and you get a worse answer, which may cost more than the tokens you saved.</li>
            <li><b>The capability tier is editorial.</b> The 1–4 rating is a coarse judgement, not a benchmark score — the one input here with no dated feed behind it. Validate the bulk model on your own traffic before trusting the split.</li>
            <li><b>Splitting hurts self-host economics.</b> Two tiers means two fleets, each sized for peak. Consolidating onto one self-hosted model is sometimes cheaper than a clever split.</li>
          </ul>
          <div className="cta ws-full">
            <button className="link" onClick={() => onNavigate('decide')}>Check a single model end-to-end →</button>
            <button className="link" onClick={() => onNavigate('catalog')}>See every candidate →</button>
            <button className="link" onClick={() => onNavigate('sources')}>Where these numbers come from →</button>
          </div>
        </Section>
      </Config>

      <Rail>
        <div className="rail-scroll">
          {!mx ? (
            <Verdict tone="warn" label="No candidates" headline="Nothing clears this bar">
              No open model clears a {bar.label.toLowerCase()} bar for {task.label.toLowerCase()}
              {allowNC ? '' : ' under a commercial licence'}. Loosen the bar, or allow
              non-commercial licences.
            </Verdict>
          ) : (
            <>
              <Verdict
                tone={mx.degenerate ? 'warn' : 'api'}
                label="Recommended mix"
                headline={mx.degenerate ? 'No useful split exists' : `${100 - hardShare}% ${bulk.label} · ${hardShare}% ${hard.label}`}
              >
                {mx.degenerate
                  ? <>{bulk.label} is both the cheapest and the strongest model clearing this bar, so routing between tiers buys nothing. Send everything to it, or lower the bar to open up a cheaper bulk tier.</>
                  : <>Blends to {money(mx.blendedPer1M)}/1M — {mx.savedVsAllStrong > 0.01
                      ? <>about <b>{Math.round(mx.savedVsAllStrong * 100)}% less</b> than sending everything to {hard.label}.</>
                      : <>no cheaper than sending everything to {hard.label} at this split.</>}
                    {rec.escalatesToClosed && <> No open model in reach is stronger, so the hard tier escalates to a closed API — that share of your traffic leaves your infrastructure.</>}</>}
              </Verdict>

              <RailGroup title="Per tier">
                {mx.rows.map((r, i) => (
                  <LineItem
                    key={r.model.id + i}
                    label={`${i === 0 ? 'Bulk' : 'Hard'} · ${Math.round(r.share * 100)}%`}
                    sub={`${r.model.label} · ${r.best === 'self' ? 'self-host' : 'API'}`}
                    value={money(r.bestMonthly)}
                    tone={r.best === 'self' ? 'good' : null}
                  />
                ))}
              </RailGroup>

              <RailGroup title="Versus the alternatives">
                <LineItem label="All on the strong tier" sub="the no-routing baseline" value={money(mx.allStrongMonthly)} />
                <LineItem label="Saved by routing" value={Math.round(mx.savedVsAllStrong * 100) + '%'}
                  tone={mx.savedVsAllStrong > 0.01 ? 'good' : null} />
                <LineItem label="Saved by self-hosting"
                  value={mx.selfHostSaving > 0 ? money(mx.selfHostSaving) : 'nothing'} />
              </RailGroup>

              <RailGroup title="Blended">
                <LineItem label="Effective rate" value={money(mx.blendedPer1M) + '/1M'} strong />
                <LineItem label="Tokens/month" value={compact(workload.monthlyTokens)} />
              </RailGroup>

              <Note>
                Routing cost is <b>not</b> included — a classifier or cascade consumes tokens and
                adds latency, and a cascade that retries on the strong model pays for both.
              </Note>
            </>
          )}
        </div>

        {mx && (
          <BottomLine
            label="Blended monthly"
            value={money(mx.bestMixMonthly)}
            sub={`${money(mx.blendedPer1M)}/1M · ${compact(workload.monthlyTokens)} tokens`}
            actions={
              <button onClick={() => {
                const txt = [
                  `Model mix — ${task.label}, ${bar.label}`,
                  ``,
                  ...mx.rows.map((r, i) => `${i === 0 ? 'Bulk' : 'Hard'} ${Math.round(r.share * 100)}%: ${r.model.label} — ${money(r.bestMonthly)}/mo (${r.best === 'self' ? 'self-host' : 'API'})`),
                  ``,
                  `Blended: ${money(mx.bestMixMonthly)}/mo at ${money(mx.blendedPer1M)}/1M`,
                  `All on ${hard.label}: ${money(mx.allStrongMonthly)}/mo — routing saves ${Math.round(mx.savedVsAllStrong * 100)}%`,
                  ``,
                  `Routing cost not included. tokencalci`
                ].join('\n')
                navigator.clipboard?.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) }, () => {})
              }}>{copied ? 'Copied' : 'Copy plan'}</button>
            }
          />
        )}
      </Rail>
    </Workspace>
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
