# Methodology

How every number in tokencalci is produced, where it comes from, and how far it can
be trusted. This is generated from the running model by `npm run docs:methodology`,
so it cannot drift from the code it describes.

Companion to the paper, [*From Free Weights to Reliable Tokens*](https://doi.org/10.5281/zenodo.24516238),
whose appendices A and B cover the same ground in argument form.

---

## 1. The confidence scale

Every input carries one of four grades. The grade is not decoration: it is the
difference between a figure you can cite and one you can only consider.

| Grade | Meaning | Count |
|---|---|---|
| `measured` | Retrieved from a dated feed; the exact record can be cited | 4 |
| `derived` | Computed from a dated feed; the method is published here | 3 |
| `published` | A figure from a named third party, not machine-retrieved | 6 |
| `estimate` | Author's judgement; the weakest class, flagged wherever it appears | 1 |

**The rule enforced throughout.** Layers marked `estimate` are our own judgement and are flagged wherever they appear. Do not present them as measurements.

**1 of 14 layers is an `estimate`.** Anything resting on it should be
read as directional. The live machine-readable form of this table is at
[`GET /api/sources`](https://tokencalci.onrender.com/api/sources).

---

## 2. The fourteen data layers

| # | Layer | Source | Grade | Refresh | Principal limitation |
|---|---|---|---|---|---|
| 1 | Model API prices | LiteLLM — model_prices_and_context_window.json | `measured` | every 6 hours | Published list prices only — excludes negotiated enterprise rates, committed-use discounts and free tiers. |
| 2 | Provider price spread | Derived from the LiteLLM feed | `derived` | every 6 hours | Hyperscaler managed offerings are excluded from the open-model sample — they publish one price per region, which would swamp the median. |
| 3 | GPU rental prices | Vast.ai public marketplace API | `measured` | every 6 hours | Community/spot capacity — the median sits BELOW contracted neocloud and hyperscaler pricing for the same card. Use the upper end of the spread if you are buying enterprise capacity. |
| 4 | Price history & decline rate | Git history of the LiteLLM price file | `derived` | on demand (backfill script) | Some matchers span model generations, so a few individual series compare successive releases rather than one frozen model. The fixed basket is the reliable signal, not any single row. |
| 5 | Serving precision, uptime & jurisdiction | OpenRouter public API | `measured` | weekly (automated) | Throughput and latency exist in their schema but are null without an API key, so this does NOT close the measured-throughput gap. Uptime is as observed for traffic routed through their gateway, not a provider SLA. |
| 6 | Second-source price agreement | LiteLLM feed vs OpenRouter, compared by us | `derived` | weekly (bounded by the OpenRouter snapshot) | The two feeds sample different provider sets, so some disagreement is expected. A large gap means the price is uncertain — not that one feed is wrong. |
| 7 | GPU purchase price & node cost | Vendor and reseller street pricing | `published` | manual, dated | Purchase prices vary hugely by volume, region and vendor relationship. Node cost is an allocation, not a quote. |
| 8 | Model specifications | Model cards, provider documentation and release announcements | `published` | manual, per catalog review | A hand-maintained table goes stale between reviews. Knowledge cutoffs in particular are often unpublished and are best-effort. |
| 9 | Serving throughput (tokens/sec) | Published vLLM / SGLang serving benchmarks | `published` | manual, dated | These are benchmarks someone else ran, not measurements we made — and throughput swings ~100x across batch sizes, so they assume a throughput-optimised configuration at high concurrency. Very large MoE models needing many GPUs purely to hold expert weights (DeepSeek V3) run far slower than this predicts; that case is flagged rather than fitted, on a single data point. |
| 10 | Capability tier | Editorial, informed by public benchmark reporting | `estimate` | manual, dated | NOT A BENCHMARK SCORE, and the only number here without a dated feed behind it. The industry reference (Artificial Analysis Intelligence Index) is not openly redistributable, and the open HuggingFace leaderboard is archived and covers no closed models — so nothing available ranks this catalog end to end. Treat a one-tier gap as noise. |
| 11 | Data-control options (ZDR, dedicated, in-region) | Provider policies and documentation | `published` | manual, dated | ZDR terms differ materially between providers, and between self-serve and negotiated agreements. This is a map of the options, not a compliance opinion — read the policy for the provider you would actually use. |
| 12 | Power, space & staffing | Public energy statistics and colocation market ranges | `published` | manual, dated | Single global defaults — electricity and colo pricing vary enormously by region. Staffing cost is a placeholder for your real team cost, and it is the figure most calculators omit entirely. |
| 13 | Routing split defaults | Published routing research (RouteLLM and successors) | `published` | manual, dated | Directional defaults, not a measurement of YOUR traffic. Reported hard-shares span roughly 14–40% depending on task and router. Routing cost itself is not modelled at all. |
| 14 | Cache & batch discounts | Provider published rates (via the LiteLLM feed) + provider documentation | `measured` | every 6 hours | Cache modelling is simple: input tokens only, no cache-WRITE premium and no TTL expiry. Real savings depend on how much of your prompt is genuinely reused. |

### Declared gaps

Things the tool does **not** know, stated so nobody infers them:

- [object Object]
- [object Object]
- [object Object]
- [object Object]
- [object Object]

---

## 3. Pinned feed state

The calculator reads live feeds; the **paper** reads pinned snapshots, so its
published figures stay reproducible while the live tool moves. Re-pinned
deliberately with `npm run refresh:paper`, never automatically.

| Snapshot | As of | Size |
|---|---|---|
| `server/paper-prices.json` | 2026-10-01 | 3253 price keys |
| `server/paper-gpu-prices.json` | 2026-10-01 | 6 GPU families |
| `server/paper-openrouter.json` | 2026-10-04 | 466 models, 112 providers |
| `server/price-history.json` | 2026-10-01 | 21 points, 2025-01-13 → 2026-09-14 |

---

## 4. Constants that are assumed, not measured

These are the load-bearing assumptions. Each is a number somebody chose, and each
is flagged in the code where it is defined.

### 4.1 Replica memory

```
VRAM = weights + KV + workspace + collective buffers + fragmentation
KV   = 2 × layers × kv_heads × head_dim × bytes × context × concurrency
```

Weights and KV are arithmetic on published architecture parameters. The remaining
three terms are **assumed fractions of weight size**:

| Term | Value | Basis |
|---|---|---|
| Workspace | 8% | `assumption` |
| Collective buffers | 4% | `assumption`, charged only at tensor-parallel degree > 1 |
| Fragmentation | 7% | `assumption`, excludes KV |

Workspace, collective buffers and fragmentation are assumed fractions, not measured. Collectives are charged only at tensor-parallel degree > 1, since a single-card replica runs none. Fragmentation excludes KV, because paged allocation exists to remove exactly that waste.

These three decide whether a model fits one card, which decides fleet size, which
decides cost. The paper's §8 works through a case — gpt-oss-120b — where they alone
move the answer, and an independent costing served it on a single card where this
tool will not.

### 4.2 KV-cache architecture

Attention parameters are `published` for **17 of 55** catalogue models and
estimated for the rest. Because KV now drives fleet size directly, an error here is
not cosmetic. The list of models still needing them is
[`docs/kv-architecture-wanted.md`](docs/kv-architecture-wanted.md) — the cheapest
useful contribution anyone can make.

### 4.3 Workload derivation

| Quantity | Rule | Basis |
|---|---|---|
| Duty cycle | `duty = 1 / peak-to-average ratio` | exact identity |
| Per-stream decode | 30 tokens/second | `assumption` — concurrency is strictly proportional to its inverse |
| Prefill discount | prefill counted at 1/10 of a decode token | `assumption` — a single scalar, not a disaggregation model |

Halving the assumed decode rate moves cost by roughly 22% and replica VRAM by about
a third. It is load-bearing, not robust.

### 4.4 Throughput — the weakest layer

**Confidence: `published`.** Third-party published benchmarks (vLLM/SGLang, batch 256, 512/512), not measurements we ran.

Throughput swings roughly 100x across batch sizes on identical hardware. These figures assume a throughput-optimised serving configuration at high concurrency — which is itself a demand-density assumption, not a hardware property. At low concurrency you will not reach these numbers.

Precision speedups, fitted from one controlled same-hardware series:

| Precision | Multiplier |
|---|---|
| fp16 | 1.0× |
| fp8 | 2.0× |
| int4 | 3.0× |

**There is no GPU-count term and no batch-size term.** The model assumes tensor
parallelism buys capacity rather than speed — a modelling assumption the paper
defends in §6 rather than demonstrating. 0 of 11 anchors are measurements
we ran; the rest are third-party.

Anchor sources:

- `spheron-2026` — Spheron GPU cost-per-token benchmark (2026). vLLM, continuous batching, 256 concurrent requests, 512 in / 512 out
- `cerebrium-2026` — Cerebrium — vLLM vs SGLang vs TensorRT-LLM. SGLang, batch 64, 256 in / 512 out

**This is the gap to close.** The harness exists: see
[`docs/benchmark-protocol.md`](docs/benchmark-protocol.md). A full sweep costs
about four dollars of rented hardware, and anyone can run it.

---

## 5. Workload shapes

Cost depends more on the *shape* of a workload than on the model. The six defaults
span the space; they are illustrative, not measurements of anyone's traffic.

| Shape | Context | Prefix reuse | In / out |
|---|---|---|---|
| Interactive chat | 2,000 | 20% | 1000 / 400 |
| RAG / search | 8,000 | 35% | 6000 / 400 |
| Agentic / tool loops | 16,000 | 70% | 12000 / 600 |
| Coding assistant | 12,000 | 50% | 8000 / 1500 |
| Reasoning / long generation | 6,000 | 15% | 1500 / 4000 |
| Batch / offline | 3,000 | 25% | 2000 / 500 |

---

## 6. Reproducing any number

```bash
npm run paper:figures    # every table in the paper, from the pinned snapshots
npm test                 # 31 tests, including a golden transcript of the above
npm start                # the calculator, with every input graded
```

`npm run paper:figures` prints its complete configuration before any table:
workload, duty cycle, GPU price and basis, amortisation, staffing and overhead. Any
discrepancy between a published figure and that script's output is an error, and
should be reported as one.

---

## 7. What this methodology cannot tell you

- **Throughput you will actually get.** It varies ~100× with batch size, and the
  model has no batch term.
- **Whether a price is subsidised.** Marketplace GPU rates reflect community and
  spot supply; some neocloud pricing is likely below cost.
- **Latency.** There is no time-to-first-token or inter-token term anywhere, so
  goodput — the measure a modern scheduler optimises — cannot be computed.
- **Your traffic.** Every workload number is typed in, not observed.

Each of these is a stated gap rather than an oversight, and each is an open issue.

---

*Generated by `npm run docs:methodology` from the live model. Do not edit by hand.*
