import React, { useMemo, useState } from 'react'
import { pricedModels, NEOCLOUDS, QUALITY_BASIS } from './hwdata.js'
import { frontierModels } from './pricing.js'

const MODALITIES = ['all', 'text', 'reasoning', 'code', 'vision', 'RAG', 'multilingual']
const SORTS = [
  { id: 'rank', label: 'Our rank' },
  { id: 'quality', label: 'Capability' },
  { id: 'size', label: 'Size (small→large)' },
  { id: 'price', label: 'Neocloud price (low→high)' },
  { id: 'ctx', label: 'Context window' },
  { id: 'cutoff', label: 'Knowledge cutoff (newest)' }
]

const fmtCtx = (k) => (k >= 1000 ? (k / 1000) + 'M' : k + 'K')
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
// Parse "Aug 2024" / "early 2025" / "2023" into a sortable number (year*12+month).
function cutoffNum(s) {
  if (!s) return 0
  const y = (s.match(/\d{4}/) || [0])[0] * 1
  const mm = (s.toLowerCase().match(/[a-z]{3}/) || [])[0]
  const m = MONTHS[mm] || (/early/.test(s) ? 2 : /late/.test(s) ? 11 : 6)
  return y * 12 + m
}
const TIER = { 1: 'small', 2: 'mid', 3: 'strong', 4: 'frontier' }

