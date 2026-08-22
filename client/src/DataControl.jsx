import React from 'react'

// THE WALLED-GARDEN PREMIUM.
//
// The self-hosting conversation almost always jumps straight from "standard API"
// to "our own hardware", as though those were the only two positions. There are
// several rungs in between, most of them cheap, and skipping them is how teams
// end up paying a 10x premium for a property a contract already gave them.
//
// The distinction that actually matters is not privacy versus no privacy. Every
// rung below the last one is a CONTRACTUAL guarantee — someone promises not to
// retain your data, and you have legal recourse if they break it. The last rung
// is a PHYSICAL guarantee — the data cannot leave because there is nowhere for
// it to go. The premium is the price of upgrading from a promise to physics.
//
// Sometimes that is exactly what a regulator demands. Often it is an unexamined
// default. This panel prices it so the choice is deliberate either way.

const per1M = (v) => (v == null ? '—' : v >= 100 ? '$' + Math.round(v) : '$' + v.toFixed(v < 1 ? 3 : 2))

// Data-control options, cheapest first. `cost` is expressed relative to the
// standard per-token price, because that is the number people already know.
const RUNGS = [
  {
    id: 'standard',
    rung: 'Standard API',
    gives: 'Whatever the provider’s default policy allows. Prompts may be logged, retained for abuse monitoring, or — depending on the provider — used to improve models.',
    cost: 'Baseline',
    costNote: 'the price you already see',
    kind: 'contract'
  },
  {
    id: 'zdr',
    rung: 'Zero Data Retention',
    gives: 'Contractual guarantee that prompts and completions are not stored, not logged beyond metadata, and never trained on. Widely available — Groq made it self-serve for every customer, and DeepInfra, Vertex and Bedrock offer it.',
    cost: 'Usually no premium',
    costNote: 'same per-token rate; an agreement, not a product tier',
    kind: 'contract',
    highlight: true
  },
  {
    id: 'region',
    rung: 'In-region provider',
    gives: 'Inference served from a jurisdiction your compliance obligation accepts. Satisfies data-residency requirements without changing where the compute lives.',
    cost: 'Provider spread',
    costNote: 'you pick from a smaller set, so you may lose the cheapest listing',
    kind: 'contract'
  },
  {
    id: 'dedicated',
    rung: 'Dedicated endpoint',
    gives: 'Single-tenant capacity. No other customer’s traffic shares your GPUs, which removes the multi-tenancy objection without removing the provider.',
    cost: 'Premium, but bounded',
    costNote: 'priced per GPU-hour rather than per token — you now pay for idle',
    kind: 'contract'
  },
  {
    id: 'own',
    rung: 'Your own hardware',
    gives: 'A physical guarantee. The data cannot leave because there is nowhere for it to go, and you are not relying on anyone honouring an agreement.',
    cost: null, // filled live
    costNote: 'the walled-garden premium',
    kind: 'physics'
  }
]

export default function DataControl({ premium, sovPer1M, neoPer1M, jurisdictionCount }) {
  const mult = premium && isFinite(premium) ? premium : null

  return (
    <section className="panel dcx">
      <h3>What you’re actually buying at {mult ? `${mult.toFixed(0)}×` : 'a premium'}</h3>

      <p className="dcx-lede">
        Self-hosting is usually justified on data control. But data control is not one
        thing you either have or don’t — it’s a ladder, and most of it is cheap. The
        conversation tends to jump from the first rung to the last, skipping three
        options that would have satisfied the same requirement.
      </p>

      <div className="dcx-ladder">
        {RUNGS.map((r) => {
          const isOwn = r.id === 'own'
          return (
            <div className={'dcx-rung ' + r.kind + (r.highlight ? ' hl' : '') + (isOwn ? ' own' : '')} key={r.id}>
              <div className="dcx-rung-head">
                <span className="dcx-rung-name">{r.rung}</span>
                <span className={'dcx-kind ' + r.kind}>
                  {r.kind === 'physics' ? 'physical guarantee' : 'contractual guarantee'}
                </span>
              </div>
              <p className="dcx-gives">
                {isOwn && jurisdictionCount
                  ? r.gives
                  : r.gives}
              </p>
              <div className="dcx-cost">
                {isOwn
                  ? <><b>{mult ? `${mult.toFixed(0)}× the API price` : 'Large premium'}</b>
                      <span>{per1M(sovPer1M)}/1M against {per1M(neoPer1M)}/1M — {r.costNote}</span></>
                  : <><b>{r.cost}</b><span>{r.costNote}</span></>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="dcx-crux">
        <b>The crux: ZDR is a contract. A walled garden is physics.</b> Every rung but
        the last gives you a promise backed by legal recourse. The last one gives you a
        property that holds whether or not anyone keeps their word. The premium —
        {mult ? ` roughly ${mult.toFixed(0)}× here ` : ' shown above '}— is the price of
        that upgrade, and it is almost never named in the discussion. It should be the
        first number on the table, not a footnote discovered after the decision.
      </div>

      <div className="dcx-when">
        <div className="dcx-when-col">
          <h4>When the premium is the right call</h4>
          <ul>
            <li>A regulator requires physical custody, not a contractual assurance.</li>
            <li>You operate air-gapped, or in a jurisdiction with no acceptable provider.</li>
            <li>Your own contracts forbid the data crossing an organisational boundary at all — a promise from a third party doesn’t discharge that.</li>
            <li>Counterparty risk is unacceptable to you at any price, which is a legitimate position as long as it’s priced.</li>
          </ul>
        </div>
        <div className="dcx-when-col">
          <h4>When it probably isn’t</h4>
          <ul>
            <li>“Our data can’t be used for training” — ZDR says exactly that, at no premium.</li>
            <li>“It has to stay in our region” — a provider headquartered there may already satisfy it{jurisdictionCount ? `; ${jurisdictionCount} publish a stated jurisdiction` : ''}.</li>
            <li>“We don’t want to share GPUs” — that’s a dedicated endpoint, at a fraction of this cost.</li>
            <li>Nobody has written down which requirement is actually binding. That’s the most common case, and the most expensive.</li>
          </ul>
        </div>
      </div>

      <p className="dcx-caveat">
        ZDR availability and terms are <b>not machine-readable</b> — no feed publishes
        them — so this ladder is an editorial summary, dated and reviewed rather than
        fetched. Terms differ materially between providers and between self-serve and
        negotiated agreements. Read the actual policy for the provider you would use;
        the Sources tab links each one we have.
      </p>
    </section>
  )
}
