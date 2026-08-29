import React, { useEffect, useState } from 'react'
import Decide from './Decide.jsx'
import Chain from './Chain.jsx'
import Paper from './Paper.jsx'

// Nav is grouped, not a flat row of seven: the two calculators are the product,
// everything else is reference material you consult and leave.
// Three destinations, mapping onto the three readers: the decider wants the
// answer, the practitioner wants the mechanism, the sceptic wants the method.
// Everything else became depth inside Estimate rather than a peer tab.
const CALCULATORS = [['decide', 'Estimate']]
const REFERENCE = [
  ['chain', 'The chain'],
  ['paper', 'Paper']
]

const TITLES = {
  // The Estimate view renders its own thesis header, so the generic title/sub is
  // suppressed there — a slogan above an argument would just be noise.
  decide:    [null, null],
  paper:     [null, null],
  chain:     ['The serving chain', 'Ten blocks stand between a downloadable checkpoint and a token you can bill for. Exactly one of them is open.'],
}

export default function App() {
  const [view, setView] = useState('decide')

  // This is a single-page app: switching tabs never changes the URL, so GoatCounter's
  // automatic page-load counting sees exactly one hit no matter how much someone
  // reads. Count the view explicitly instead, as a virtual path, so "how many people
  // reached the paper" is answerable.
  React.useEffect(() => {
    const path = view === 'decide' ? '/' : `/${view}`
    const title = view === 'decide' ? 'Estimate' : view === 'chain' ? 'The chain' : 'Paper'
    window.goatcounter?.count?.({ path, title, event: false })
  }, [view])
  const [feed, setFeed] = useState(null)
  const [feedErr, setFeedErr] = useState(null)
  const [gpuFeed, setGpuFeed] = useState(null)
  const [history, setHistory] = useState(null)
  const [orInfo, setOrInfo] = useState(null)

  useEffect(() => {
    fetch('/api/prices')
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setFeed(d) })
      .catch((e) => setFeedErr(e.message))
    // GPU rental prices and the measured price history are secondary: the app
    // still works on dated constants if either is unavailable.
    fetch('/api/gpus').then((r) => r.json()).then((d) => !d.error && setGpuFeed(d)).catch(() => {})
    fetch('/api/history').then((r) => r.json()).then((d) => !d.error && setHistory(d)).catch(() => {})
    fetch('/api/openrouter').then((r) => r.json()).then((d) => d.available && setOrInfo(d)).catch(() => {})
  }, [])

  const [title, sub] = TITLES[view] || TITLES.decide

  return (
    <>
      <div className="app-bar">
        <div className="app-brand">
          <span className="name">opentoken</span>
          <span className="beta">beta</span>
        </div>
        <nav className="app-nav">
          {CALCULATORS.map(([id, label]) => (
            <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{label}</button>
          ))}
          <span className="sep" />
          {REFERENCE.map(([id, label]) => (
            <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{label}</button>
          ))}
        </nav>
        <div className="app-bar-right">
          <PriceStamp feed={feed} feedErr={feedErr} />
          <span className="app-credit">
            <a href="https://brettleehari.github.io/Hari.me/" target="_blank" rel="noopener noreferrer">Hariprasad Sudharshan</a>
          </span>
        </div>
      </div>

      <main className={'app-main' + (CALCULATORS.some(([id]) => id === view) ? '' : ' doc')}>
        {title && <h1 className="app-title">{title}</h1>}
        {sub && <p className="app-sub">{sub}</p>}

      {view === 'decide' && <Decide onNavigate={setView} feed={feed} gpuFeed={gpuFeed} history={history} orInfo={orInfo} />}
      {view === 'chain' && <Chain feed={feed} servingPrecision={orInfo?.servingPrecision} />}
      {view === 'paper' && <Paper />}

        <Caveats history={history} gpuFeed={gpuFeed} />
        <footer>
          Beta · all figures directional · every number traces to your inputs or a dated feed.
          Not financial advice. Built by{' '}
          <a href="https://brettleehari.github.io/Hari.me/" target="_blank" rel="noopener noreferrer">Hariprasad Sudharshan</a>
          {' · '}<a href="https://x.com/Hari_AiPm" target="_blank" rel="noopener noreferrer">X</a>
          {' · '}<a href="https://www.linkedin.com/in/haripm4ai/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        </footer>
      </main>
    </>
  )
}

function PriceStamp({ feed, feedErr }) {
  if (feedErr) return <span className="app-freshness"><i className="dot err" />Price feed unavailable</span>
  if (!feed) return <span className="app-freshness"><i className="dot snap" />Connecting…</span>
  return (
    <span className="app-freshness" title={`LiteLLM · ${feed.count} models · ${feed.source}`}>
      <i className={'dot' + (feed.live ? '' : ' snap')} />
      {feed.live ? 'Live prices' : 'Snapshot'} · {feed.asOf}
    </span>
  )
}

function Caveats({ history, gpuFeed }) {
  return (
    <section className="panel caveats">
      <h2>What these numbers are and aren't</h2>
      <ul>
        <li>
          <b>Prices move — but not the way it's usually claimed.</b>{' '}
          {history ? (
            <>Measured from {history.window.months} months of the LiteLLM feed's own git history:
            a <b>fixed basket of the same models moved {history.fixedBasket.annualMultiple.toFixed(2)}×/year</b> —
            essentially flat. What falls is the <b>cheapest option available</b>
            ({Math.round(history.cheapestAvailable.annualDeclinePct)}%/year), because cheaper new models keep
            arriving. The widely-quoted “~10×/year” does not hold for per-token list prices, so
            treat projections that assume it — including older versions of this tool — with suspicion.</>
          ) : (
            <>Per-model list prices are far stickier than the commonly quoted “~10×/year”; see the
            measured history at <code>/api/history</code>.</>
          )}
        </li>
        <li><b>Throughput is fitted to third-party vLLM serving benchmarks at batch 256 — not measured in-house, and with no batch-size or context-length term.</b> Self-host tokens/sec is estimated from model size, not measured — it swings with batch size, context, quantization, and serving engine. Treat break-evens as ballpark.</li>
        <li>
          <b>GPU rental is live; purchase price is not.</b>{' '}
          {gpuFeed?.live
            ? `Rental rates come from ${gpuFeed.covered} live marketplace queries as of ${gpuFeed.asOf}, shown as a median with its full spread. That marketplace is community/spot capacity, so enterprise contracts cost more. Purchase prices remain dated constants (${gpuFeed.capexAsOf}) — no comparable open feed exists.`
            : 'The live GPU marketplace feed is unavailable, so rental rates are dated constants right now.'}
        </li>
        <li><b>Some prices are curated.</b> Where a model matches the live feed we use the live blended price; otherwise a directional figure cross-checked against provider pages.</li>
        <li><b>Every number is traceable.</b> <b>Where every number comes from</b>, at the foot of the Estimate page, lists each data layer, where it comes from, how often it refreshes, and what it can’t tell you — including the two layers that are our own estimates.</li>
        <li><b>Vendor break-evens are biased.</b> Many public self-host numbers come from parties selling GPUs or gateways. This tool shows its math so you can check it — every number traces to an input or the dated feed.</li>
        <li><b>Tokenizers differ.</b> Different models use different tokenizers, so the same text becomes a different number of tokens per model — direct token-based price comparisons may not be entirely accurate.</li>
      </ul>
    </section>
  )
}
