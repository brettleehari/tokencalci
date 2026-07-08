import React, { useEffect, useState } from 'react'
import HardwareDB from './HardwareDB.jsx'
import Sovereign from './Sovereign.jsx'
import Catalog from './Catalog.jsx'
import Decide from './Decide.jsx'
import Guide from './Guide.jsx'

const TABS = [
  ['decide', 'Should I self-host?'],
  ['hardware', 'Hardware & TCO'],
  ['sovereign', 'Sovereign'],
  ['catalog', 'Models & providers'],
  ['guide', 'Guide']
]

export default function App() {
  const [view, setView] = useState('decide')
  const [feed, setFeed] = useState(null)
  const [feedErr, setFeedErr] = useState(null)

  useEffect(() => {
    fetch('/api/prices')
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setFeed(d) })
      .catch((e) => setFeedErr(e.message))
  }, [])

  return (
    <div className="wrap">
      <div className="topcredit">
        <span className="tc-by">Built by <a href="https://brettleehari.github.io/Hari.me/" target="_blank" rel="noopener noreferrer">Hariprasad Sudharshan</a></span>
        <span className="tc-links">
          <a href="https://x.com/Hari_AiPm" target="_blank" rel="noopener noreferrer">X (@Hari_AiPm)</a>
          <span className="sep">·</span>
          <a href="https://brettleehari.github.io/Hari.me/" target="_blank" rel="noopener noreferrer">Portfolio</a>
          <span className="sep">·</span>
          <a href="https://x.com/Hari_AiPm" target="_blank" rel="noopener noreferrer">DM for queries</a>
        </span>
      </div>
      <header>
        <h1>Should I self-host? <span className="beta">beta</span></h1>
        <p className="tag">
          Should you self-host a model, or rent it from a neocloud API? An honest,
          up-to-date answer — with the math, not a vendor's pitch.
        </p>
        <PriceStamp feed={feed} feedErr={feedErr} />
        <nav className="tabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{label}</button>
          ))}
        </nav>
      </header>

      {view === 'decide' && <Decide onNavigate={setView} feed={feed} />}
      {view === 'hardware' && <HardwareDB feed={feed} />}
      {view === 'sovereign' && <Sovereign feed={feed} />}
      {view === 'catalog' && <Catalog feed={feed} />}
      {view === 'guide' && <Guide />}

      <Caveats />
      <footer>Beta · all figures directional · numbers trace to your inputs or the dated feed. Not financial advice.</footer>
    </div>
  )
}

function PriceStamp({ feed, feedErr }) {
  if (feedErr) return <div className="stamp err">Price feed unavailable ({feedErr}) — using curated figures.</div>
  if (!feed) return <div className="stamp">Connecting to live price feed…</div>
  return (
    <div className={`stamp ${feed.live ? 'live' : 'snap'}`}>
      {feed.live ? 'Live' : 'Snapshot'} pricing feed · LiteLLM · {feed.count} models · as of <b>{feed.asOf}</b>
    </div>
  )
}

function Caveats() {
  return (
    <section className="panel caveats">
      <h2>What these numbers are and aren't</h2>
      <ul>
        <li><b>Prices move fast.</b> Inference cost has fallen ~10×/year. Every figure is directional; check the as-of date above.</li>
        <li><b>Throughput is heuristic.</b> Self-host tokens/sec is estimated from model size, not measured — it swings with batch size, context, quantization, and serving engine. Treat break-evens as ballpark.</li>
        <li><b>Some prices are curated.</b> Where a model matches the live feed we use the live blended price; otherwise a directional figure cross-checked against provider pages.</li>
        <li><b>Vendor break-evens are biased.</b> Many public self-host numbers come from parties selling GPUs or gateways. This tool shows its math so you can check it — every number traces to an input or the dated feed.</li>
        <li><b>Tokenizers differ.</b> Different models use different tokenizers, so the same text becomes a different number of tokens per model — direct token-based price comparisons may not be entirely accurate.</li>
      </ul>
    </section>
  )
}
