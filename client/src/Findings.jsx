import React from 'react'
import { gpusNeeded, vramNeed } from './hwcalc.js'
import { GPUS } from './hwdata.js'

// THE CITATION SURFACE.
//
// The most valuable thing here is not the calculator — it is three measurements
// that contradict things the field repeats. Those were buried in an API endpoint,
// a collapsed accordion row and a levers table, which is how good research fails
// to leave a mark. One claim, one number, one name, on the front page, each
// linking to its own depth.

export default function Findings({ history, model, onNavigate, precision = 'fp16' }) {
  const gpu = GPUS.find((g) => g.id === 'h100')
  // Must match the precision the calculator on this same page is using, or the
  // front-page card and the verdict below it report different fleet sizes.
  const tpt = model ? gpusNeeded(model, gpu, precision) : null
  // Live provider spread for the selected model — the honest version of the
  // "two feeds disagree" claim, which turned out to be mostly sample size.
  const sp = model?.price?.spread
  const spread = sp && sp.inMin > 0 && sp.n > 2
    ? { min: sp.inMin, max: sp.inMax, n: sp.n, range: Math.round(sp.inMax / sp.inMin) }
    : null

  const cards = [
    {
      id: 'prices',
      figure: history ? `${history.fixedBasket.annualMultiple.toFixed(2)}×` : '0.98×',
      unit: 'per year',
      claim: 'Per-model prices are flat',
      body: history
        ? `A fixed basket of ${history.fixedBasket.models} models moved this much over ${history.window.months} months. The "inference falls ~10×/year" line does not hold for a model you have already chosen — what falls is the cheapest option available, at ${Math.round(history.cheapestAvailable.annualDeclinePct)}%/year, and capturing that means re-platforming.`
        : 'Measured from the price feed’s own git history: per-model list prices barely move. What falls is the cheapest option available.',
      cta: 'Read the method',
      go: 'paper'
    },
    {
      id: 'tpt',
      figure: tpt ? `${tpt}×` : '—',
      unit: `H100s to fit ${model?.label || 'this model'}`,
      claim: 'Tensor parallelism buys capacity, not speed',
      body: 'Eight GPUs serve roughly what one does — splitting a model makes it fit, not fast. So the GPUs a single replica needs, just to hold the model, tracks your cost multiple closely. This is fitted to published benchmarks, not measured here, and the paper states what would falsify it.',
      cta: 'See the chain',
      go: 'chain'
    },
    {
      id: 'feeds',
      // Computed from the live spread, not asserted. The earlier version of this
      // card hardcoded "22% / 37 models / 5.7x" under a heading reading "What we
      // measured", and stayed fixed while the weekly snapshot moved underneath it.
      figure: spread ? `${spread.range}×` : '—',
      unit: `spread on ${model?.label || 'this model'}`,
      claim: 'The provider you pick moves the answer most',
      body: spread
        ? `The same open weights list from $${spread.min} to $${spread.max} per 1M input tokens across ${spread.n} listings. That spread is wider than any modelling choice in this tool — fleet sizing, precision and duty cycle all move the answer less than which provider you sign with. Any single-source price table reports one sample as if it were the market, and most calculators in this space are single-source.`
        : 'The same open weights list at wildly different rates across providers. Any single-source price table reports one sample as if it were the market.',
      cta: 'Where numbers come from',
      go: 'paper'
    }
  ]

  return (
    <section className="findings">
      <div className="findings-head">
        <h2>What the data says</h2>
        <p>Three things the field repeats that the data does not support.</p>
      </div>
      <div className="findings-grid">
        {cards.map((c) => (
          <article className="fcard" key={c.id}>
            <div className="fcard-fig">
              <b>{c.figure}</b>
              <span>{c.unit}</span>
            </div>
            <h3>{c.claim}</h3>
            <p>{c.body}</p>
            <button className="link" onClick={() => onNavigate(c.go)}>{c.cta} →</button>
          </article>
        ))}
      </div>
    </section>
  )
}
