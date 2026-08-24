import React from 'react'
import { REFERENCE_HARDWARE } from './throughput.js'

// THE DEMO TRAP.
//
// The most common route to a bad decision in this field is a working laptop demo.
// An engineer runs an open model on a MacBook, it answers in a second, and a
// leader reasonably concludes the hard part is done. It is not done. The demo
// measured the one property that does not scale.
//
// Latency for one user and throughput for many are different quantities, and a
// demo only ever shows the first. That is why this sits at the top of the chain:
// it is the moment the ten remaining blocks become invisible.

// Single-stream decode is bandwidth-bound: you must read every active weight to
// produce each token. So the ceiling is bandwidth / weight bytes, before any
// software exists. A 7B model at fp16 is 14GB.
const WEIGHT_GB = 14

export default function DemoMyth() {
  const max = Math.max(...REFERENCE_HARDWARE.map((h) => h.bandwidth))

  return (
    <section className="panel myth">
      <div className="myth-flag">Myth</div>
      <h2>“It runs fine on my MacBook.”</h2>

      <p className="myth-lede">
        It does. That is the problem. A laptop demo answers in a second and feels
        production-ready, so the ten blocks below it become invisible — and a leader
        is shown a result that measured the one property which does not scale.
      </p>

      <div className="myth-split">
        <div className="myth-card demo">
          <span className="myth-card-label">What the demo measured</span>
          <span className="myth-card-val">~39 <em>tok/s</em></span>
          <span className="myth-card-sub">for <b>one</b> person, batch size 1</span>
        </div>
        <div className="myth-card prod">
          <span className="myth-card-label">What a service is judged on</span>
          <span className="myth-card-val">~3,900 <em>tok/s</em></span>
          <span className="myth-card-sub">1× H100, batch 256, serving <b>hundreds</b></span>
        </div>
      </div>

      <p className="myth-point">
        <b>Roughly 100× apart</b> — and the demo felt faster, because you were the only
        user. Latency for one and throughput for many are different quantities.
        Every demo shows the first. Every bill is set by the second.
      </p>

      <h3>Why the gap is physics, not software</h3>
      <p className="muted">
        Producing a token means reading the model’s active weights out of memory. So
        before any code exists, memory bandwidth sets a ceiling — and this is the
        ceiling for a <b>single</b> stream, on a 7B model at fp16.
      </p>

      <div className="myth-bars">
        {REFERENCE_HARDWARE.map((h) => {
          const tps = Math.round(h.bandwidth / WEIGHT_GB)
          return (
            <div className={'myth-bar-row' + (h.id.startsWith('cpu') ? ' cpu' : '') + (h.id === 'h100' ? ' dc' : '')} key={h.id}>
              <span className="mb-name">{h.label}<em>{h.note}</em></span>
              <span className="mb-track">
                <span className="mb-fill" style={{ width: `${Math.max(2, (h.bandwidth / max) * 100)}%` }} />
              </span>
              <span className="mb-val">{h.bandwidth} <em>GB/s</em></span>
              <span className="mb-tps">~{tps} tok/s</span>
            </div>
          )
        })}
      </div>

      <div className="myth-cpu">
        <div className="myth-flag small">Myth</div>
        <h3>“We’ll just run it on CPU.”</h3>
        <p>
          A desktop CPU reads memory about <b>37× slower</b> than an H100 and a good
          server CPU about <b>8×</b> slower. Since decode is bandwidth-bound, that gap
          transfers almost directly to tokens per second — and CPUs have no equivalent
          of the batching machinery that makes a GPU economical, so the disadvantage
          widens rather than narrows once you have more than one user.
        </p>
        <p>
          CPU inference is a legitimate choice for batch jobs where latency does not
          matter and hardware is already paid for. It is not a cost-saving route to
          serving an interactive product, and treating it as one is how a pilot
          quietly becomes an outage.
        </p>
      </div>

      <div className="myth-close">
        <b>What to tell your leadership after the demo.</b> The demo proved the weights
        work. It did not touch the ten blocks that turn weights into a service —
        quantisation without quality loss, a KV cache that decides concurrency,
        continuous batching, the kernels, the parallelism tax, replicas, failover,
        utilisation, and an API surface. Those are below. None of them arrived in the
        download.
      </div>
    </section>
  )
}
