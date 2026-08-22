import React from 'react'

// THE THESIS, STATED ON LANDING.
//
// Everything else in this tool is machinery. This is the argument the machinery
// exists to support, and it belongs above the machinery rather than buried in a
// guide nobody opens.
//
// It carries a live receipt — the currently selected model's real numbers — so a
// visitor meets a claim and its evidence in the same breath. A thesis with a
// number under it is an argument; without one it is a slogan.

const per1M = (v) => (v == null ? '—' : v >= 100 ? '$' + Math.round(v) : '$' + v.toFixed(v < 1 ? 3 : 2))

export default function Thesis({ model, d }) {
  const structural = d?.floor?.losesEvenAtPerfectUtilisation

  return (
    <section className="thesis">
      <h1 className="thesis-head">Open weights are not open inference.</h1>

      <div className="thesis-body">
        <p>
          When a lab publishes weights, the conversation moves from frontier to open
          as though the hard part had shipped. <b>What shipped is the weights.</b>{' '}
          Turning them into tokens at scale — continuous batching, quantisation that
          doesn’t cost quality, attention kernels, keeping thousands of GPUs hot
          across uncorrelated demand — is a separate discipline. Frontier labs and
          neoclouds do that work, and almost nobody prices it.
        </p>
        <p>
          This is a calculator for that gap: what an open model costs to{' '}
          <b>run yourself</b>, against what a <b>neocloud</b> charges for the
          identical weights.
        </p>
      </div>

      {d && (
        <div className="thesis-receipt">
          <div className="thesis-receipt-label">Right now, for {model.label}</div>
          <div className="thesis-receipt-row">
            <span className="tr-item">
              <b>Free</b>
              <em>to download the weights</em>
            </span>
            <span className="tr-arrow" aria-hidden="true">→</span>
            <span className="tr-item">
              <b>{per1M(d.neocloudPer1M)}</b>
              <em>per 1M tokens from a neocloud</em>
            </span>
            <span className="tr-arrow" aria-hidden="true">→</span>
            <span className="tr-item strong">
              <b>{per1M(d.selfHostPer1M)}</b>
              <em>per 1M tokens to run it yourself</em>
            </span>
          </div>
          <p className="thesis-receipt-note">
            {structural ? (
              <>
                Even with <b>nothing idle and nobody paid</b>, your own GPUs cost{' '}
                <b>{per1M(d.floor.per1M)}/1M</b> — still{' '}
                <b>{d.floor.multipleOfNeocloud.toFixed(1)}×</b> the neocloud price. That
                residue is not waste you can manage away. It is the serving work the
                weights don’t include.
              </>
            ) : (
              <>
                With <b>nothing idle and nobody paid</b>, your own GPUs reach{' '}
                <b>{per1M(d.floor.per1M)}/1M</b> — {d.floor.multipleOfNeocloud < 1
                  ? <>below the neocloud price. For a model this sparse the serving gap is
                    closeable; what you lose it on is utilisation and staffing.</>
                  : <>close to the neocloud price. The remaining gap is utilisation and
                    staffing, not physics.</>}
              </>
            )}
          </p>
        </div>
      )}
    </section>
  )
}