export default function Catalog({ feed }) {
  const [modality, setModality] = useState('all')
  const [commercialOnly, setCommercialOnly] = useState(false)
  const [sort, setSort] = useState('rank')

  const rows = useMemo(() => {
    let r = pricedModels(feed).map((m, i) => ({ ...m, rank: i + 1 }))
    if (modality !== 'all') r = r.filter((m) => m.modality === modality)
    if (commercialOnly) r = r.filter((m) => m.commercial)
    const by = {
      rank: (a, b) => a.rank - b.rank,
      quality: (a, b) => b.quality - a.quality || a.rank - b.rank,
      size: (a, b) => a.params - b.params,
      // Sort on the input rate where we have a real one, else the curated blend.
      price: (a, b) => (a.price.in ?? a.price.blendedOnly) - (b.price.in ?? b.price.blendedOnly),
      ctx: (a, b) => b.ctx - a.ctx,
      cutoff: (a, b) => cutoffNum(b.cutoff) - cutoffNum(a.cutoff)
    }
    return [...r].sort(by[sort])
  }, [modality, commercialOnly, sort, feed])

  const frontier = useMemo(() => frontierModels(feed), [feed])

  const coverage = useMemo(() => {
    const all = pricedModels(feed)
    const live = all.filter((m) => m.livePrice).length
    return { total: all.length, live, curated: all.length - live }
  }, [feed])

  return (
    <>
      <section className="panel">
        <h2>{coverage.total} open models to self-host — and where to rent them</h2>
        <p className="muted">
          A curated catalog of open-weight models across sizes and use-cases, plus
          the neocloud providers that serve them as an API. Use it to pick a model,
          check its self-host legality (license), and see the pay-per-token baseline.
        </p>
        <p className="muted small">
          <b>{coverage.live} of {coverage.total}</b> models are priced live from the feed
          (median across every provider serving them); the other <b>{coverage.curated}</b> have
          no per-token match and show a curated blended figure, marked as such. We don’t mix the two.
        </p>
        <p className="muted small">
          <b>The one number here without a feed behind it is the capability tier.</b>{' '}
          {QUALITY_BASIS.limitation} It is {QUALITY_BASIS.basis}, as of {QUALITY_BASIS.asOf}
          ({QUALITY_BASIS.scale}). Treat a one-tier gap as noise.
        </p>
      </section>

      <section className="panel formula">
        <h3>How this list was chosen</h3>
        <ol>
          <li><b>Filter:</b> open, downloadable weights only — you can actually run it. (Closed models like GPT/Claude/Gemini are excluded by definition.)</li>
          <li><b>Rank</b> by a blend of: <b>capability</b> (leaderboard/benchmark tier), <b>adoption</b> (downloads + how many neoclouds serve it), <b>recency</b> (2023–2026), and <b>coverage</b> — we spread across sizes and use-cases so the list is useful, not 50 variants of one family.</li>
          <li><b>Editorial, not a single metric.</b> Informed by public sources (Chatbot Arena, Artificial Analysis, HF trending/downloads, provider catalogs). Figures are <b>directional</b>; capability tier is coarse (1–4), not a benchmark claim.</li>
        </ol>
      </section>

      <section className="panel">
        <h3>Dimensions that matter</h3>
        <ul className="src">
          <li><b>Size / active params</b> — total drives VRAM; <i>active</i> (MoE) drives compute & speed. A 235B MoE with 22B active runs far cheaper than a dense 70B.</li>
          <li><b>Context window</b> — how much it can read at once (8K → 10M).</li>
          <li><b>License / commercial use</b> — some weights are <b>non-commercial</b> (Command R+, MiniMax M3, Codestral, Aya). You legally can't self-host those for a product without a paid license. Note licenses change per release: Mistral Large 3 is Apache-2.0 where Large 2 was not.</li>
          <li><b>Modality</b> — text, reasoning, code, vision, RAG, multilingual.</li>
          <li><b>Origin</b> — org + country, which matters for sovereignty/compliance.</li>
          <li><b>Neocloud $/1M</b> — the pay-per-token baseline you compare self-host against.</li>
        </ul>
      </section>

      <section className="panel">
        <div className="filters">
          <label className="field"><span>Modality</span>
            <select value={modality} onChange={(e) => setModality(e.target.value)}>
              {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="field"><span>Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={commercialOnly} onChange={(e) => setCommercialOnly(e.target.checked)} />
            Commercial-use OK only
          </label>
          <span className="muted small">{rows.length} models</span>
        </div>
        <div className="tablewrap">
          <table className="db">
            <thead>
              <tr>
                <th>#</th><th>Model</th><th>Origin</th><th>Size<br /><span className="th2">(active)</span></th>
                <th>Context</th><th>Released</th><th>Knowledge<br /><span className="th2">cutoff</span></th>
                <th>License</th><th>Modality</th><th>Tier<br /><span className="th2">editorial</span></th>
                <th>$/1M in<br /><span className="th2">neocloud</span></th>
                <th>$/1M out<br /><span className="th2">neocloud</span></th>
                <th>Spread<br /><span className="th2">across providers</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{m.rank}</td>
                  <td className="mname">{m.label}<br /><span className="th2">{m.tag}</span></td>
                  <td>{m.org}<br /><span className="th2">{m.country}</span></td>
                  <td>{m.params}B{m.active < m.params ? <><br /><span className="th2">{m.active}B act</span></> : ''}</td>
                  <td>{fmtCtx(m.ctx)}</td>
                  <td>{m.year}</td>
                  <td>{m.cutoff}</td>
                  <td className={m.commercial ? '' : 'w-api'}>{m.license}{m.commercial ? ' ✓' : ' ⚠NC'}</td>
                  <td>{m.modality}</td>
                  <td>{TIER[m.quality]}</td>
                  {m.livePrice ? (
                    <>
                      <td>${m.price.in.toFixed(3)}<span className="livedot" title={`live — median of ${m.price.spread.n} provider listings`}> ●</span></td>
                      <td>${m.price.out.toFixed(3)}</td>
                      <td className="th2">
                        {m.price.spread.n > 1
                          ? <>${m.price.spread.inMin}–${m.price.spread.inMax} in<br />${m.price.spread.outMin}–${m.price.spread.outMax} out</>
                          : <>1 provider</>}
                      </td>
                    </>
                  ) : (
                    <>
                      <td colSpan={2} className="curatedcell">${m.price.blendedOnly.toFixed(2)} blended<br /><span className="th2">curated — no feed match</span></td>
                      <td className="th2">—</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">✓ = commercial self-host OK · ⚠NC = non-commercial license (needs a paid license for products). <b>●</b> = price refined live from the feed; others curated/directional. <b>Knowledge cutoff is approximate</b> — many labs don't publish exact dates; verify the model card. Directional; verify a model's current license before deploying.</p>
      </section>

      <section className="panel">
        <h3>The frontier baseline — what you’d pay instead</h3>
        <p className="muted">
          Closed models you can’t self-host at any price, straight from the live feed.
          These are the real alternative to self-hosting an open model: stronger, but
          pay-per-token forever and your data leaves your infrastructure.
        </p>
        <div className="tablewrap">
          <table className="db">
            <thead>
              <tr><th>Model</th><th>Provider</th><th>Tier<br /><span className="th2">editorial</span></th><th>$/1M in</th><th>$/1M out</th><th>$/1M cached in</th><th>Feed key</th></tr>
            </thead>
            <tbody>
              {frontier.map((f) => (
                <tr key={f.id}>
                  <td className="mname">{f.label}</td>
                  <td>{f.org}</td>
                  <td>{f.tier}</td>
                  <td>${f.price.in.toFixed(2)}<span className="livedot" title="live from price feed"> ●</span></td>
                  <td>${f.price.out.toFixed(2)}</td>
                  <td>{f.price.cacheRead != null ? '$' + f.price.cacheRead.toFixed(3) : '—'}</td>
                  <td className="th2"><code>{f.price.keys[0]}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>Who provides neocloud serving — and pricing</h3>
        <p className="muted">Providers that serve these open models as an API. "70B ref" = typical blended $/1M for a Llama-70B-class model; per-token players move fast, so treat as ballpark.</p>
        <div className="tablewrap">
          <table className="db">
            <thead>
              <tr>
                <th>Provider</th><th>Hardware</th><th>Pricing model</th><th>70B ref<br /><span className="th2">$/1M</span></th><th>Catalog</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {NEOCLOUDS.map((p) => (
                <tr key={p.name}>
                  <td className="mname">{p.name}</td>
                  <td>{p.chip}</td>
                  <td>{p.model}</td>
                  <td>{p.ref70 != null ? '$' + p.ref70.toFixed(2) : '—'}</td>
                  <td>{p.breadth}</td>
                  <td className="lft">{p.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Rule of thumb: per-token specialists (DeepInfra, Novita, Hyperbolic) are cheapest;
          latency specialists (Groq, Cerebras, SambaNova) trade a little price for speed;
          hyperscalers (Bedrock, Azure, Vertex) cost more but add compliance/enterprise. OpenRouter
          aggregates and shows the live spread — the best single source for per-model pricing.
        </p>
        <p className="muted small">
          <b>Note:</b> Different models use different tokenizers, so the same text becomes a
          different number of tokens per model — direct token-based price comparisons may not be
          entirely accurate.
        </p>
      </section>
    </>
  )
}
