import React from 'react'

// THE THESIS PANEL.
//
// Open weights are free. Open inference is not. Everywhere else this tool reports
// which side wins; here it reports WHY, by walking your cost up from bare metal
// and naming each term. The load-bearing row is the first one — if the neocloud
// undercuts your GPUs running flat out with nobody paid and nothing idle, the gap
// is structural and no amount of operational discipline reaches it.

const pct = (v) => (v * 100).toFixed(0) + '%'
const per1M = (v) => (v >= 100 ? '$' + Math.round(v) : '$' + v.toFixed(v < 1 ? 3 : 2))

export default function Decomposition({ d, model, mode }) {
  if (!d) return null

  const structural = d.floor.losesEvenAtPerfectUtilisation
  const share = d.shareOfGap
  const max = Math.max(d.selfHostPer1M, d.neocloudPer1M)

  return (
    <div className="dec">
      {/* Marquee: the two numbers the whole product exists to compare. */}
      <div className="dec-marquee">
        <div className="dec-big local">
          <span className="dec-big-label">Run it yourself</span>
          <span className="dec-big-value">{per1M(d.selfHostPer1M)}</span>
          <span className="dec-big-unit">per 1M tokens</span>
        </div>
        <div className="dec-vs">
          <span className="dec-mult">{d.multiple >= 10 ? d.multiple.toFixed(0) : d.multiple.toFixed(1)}×</span>
          <span className="dec-vs-label">more expensive</span>
        </div>
        <div className="dec-big neo">
          <span className="dec-big-label">Neocloud API</span>
          <span className="dec-big-value">{per1M(d.neocloudPer1M)}</span>
          <span className="dec-big-unit">per 1M tokens</span>
        </div>
      </div>

      <p className="dec-thesis">
        The weights for <b>{model.label}</b> are free to download. Everything below is
        what it costs to turn them into tokens — the part of the stack that open
        weights do not include.
      </p>

      {/* The walk-up. Each row adds one named cost to the row above it. */}
      <div className="dec-steps">
        <div className="dec-row baseline">
          <div className="dec-row-label">
            Neocloud charges
            <span>what someone else's inference stack delivers</span>
          </div>
          <div className="dec-bar">
            <div className="dec-fill neo" style={{ width: Math.max(2, (d.neocloudPer1M / max) * 100) + '%' }} />
          </div>
          <div className="dec-row-value">{per1M(d.neocloudPer1M)}</div>
        </div>

        {d.steps.map((s) => (
          <div className={'dec-row' + (s.id === 'compute' ? ' floor' : '')} key={s.id}>
            <div className="dec-row-label">
              {s.id === 'compute' ? 'Your bare GPU compute' : `+ ${s.label}`}
              <span>{s.sub}</span>
            </div>
            <div className="dec-bar">
              <div className={'dec-fill ' + s.id} style={{ width: Math.max(2, (s.value / max) * 100) + '%' }} />
            </div>
            <div className="dec-row-value">
              {per1M(s.value)}
              {s.id !== 'compute' && <em>+{per1M(s.delta)}</em>}
            </div>
          </div>
        ))}
      </div>

      {/* The verdict this panel exists to deliver. */}
      <div className={'dec-finding ' + (structural ? 'structural' : 'winnable')}>
        {structural ? (
          <>
            <b>The gap is structural, not operational.</b> Your GPUs running flat out —
            nobody paid, nothing idle, no overhead — still cost{' '}
            <b>{per1M(d.floor.per1M)}/1M</b>, which is{' '}
            <b>{d.floor.multipleOfNeocloud.toFixed(1)}×</b> what the neocloud charges.
            Every operational excuse has already been removed at that line, so what
            remains is only two things: how many tokens they get from a GPU-hour that
            you do not, and what they pay for that GPU-hour that you cannot.
            That is the inference engineering the weights leave out.
          </>
        ) : (
          <>
            <b>This one is winnable — the barrier is utilisation, not physics.</b>{' '}
            Your bare compute at full tilt is <b>{per1M(d.floor.per1M)}/1M</b>, already{' '}
            <b>{d.floor.multipleOfNeocloud < 1
              ? `below the neocloud's ${per1M(d.neocloudPer1M)}`
              : `${d.floor.multipleOfNeocloud.toFixed(1)}× the neocloud`}</b>.
            {model.active < model.params && (
              <> {model.label} activates only {model.active}B of {model.params}B parameters
              per token, so a GPU-hour buys far more tokens than a dense model of the
              same size.</>
            )}{' '}
            What you lose it on is running at <b>{pct(d.utilisation)}</b> utilisation and
            paying a team. Both are yours to fix; the physics is not against you.
          </>
        )}
      </div>

      {share && (
        <div className="dec-share">
          <div className="dec-share-title">What the gap is made of</div>
          <div className="dec-share-bar">
            {[
              ['compute', 'Serving efficiency & hardware cost'],
              ['facility', 'Power & space'],
              ['ops', 'People'],
              ['idle', 'Idle capacity']
            ].map(([k, label]) => {
              const v = share[k]
              if (v <= 0.005) return null
              return <div key={k} className={'dec-seg ' + k} style={{ flexGrow: v }} title={`${label} — ${pct(v)}`} />
            })}
          </div>
          <div className="dec-share-key">
            {[
              ['compute', 'Serving efficiency & hardware'],
              ['facility', 'Power & space'],
              ['ops', 'People'],
              ['idle', 'Idle capacity']
            ].map(([k, label]) => (
              <span key={k} className={share[k] < 0 ? 'credit' : ''}>
                <i className={'dot ' + k} />
                {label} <b>{share[k] < 0 ? '−' + pct(Math.abs(share[k])) : pct(share[k])}</b>
                {share[k] < 0 && <em> (in your favour)</em>}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="dec-caveat">
        The first row now comes from <b>published serving benchmarks</b> rather than a
        heuristic, and re-deriving it against real numbers cut this gap substantially —
        an earlier version of this tool overstated the hardware a deployment needs by
        about 2.4×, because it assumed adding GPUs added throughput. It does not. One
        reading still worth holding: some neocloud prices are almost certainly below
        cost to buy market share, which is a business decision rather than an
        engineering one, and it will not last forever.
      </p>
    </div>
  )
}

// FUTURE — the levers that move this, and which way.
//
// Deliberately separated into what the tool has measured versus what it is only
// reasoning about. A thesis that cannot tell you which of its inputs are evidence
// is just a position.
export function Levers({ history }) {
  const measuredDrift = history
    ? `${history.fixedBasket.annualMultiple.toFixed(2)}×/yr for a fixed basket over ${history.window.months} months`
    : null

  const rows = [
    {
      lever: 'Models that fit on one GPU',
      dir: 'self',
      status: 'measured',
      detail: 'Benchmarks show tensor parallelism buys capacity, not speed — eight GPUs serve roughly what one does. So a model needing four GPUs to fit costs about four times as much for the same tokens. Anything that fits in a single card’s memory (Gemma 4 31B, Qwen3 30B-A3B) beats the neocloud on bare compute; anything that doesn’t, loses. Total size matters more than sparsity, because total size is what sets VRAM.'
    },
    {
      lever: 'Open serving stacks',
      dir: 'self',
      status: 'reasoned',
      detail: 'vLLM, SGLang and TensorRT-LLM absorb the batching and attention work that used to be proprietary. Every release narrows the tokens-per-GPU-hour gap, which is the term this whole panel turns on.'
    },
    {
      lever: 'Quantisation maturity',
      dir: 'self',
      status: 'measured',
      detail: 'Providers already serve the same model anywhere from fp4 to fp16. As low-precision serving stops costing quality, it stops being their edge and starts being available to you.'
    },
    {
      lever: 'Your own utilisation',
      dir: 'self',
      status: 'measured',
      detail: 'The largest single term in most gaps here. Consolidating workloads onto one fleet, or accepting queueing, moves it more than any purchasing decision.'
    },
    {
      lever: 'Neocloud multi-tenancy',
      dir: 'neo',
      status: 'reasoned',
      detail: 'Their structural advantage compounds with scale: more customers means demand pooled across uncorrelated peaks, so their fleets sit near full while yours sits at your duty cycle. This is the one lever you cannot copy at any size.'
    },
    {
      lever: 'Hardware generations',
      dir: 'neo',
      status: 'reasoned',
      detail: 'They adopt new silicon first and amortise it across everyone. Hardware you bought is hardware you are stuck with — a fleet is a bet that the current generation stays competitive for the length of your amortisation.'
    },
    {
      lever: 'Subsidised pricing unwinding',
      dir: 'self',
      status: 'uncertain',
      detail: 'The most consequential unknown. If today’s cheapest listings are below cost to win share, they rise when that stops — and every break-even here moves toward self-hosting. Nothing in the public data separates a subsidised price from an efficient one.'
    },
    {
      lever: 'Per-token price decline',
      dir: 'neutral',
      status: 'measured',
      detail: measuredDrift
        ? `Weaker than assumed. Measured at ${measuredDrift} — essentially flat. The decline everyone quotes comes from cheaper new models arriving, not from the model you picked getting cheaper. Staying on one model means the API side does not drift away from you.`
        : 'Measured history shows per-model list prices are far stickier than the commonly quoted decline.'
    }
  ]

  return (
    <div className="lev">
      <p className="lev-intro">
        This comparison is a snapshot of a moving system. These are the forces acting on
        it, which way each one pushes, and — separately — whether we have measured it or
        are only reasoning about it.
      </p>
      <div className="lev-rows">
        {rows.map((r) => (
          <div className="lev-row" key={r.lever}>
            <div className={'lev-dir ' + r.dir}>
              {r.dir === 'self' ? '↓ self-host' : r.dir === 'neo' ? '↑ neocloud' : '↔ neither'}
            </div>
            <div className="lev-body">
              <div className="lev-head">
                {r.lever}
                <span className={'lev-status ' + r.status}>{r.status}</span>
              </div>
              <p>{r.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="dec-caveat">
        Arrows show which side a lever favours if it keeps moving as it has been —
        not a forecast. The two marked <b>uncertain</b> and <b>reasoned</b> are
        positions, not findings; only the <b>measured</b> rows are backed by data in
        this tool.
      </p>
    </div>
  )
}
