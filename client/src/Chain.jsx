import React, { useState, useMemo } from 'react'
import { pricedModels, GPUS, servingPrecisionFor } from './hwdata.js'
import { vramNeed, gpusNeeded } from './hwcalc.js'
import DemoMyth from './DemoMyth.jsx'

// THE SERVING CHAIN — the explainer, made interactive.
//
// Ten blocks stand between a downloadable checkpoint and a token you can bill
// for. Exactly one of them is open. The point of making this clickable rather
// than a diagram is that the detail is the argument: anyone can nod at "serving
// is hard", far fewer can name what continuous batching does or why a KV cache
// decides your concurrency. Opening a block should teach the specific thing.

const BLOCKS = [
  {
    id: 'weights',
    name: 'Weights',
    tag: 'open',
    line: 'A file you can download.',
    what: 'A few hundred gigabytes of floating-point numbers, published under a licence that lets you use them. This is the part that gets announced, celebrated, and argued about on release day.',
    why: 'It genuinely is free, genuinely permissive, and genuinely the smallest part of this list. Nothing below it comes in the download.',
    evidence: 'Free',
    evidenceNote: 'and the only free block here',
    inherit: 'Identical either way — a provider serves the same checkpoint you would download.',
    own: 'Nothing to do. This block is solved.'
  },
  {
    id: 'precision',
    name: 'Precision',
    line: 'Quantise, calibrate, convert.',
    what: 'Convert fp16 weights to fp8 or fp4 so they read faster and take less memory, calibrate on real data so the smaller numbers still behave, then convert into whatever format your serving engine wants.',
    why: 'The speedup is a flag. Not degrading the model is the skill — and precision does not only buy throughput, it moves you across the memory boundary that decides how many GPUs you need at all.',
    evidence: 'fp8 2.0× · fp4 3.0×',
    evidenceNote: 'measured on identical hardware',
    inherit: 'Providers pick and validate a precision per model. It is why the same model has a five-fold price spread across providers.',
    own: 'You choose, you calibrate, you own the quality regression when it goes wrong.'
  },
  {
    id: 'kv',
    name: 'KV cache',
    tag: 'hardest',
    line: 'The memory that decides your concurrency.',
    what: 'Every token every active user has sent is still resident in GPU memory, and it grows with every new token. Paged allocation, block reuse across shared prefixes, eviction when you run out, offload to host memory when you really run out.',
    why: 'This is the block I would start with if I wanted to scare someone honestly. Naive allocation wastes most of it — real requests use only 20–30% of what gets reserved, so 70–80% of your most expensive memory sits idle. Fixing that is what PagedAttention did, and it bought 2–4× throughput at the same latency.',
    evidence: '70–80% wasted',
    evidenceNote: 'under naive allocation (vLLM paper)',
    inherit: 'Someone else already solved this, and keeps solving it as context windows grow.',
    own: 'Your concurrency ceiling — and therefore your cost per token — is set here.'
  },
  {
    id: 'batching',
    name: 'Batching & scheduling',
    line: 'Where the money actually hides.',
    what: 'Continuous batching so a finished sequence frees its slot immediately instead of waiting for the slowest in its group. Chunked prefill so one long prompt does not stall every decode behind it. Admission control for when you are simply full.',
    why: 'Your cost per token is not a property of your hardware. It is a property of how many people are talking to you at once. Same GPUs, same model, sweeping batch size from 1 to 256 moved cost per million tokens from about $258 to $2.30.',
    evidence: '~100× swing',
    evidenceNote: 'on identical hardware, batch 1 → 256',
    inherit: 'A provider batches your traffic together with everyone else’s, so it is always full.',
    own: 'You batch against your own traffic only. Thin traffic means small batches means high unit cost.'
  },
  {
    id: 'kernels',
    name: 'Kernels',
    line: 'Fused attention, CUDA graphs, speculative decode.',
    what: 'Hand-tuned attention that never materialises the full matrix, fused matrix multiplies, CUDA graphs to remove per-step launch overhead, speculative decoding that spends cheap compute to buy back expensive latency.',
    why: 'This is where framework choice alone moves throughput by 2×, and where the gap between a competent deployment and an expert one is widest. It is also the layer moving fastest — vLLM delivered 2.7× throughput over its own previous minor version.',
    evidence: '2.7× in one release',
    evidenceNote: 'vLLM v0.6.0 over v0.5.3',
    inherit: 'Every upstream improvement reaches you as a lower price, with no migration.',
    own: 'You upgrade, re-benchmark and re-validate — or you quietly fall behind.'
  },
  {
    id: 'parallel',
    name: 'Parallelism',
    tag: 'counterintuitive',
    line: 'Splitting a model costs more than you think.',
    what: 'Tensor parallelism to split a model across GPUs, pipeline parallelism to split it across stages, expert parallelism for mixture-of-experts — plus the collective communication that stitches them back together on every layer.',
    why: 'The most misunderstood block in the chain. Adding GPUs does not add throughput. Measured: Qwen3 30B-A3B on one H100 serves 3,900 tok/s; Llama 70B on eight serves 2,800. You split a model to make it FIT, not to make it FAST. To serve more tokens you deploy another full replica and pay for it again.',
    evidence: '8 GPUs ≈ 1 GPU',
    evidenceNote: 'capacity, not speed',
    inherit: 'The provider eats the parallelism tax across all their customers at once.',
    own: 'You pay it alone. A model needing four GPUs to fit costs roughly 4× for the same tokens.',
    live: 'tpt'
  },
  {
    id: 'fleet',
    name: 'Fleet',
    line: 'Replicas, autoscaling, routing.',
    what: 'Because throughput scales by replicas rather than width: warm pools so a cold start does not hit a user, autoscaling against a demand curve, load balancing, model swapping, capacity planning.',
    why: 'Every replica is a full copy of the hardware bill. Provisioning for peak means paying for peak 24×7 while running at your actual duty cycle — and idle capacity is routinely the single largest term in the gap.',
    evidence: 'Each replica = full cost',
    evidenceNote: 'throughput scales by copies',
    inherit: 'Elastic. You pay per token and idle is free.',
    own: 'Fixed. You size for the busiest hour and pay for the quiet ones.'
  },
  {
    id: 'reliability',
    name: 'Reliability',
    line: 'Health, drain, failover.',
    what: 'Health checks that catch a wedged GPU, graceful drain, rolling upgrades that do not sever in-flight token streams, failover when a node dies halfway through a generation.',
    why: 'Streaming makes this harder than ordinary web serving — you cannot simply retry a request that has already delivered 200 tokens to a user. Observed uptime across providers on the same model ranges from about 45% to 100%, which tells you how much operational competence varies even among people doing this professionally.',
    evidence: '45%–100%',
    evidenceNote: 'observed provider uptime, same model',
    inherit: 'Someone else carries the pager.',
    own: 'You carry the pager.'
  },
  {
    id: 'economics',
    name: 'Economics',
    tag: 'uncopyable',
    line: 'Keeping the fleet hot.',
    what: 'Utilisation. A provider pools demand across thousands of unrelated customers whose peaks do not coincide, so their GPUs stay near full. You pool across one customer — yourself.',
    why: 'This is the only block on the list you cannot buy, build or hire your way to. It is a structural property of having many tenants, and no amount of engineering skill substitutes for it. It is also, in most of our runs, the largest single cause of the cost gap.',
    evidence: 'Structural',
    evidenceNote: 'not an engineering problem',
    inherit: 'Their utilisation, which is far higher than yours will be.',
    own: 'Your duty cycle. Idle time is yours and it is expensive.'
  },
  {
    id: 'surface',
    name: 'Surface',
    line: 'The API nobody remembers to budget.',
    what: 'An OpenAI-compatible endpoint, token streaming, structured output, tool calling, rate limits, quotas, usage metering, billing, keys and rotation.',
    why: 'Invisible until you have to build it, and then it is a quarter of work that produces no model quality whatsoever. Every internal consumer expects it to behave exactly like the API they already use.',
    evidence: 'A quarter of work',
    evidenceNote: 'that adds no model quality',
    inherit: 'Included, and compatible with what your code already calls.',
    own: 'You build and maintain it, forever.'
  }
]

