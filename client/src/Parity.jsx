import React, { useMemo } from 'react'

// SERVING PARITY.
//
// A team hosting a model themselves has no reference for what "running this
// properly" looks like — no status page to compare against, and no convention for
// what a serving operation should be able to say about itself.
//
// Providers do have one. The fields a neocloud publishes are a usable specification
// for what a local operation ought to measure, and the fields they DO NOT publish
// are the interesting half: throughput and latency are in the schema and populated
// for nobody. The two properties that decide whether a service is good are the two
// the market cannot see — and they are exactly the two a local operator can measure
// directly, because they own the box.
//
// Everything on the left is computed from the weekly snapshot rather than asserted,
// so the benchmark moves when the market does.

const PARITY = [
  { pub: 'Price per 1M in / out', local: 'Loaded cost per 1M, with idle separated',
    why: 'Your cost is fixed and theirs is variable. Unit cost only becomes comparable after dividing by tokens you actually served.' },
  { pub: 'Context length offered', local: 'Context you can serve at your concurrency',
    why: 'A memory result, not a model property. Providers disagree with each other about it on the same model.' },
  { pub: 'Uptime, 1d and 30m', local: 'Availability, measured the same way',
    why: 'Gives you a number to compare against instead of an impression.' },
  { pub: 'Serving quantisation', local: 'Your precision, and who validated quality',
    why: 'Disclosed by two thirds of endpoints. You chose yours, so you have no excuse for not stating it.' },
  { pub: 'Status', local: 'Whether you shed load, and on what policy',
    why: 'Admission control is a decision even when nobody makes it.' },
  { pub: null, local: 'Throughput at your real batch profile',
    why: 'In their schema, published by nobody. You can measure it. This is an advantage, not a burden.' },
  { pub: null, local: 'TTFT and inter-token latency, at p95',
    why: 'Same. A buyer comparing vendors cannot see this; you can.' },
  { pub: null, local: 'Goodput against a stated objective',
    why: 'Nobody publishes it. Most teams have no objective to miss. Stating one is most of the work.' }
]

export default function Parity({ orInfo }) {
  const stats = useMemo(() => {
    const d = orInfo?.disclosure
    if (!d?.endpoints) return null
    return {
      n: d.endpoints, models: d.models,
      quantPct: d.publishes.quantization,
      upPct: d.publishes.uptime,
      tputPct: d.publishes.throughput,
      median: d.uptime?.median, p10: d.uptime?.p10, below99Pct: d.uptime?.below99Pct,
      mixed: d.mixedPrecisionModels, ctxVaries: d.contextDisagreementModels
    }
  }, [orInfo])

  return (
    <div className="par">
      <p className="par-lede">
        A local deployment has no status page to compare itself against. A provider does —
        and what it publishes is a usable specification for what you should be measuring.
        The revealing part is what they <b>do not</b> publish.
      </p>

      {stats && (
        <>
          <div className="par-stats">
            <div><b>100%</b><span>publish price and context</span></div>
            <div><b>{stats.upPct}%</b><span>publish uptime</span></div>
            <div><b>{stats.quantPct}%</b><span>declare serving precision</span></div>
            <div className="par-zero"><b>{stats.tputPct}%</b><span>publish throughput or latency</span></div>
          </div>
          <p className="par-note">
            Across <b>{stats.n} provider-endpoints</b> on <b>{stats.models} models</b>. Median one-day
            uptime is <b>{stats.median?.toFixed(1)}%</b>, but <b>{stats.below99Pct}%</b> of endpoints sit below
            99% and the tenth percentile is <b>{stats.p10?.toFixed(1)}%</b> — on models a buyer would treat as
            interchangeable. <b>{stats.mixed} of {stats.models}</b> models are served at more than one precision
            and <b>{stats.ctxVaries} of {stats.models}</b> have providers disagreeing on context length. The model
            is not the product; the deployment is.
          </p>
        </>
      )}

      <table className="par-table">
        <thead>
          <tr><th>A provider publishes</th><th>You should measure</th><th>Why</th></tr>
        </thead>
        <tbody>
          {PARITY.map((r, i) => (
            <tr key={i} className={r.pub ? '' : 'gap'}>
              <td>{r.pub || <em>not published by anyone</em>}</td>
              <td><b>{r.local}</b></td>
              <td>{r.why}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="par-foot">
        <b>The asymmetry is the useful part.</b> A local operator can be more transparent than any
        provider, because the fields providers withhold are exactly the ones a local operator can
        measure directly. Throughput, tail latency and goodput are unavailable to a buyer comparing
        vendors and trivially available to a team running its own fleet — if anyone thinks to record
        them. If a serving operation cannot produce these on request, the right conclusion is not
        that they are unimportant.
      </p>
    </div>
  )
}
