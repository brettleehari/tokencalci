import React, { useMemo, useState } from 'react'
import { MODELS, GPUS, PRECISIONS } from './hwdata.js'
import { modelEconomics, fmtGB } from './hwcalc.js'
import { money, compact } from './calc.js'

const BASE = {
  amortMonths: 36, kwhCost: 0.12, pue: 1.3, overheadPct: 15,
  personnelMonthly: 3000, spacePerKwMonth: 150
}

export default function Decide({ onNavigate }) {
  const [modelId, setModelId] = useState('llama-70b')
  const [precision, setPrecision] = useState('fp16')
  const [peakTokPerMin, setPeak] = useState(100000)
  const [dutyPct, setDuty] = useState(30)
  const [mode, setMode] = useState('rent')
  const [sovereign, setSovereign] = useState(false)

  const model = MODELS.find((m) => m.id === modelId)
  const gpu = GPUS.find((g) => g.id === 'h100')
  const e = useMemo(
    () => modelEconomics(model, gpu, precision, { ...BASE, mode, peakTokPerMin, dutyPct, haFactor: sovereign ? 2 : 1 }),
    [modelId, precision, mode, peakTokPerMin, dutyPct, sovereign]
  )

  const ratio = e.ratio // selfHost$/mo ÷ neocloud$/mo ; >1 means self-host costs more
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
      <section className="panel">
        <h2 className="q">Should I self-host this model?</h2>
        <p className="muted">
          The honest answer depends on three things: the model, how much you use it,
          and whether your data can leave your walls. Set those and get a verdict —
          with the math behind it. Self-host is a <b>fixed</b> cost (you buy/rent for
          peak, 24×7); a neocloud API is <b>variable</b> (pay per token, idle is free).
        </p>
        <div className="grid">
          <label className="field"><span>Model</span>
            <select value={modelId} onChange={(ev) => setModelId(ev.target.value)}>
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} · {m.params}B{m.active < m.params ? `/${m.active}B` : ''}</option>)}
            </select>
          </label>
          <label className="field"><span>Precision</span>
            <select value={precision} onChange={(ev) => setPrecision(ev.target.value)}>
              {PRECISIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Peak demand (tokens/min)</span>
            <input type="number" step="10000" value={peakTokPerMin} onChange={(ev) => setPeak(+ev.target.value || 0)} />
          </label>
          <label className="field"><span>Duty cycle: {dutyPct}% of the time</span>
            <input type="range" min="1" max="100" value={dutyPct} onChange={(ev) => setDuty(+ev.target.value)} />
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
      </section>

      <section className={`panel heroverdict ${cls}`}>
        <div className="vtitle">{verdict}</div>
        <p className="vreason">{reason}</p>
        {!model.commercial && (
          <div className="licwarn">
            ⚠ <b>{model.label}</b> ships under a <b>non-commercial license ({model.license})</b> — you’d
            need a paid license to self-host it in a product. It’s fine for research/internal
            evaluation, but a neocloud that has licensed it may be your only compliant option.
          </div>
        )}
        <div className="statrow">
          <Stat label="Self-host" value={money(e.selfHostMonthly) + '/mo'} sub={`fixed · ${e.numGpus}× H100 · $${e.selfHostPer1M < 1000 ? e.selfHostPer1M.toFixed(2) : compact(e.selfHostPer1M)}/1M`} />
          <Stat label="Neocloud API" value={money(e.apiMonthly) + '/mo'} sub={`variable · $${e.apiPer1M.toFixed(2)}/1M · ${compact(monthlyTokens)} tok/mo`} />
          <Stat label="Break-even duty" value={e.breakEvenDuty > 1 ? 'never' : (e.breakEvenDuty * 100).toFixed(0) + '%'} sub="self-host wins above this" />
          <Stat label="Model VRAM" value={fmtGB(e.vram)} sub={`${precision} · fits ${e.numGpus}× 80GB`} />
        </div>
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

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="statlabel">{label}</div>
      <div className="statval">{value}</div>
      <div className="statsub">{sub}</div>
    </div>
  )
}