export default function Chain({ feed, servingPrecision }) {
  const [open, setOpen] = useState('weights')
  const models = useMemo(() => pricedModels(feed), [feed])

  return (
    <>
      <DemoMyth />

      <section className="panel chain-intro">
        <h2>Weights are one block in a chain of ten.</h2>
        <p className="lead">
          Source code was never the product — compilers, CI, deploys, observability and
          on-call were. We gave that discipline a name and learned to budget for it. Model
          serving is the same shape at the same stage, and still mostly nameless. Open
          weights hand you block one.
        </p>
        <p className="muted">
          Click any block to open it. The detail is the argument: everyone nods at
          “serving is hard”, far fewer can say what continuous batching does, or why a
          cache decides how many people you can serve at once.
        </p>
        <div className="chain-count">
          <span className="cc-num">1</span>
          <span className="cc-of">of 10 blocks is open</span>
          <span className="cc-bar" aria-hidden="true">
            {BLOCKS.map((b) => <i key={b.id} className={b.id === 'weights' ? 'on' : ''} />)}
          </span>
        </div>
      </section>

      <div className="chain">
        {BLOCKS.map((b, i) => {
          const isOpen = open === b.id
          return (
            <div className={'cblock' + (isOpen ? ' open' : '') + (b.tag ? ' t-' + b.tag : '')} key={b.id}>
              <button
                className="cblock-head"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : b.id)}
              >
                <span className="cb-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="cb-main">
                  <span className="cb-name">
                    {b.name}
                    {b.tag && <span className={'cb-tag ' + b.tag}>{b.tag}</span>}
                  </span>
                  <span className="cb-line">{b.line}</span>
                </span>
                <span className="cb-ev">
                  <b>{b.evidence}</b>
                  <em>{b.evidenceNote}</em>
                </span>
                <span className="cb-chev" aria-hidden="true">{isOpen ? '−' : '+'}</span>
              </button>

              {isOpen && (
                <div className="cblock-body">
                  <div className="cb-col">
                    <h4>What the work is</h4>
                    <p>{b.what}</p>
                  </div>
                  <div className="cb-col">
                    <h4>Why it decides the cost</h4>
                    <p>{b.why}</p>
                  </div>
                  <div className="cb-split">
                    <div className="cb-side inherit">
                      <h4>Call an API and you inherit</h4>
                      <p>{b.inherit}</p>
                    </div>
                    <div className="cb-side own">
                      <h4>Self-host and you own</h4>
                      <p>{b.own}</p>
                    </div>
                  </div>
                  {b.live === 'tpt' && <TptTable models={models} />}
                </div>
              )}
            </div>
          )
        })}

        <div className="cblock terminal">
          <span className="cb-n">→</span>
          <span className="cb-main">
            <span className="cb-name">Tokens</span>
            <span className="cb-line">at a price per million — which is what the calculator prices.</span>
          </span>
        </div>
      </div>
    </>
  )
}

