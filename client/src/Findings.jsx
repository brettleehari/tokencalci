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

export default function Findings({ history, model, onNavigate }) {
  const gpu = GPUS.find((g) => g.id === 'h100')
  const tpt = model ? gpusNeeded(model, gpu, 'fp16') : null

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
      body: 'Eight GPUs serve roughly what one does — splitting a model makes it fit, not fast. So the GPUs a single replica needs, just to hold the weights, tracks your cost multiple almost directly. We named it the Tensor Parallel Tax.',
      cta: 'See the chain',
      go: 'chain'
    },
    {
      id: 'feeds',
      figure: '22%',
      unit: 'of models',
      claim: 'Two price feeds disagree',
      body: 'Cross-checking LiteLLM against OpenRouter across 37 comparable models, 8 differ by more than 1.5× and the worst by 5.7×. Any single-source price table is reporting one sample as if it were the market — and most calculators in this space are single-source.',
      cta: 'Where numbers come from',
      go: 'paper'
    }
  ]

  return (
    <section className="findings">
      <div className="findings-head">
        <h2>What we measured</h2>
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
