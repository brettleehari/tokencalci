import React, { useMemo, useState } from 'react'
import { MODELS, NEOCLOUDS } from './hwdata.js'

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

export default function Catalog() {
  const [modality, setModality] = useState('all')
  const [commercialOnly, setCommercialOnly] = useState(false)
  const [sort, setSort] = useState('rank')

  const rows = useMemo(() => {
    let r = MODELS.map((m, i) => ({ ...m, rank: i + 1 }))
    if (modality !== 'all') r = r.filter((m) => m.modality === modality)
    if (commercialOnly) r = r.filter((m) => m.commercial)
    const by = {
      rank: (a, b) => a.rank - b.rank,
      quality: (a, b) => b.quality - a.quality || a.rank - b.rank,
      size: (a, b) => a.params - b.params,
      price: (a, b) => a.apiPer1M - b.apiPer1M,
      ctx: (a, b) => b.ctx - a.ctx,
      cutoff: (a, b) => cutoffNum(b.cutoff) - cutoffNum(a.cutoff)
    }
    return [...r].sort(by[sort])
  }, [modality, commercialOnly, sort])

  return (
    <>
      <section className="panel">
        <h2>Top 50 open models to self-host — and where to rent them</h2>
        <p className="muted">
          A curated catalog of open-weight models across sizes and use-cases, plus
          the neocloud providers that serve them as an API. Use it to pick a model,
          check its self-host legality (license), and see the pay-per-token baseline.
        </p>
      </section>

      <section className="panel formula">
        <h3>How the top 50 was chosen</h3>
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
          <li><b>License / commercial use</b> — some weights are <b>non-commercial</b> (Command R+, Mistral Large, Codestral, Aya). You legally can't self-host those for a product without a paid license.</li>
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
                <th>License</th><th>Modality</th><th>Tier</th><th>$/1M<br /><span className="th2">neocloud</span></th>
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
                  <td>${m.apiPer1M.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">✓ = commercial self-host OK · ⚠NC = non-commercial license (needs a paid license for products). <b>Knowledge cutoff is approximate</b> — many labs don't publish exact dates; verify the model card. Directional; verify a model's current license before deploying.</p>
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
      </section>
    </>
  )
}