// The parallelism block earns a live table, because this is the one number a
// reader can act on immediately: how many GPUs one replica needs just to fit.
function TptTable({ models }) {
  const gpu = GPUS.find((g) => g.id === 'h100')
  const picks = ['qwen3-30b-a3b', 'gemma4-31b', 'llama-70b', 'gpt-oss-120b', 'deepseek-v3']
    .map((id) => models.find((m) => m.id === id))
    .filter(Boolean)

  return (
    <div className="cb-live">
      <h4>Tensor Parallel Tax — GPUs one replica needs, just to fit</h4>
      <div className="tpt">
        {picks.map((m) => {
          // Headline the precision the model is actually SERVED at; keep fp16
          // alongside as the unquantised reference rather than as the claim.
          const served = servingPrecisionFor(m, servingPrecision?.[m.id])
          const nGpu = gpusNeeded(m, gpu, served.id)
          const fp16 = gpusNeeded(m, gpu, 'fp16')
          return (
            <div className="tpt-row" key={m.id}>
              <span className="tpt-name">{m.label}</span>
              <span className="tpt-vram">{vramNeed(m, served.id)}GB at {served.id}</span>
              <span className={'tpt-val' + (nGpu === 1 ? ' good' : nGpu >= 8 ? ' bad' : '')}>
                {nGpu}× H100
              </span>
              <span className="tpt-alt">{fp16 > nGpu ? `${fp16}× at fp16 (reference)` : 'same at fp16'}</span>
            </div>
          )
        })}
      </div>
      <p className="cb-live-note">
        An H100 holds 80GB. Gemma 4 31B needs 81 at fp16 — one gigabyte over, which
        doubles the hardware for identical tokens. At fp8 it fits on one card. That is
        why precision is not a config flag.
      </p>
    </div>
  )
}
