import React, { useMemo } from 'react'
import { SOURCE_LAYERS, KNOWN_GAPS, CREDITS, CONFIDENCE_META } from './sources.js'
import { pricedModels, QUALITY_BASIS, CAPEX_AS_OF } from './hwdata.js'

// Live status per layer, so the dates on this page are the dates actually in use
// rather than a hand-written claim that rots. If a feed is down, this page says so.
function liveStatus({ feed, gpuFeed, history, coverage }) {
  return {
    'model-prices': feed
      ? { ok: !!feed.live, text: `${feed.live ? 'Live' : 'Snapshot'} · ${feed.count} models · as of ${feed.asOf}` }
      : { ok: false, text: 'Feed not loaded' },
    'provider-spread': coverage
      ? { ok: true, text: `${coverage.live} of ${coverage.total} catalog models priced from live listings (${Math.round((coverage.live / coverage.total) * 100)}%)` }
      : { ok: false, text: '—' },
    'gpu-rental': gpuFeed
      ? { ok: !!gpuFeed.live, text: gpuFeed.live ? `Live · ${gpuFeed.covered} GPUs · as of ${gpuFeed.asOf}` : 'Marketplace unreachable — using dated constants' }
      : { ok: false, text: 'Not loaded' },
    'price-history': history
      ? { ok: true, text: `${history.window.points} monthly points · ${history.window.from} → ${history.window.to}` }
      : { ok: false, text: 'Not generated — run server/backfill-history.js' },
    'gpu-capex': { ok: null, text: `Dated constant · as of ${CAPEX_AS_OF}` },
    'model-specs': { ok: null, text: 'Hand-maintained · refreshed against the live feed' },
    throughput: { ok: false, text: 'Heuristic · not measured' },
    capability: { ok: false, text: `Editorial · as of ${QUALITY_BASIS.asOf} · not a benchmark` },
    'operating-costs': { ok: null, text: 'Editable defaults' },
    routing: { ok: null, text: 'Directional defaults from published research' },
    discounts: feed
      ? { ok: true, text: `Cache rates from the live feed · batch modelled at a flat 50%` }
      : { ok: false, text: 'Feed not loaded' }
  }
}

export default function Sources({ feed, gpuFeed, history }) {
  const coverage = useMemo(() => {
    if (!feed) return null
    const all = pricedModels(feed)
    const live = all.filter((m) => m.livePrice).length
    return { total: all.length, live, curated: all.length - live }
  }, [feed])

  const status = liveStatus({ feed, gpuFeed, history, coverage })
  const counts = SOURCE_LAYERS.reduce((a, l) => ({ ...a, [l.confidence]: (a[l.confidence] || 0) + 1 }), {})

  return (
    <>
      <section className="panel">
        <h2 className="q">Where every number comes from</h2>
        <p className="muted">
          This tool doesn’t generate data. It aggregates public feeds and published
          figures, and its contribution is the <b>dimensions</b> — turning scattered
          per-token prices, GPU rental rates and hardware specs into one comparable
          question you can actually answer. That’s a presentation wedge, not a data
          moat, and claiming otherwise would fail the standard this page exists to
          hold everyone else to.
        </p>
        <p className="muted">
          So: every layer below is listed with its source, how it’s obtained, how
          often it refreshes, and what it can’t tell you.{' '}
          <b>{(counts.measured || 0) + (counts.derived || 0)} of {SOURCE_LAYERS.length}</b> come
          from a dated feed. <b>{counts.estimate || 0}</b> are our own estimates, and
          they’re marked as such everywhere they appear — in this tool and in the API
          responses that other agents consume.
        </p>
        <div className="confkey">
          {Object.entries(CONFIDENCE_META).map(([id, m]) => (
            <div key={id} className={`confchip ${id}`}>
              <b>{m.label}</b>
              <span>{counts[id] || 0} {counts[id] === 1 ? 'layer' : 'layers'}</span>
              <em>{m.note}</em>
            </div>
          ))}
        </div>
      </section>

      {SOURCE_LAYERS.map((l) => {
        const st = status[l.id] || { ok: null, text: '' }
        return (
          <section className="panel srclayer" key={l.id}>
            <div className="srchead">
              <div>
                <h3>{l.layer}</h3>
                <p className="muted small">{l.what}</p>
              </div>
              <span className={`confbadge ${l.confidence}`}>{CONFIDENCE_META[l.confidence].label}</span>
            </div>

            <div className={`srcstatus ${st.ok === true ? 'ok' : st.ok === false ? 'warn' : ''}`}>
              {st.text}
            </div>

            <dl className="srcdl">
              <dt>Source</dt>
              <dd><a href={l.url} target="_blank" rel="noopener noreferrer">{l.source}</a></dd>
              <dt>How</dt>
              <dd>{l.how}</dd>
              <dt>Refresh</dt>
              <dd>{l.refresh}</dd>
              <dt>Used for</dt>
              <dd>{l.usedFor.join(' · ')}</dd>
              <dt>Limitation</dt>
              <dd className="lim">{l.limitation}</dd>
            </dl>
          </section>
        )
      })}

      <section className="panel">
        <h3>What we don’t have</h3>
        <p className="muted">
          A transparency page that only lists strengths is marketing. These are the
          gaps we know about and haven’t closed.
        </p>
        <ul className="src">
          {KNOWN_GAPS.map((g) => (
            <li key={g.gap}><b>{g.gap}.</b> {g.detail}</li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h3>Standing on other people’s work</h3>
        <p className="muted">
          None of this exists without the projects below. If you find this useful,
          they are the ones doing the hard part.
        </p>
        <ul className="src">
          {CREDITS.map((c) => (
            <li key={c.name}>
              <a href={c.url} target="_blank" rel="noopener noreferrer"><b>{c.name}</b></a> — {c.for}
            </li>
          ))}
        </ul>
        <p className="muted small">
          The same registry that renders this page is served at <code>/api/sources</code>,
          so an agent consuming this tool gets identical provenance. The two cannot
          drift apart because they read the same file.
        </p>
      </section>
    </>
  )
}
