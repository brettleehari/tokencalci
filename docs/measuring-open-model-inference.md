# The Serving Chain

### Ten layers between an open checkpoint and a billable token, and why only one of them is open

**Hariprasad Sudharshan** · August 2026 · Working paper **v4** · [opentoken](https://tokencalci.onrender.com)

---

## Abstract

When a lab publishes model weights, the field treats the hard part as shipped. It is not. A weight file is an artefact; a served token is a system. Between them sits work that has no name, no org chart and no budget line — which is precisely why it goes unpriced.

**This paper's contribution is a decomposition of that work into ten layers, with an inclusion test, a cost attribution, and an argument about which of them an enterprise can and cannot acquire.** Exactly one of the ten arrives in the download.

The decomposition makes three things visible that a single cost ratio hides.

**First, the layers are not equally acquirable.** Eight can be bought or built. One — layer 9, utilisation — is structural: it is a property of having many uncorrelated tenants, and no amount of engineering substitutes for it. That distinction, not the headline multiple, is what should drive a build-versus-rent decision.

**Second, the cost does not sit where the discourse looks.** Priced across five representative models, bare compute runs **0.15× to 1.80×** the neocloud rate — for four of five, the silicon is *cheaper* than renting. Fully loaded, the same fleets run **1.7× to 8.2×**. The premium is created almost entirely by layers 7 and 9, which are operational, not silicon.

**Third, it explains a common and expensive failure.** A laptop demo exercises one layer of ten and measures latency-for-one; a production bill is set by throughput-for-many. Those differ by roughly two orders of magnitude, which is how a working demo produces a budget that is wrong by 100×.

Sections 5–8 are supporting evidence, each attached to the layer it concerns. Every figure regenerates from one committed script against pinned snapshots. **Appendix A** gives every input with its source and confidence grade; **Appendix B** gives every derived quantity with its assumptions. I would rather be corrected than cited.

**Disclosure :** No funding, no sponsorship, no commercial relationship with any provider named here. The paper argues for renting inference, which is a vendor-shaped conclusion, so it matters that every number I have revised has moved **against** my own prior position — three times now, documented in the PS.

---

## 1. One block ships. Ten are required.

Every time a lab publishes weights, the discussion moves from frontier to open as though the hard part had shipped. What shipped is the weights.

We have been here before. In 2008 we had the source code and thought we had the product. It took most of a decade to name the missing work *DevOps*, and only after naming it did anyone budget for it, hire for it, or put it on an org chart. Model serving is at that stage now : universally practised by the people who do it, invisible to almost everyone who buys it.

Naming is not a cosmetic act. An unnamed cost is not a cheap cost — it is a cost that appears late, in someone else's quarter, attributed to something else. This paper's purpose is to name the parts.

---

## 2. The decomposition

### 2.1 Inclusion test

A layer belongs in this list if it satisfies all three :

1. **Necessary.** A production service cannot omit it. Skipping it does not degrade the deployment, it prevents one.
2. **Not in the download.** The checkpoint does not contain it, and no licence grants it.
3. **Cost-bearing and measurable.** Doing it badly versus well changes cost or capacity by a factor you can observe.

Test 3 is what keeps this from being a list of everything. "Prompt engineering" fails it — real work, but not a serving cost. "Model quality" fails test 2. "Buying GPUs" fails test 1 in the rent case.

**Where the boundaries are arguable.** Layers 2 and 3 (precision, KV cache) both touch memory and could be merged; I keep them apart because they are owned by different people and fail differently — precision failures are quality regressions, KV failures are capacity ceilings. Layers 7 and 8 (fleet, reliability) could be one "operations" layer; I split them because fleet is a capacity-planning decision made before launch and reliability is a continuous obligation after it. A reviewer preferring eight layers or twelve would not be wrong; the claim is that these ten partition the work, not that the partition is unique.

### 2.2 The ten layers

For each : what it is, why it resists, what evidence there is that it costs real money, and — the operative column — **who does it if you rent, versus if you own.**

| # | Layer | In the download? | What it decides |
|---|---|---|---|
| 1 | **Weights** | **Yes** | Capability |
| 2 | Precision | No | How many GPUs a replica needs at all |
| 3 | KV cache | No | Your concurrency ceiling |
| 4 | Batching & scheduling | No | Cost per token, by ~100× |
| 5 | Kernels | No | Throughput, by ~2× per framework generation |
| 6 | Parallelism | No | Whether the model fits — *not* how fast it runs |
| 7 | Fleet | No | How much you pay for capacity you are not using |
| 8 | Reliability | No | Whether it stays up |
| 9 | **Economics (utilisation)** | No — **and cannot be acquired** | The largest single term in most gaps |
| 10 | Surface | No | Whether anything can call it |

---

**Layer 1 — Weights.** *The only open block.*
A few hundred gigabytes of floating-point numbers under a permissive licence. This is what gets announced, celebrated and argued about. It is genuinely free, genuinely permissive, and genuinely the smallest item on this list.
**Rent:** identical — a provider serves the same checkpoint you would download. **Own:** nothing to do; this block is solved.

**Layer 2 — Precision.** *Quantise, calibrate, convert.*
Convert fp16 weights to fp8 or fp4 so they read faster and occupy less memory; calibrate on real data so the smaller numbers still behave; convert into whatever format the serving engine wants.
*Why it resists:* the speedup is a flag — not degrading the model is the skill. And precision does not only buy throughput, it moves you across the memory boundary that decides how many GPUs you need at all.
**Evidence:** fp8 ≈ 2.0×, fp4 ≈ 3.0× throughput on identical hardware [2]. Precision changes required fleet size for **18 of 55** catalogue models versus evaluating everything at fp16 (§8).
**Rent:** providers pick and validate a precision per model. **Own:** you choose, you calibrate, you own the quality regression.

**Layer 3 — KV cache.** *The memory that decides your concurrency.*
Every token every active user has sent stays resident in GPU memory and grows with every new token. Paged allocation, block reuse across shared prefixes, eviction, offload to host memory.
*Why it resists:* naive allocation wastes most of it — real requests use 20–30% of what gets reserved, so 70–80% of the most expensive memory in the building sits idle.
**Evidence:** 70–80% waste under naive allocation; fixing it bought 2–4× throughput at equal latency [1].
**Rent:** solved by someone else, and re-solved as context windows grow. **Own:** your concurrency ceiling, and therefore your cost per token, is set here.

**Layer 4 — Batching & scheduling.** *Where the money hides.*
Continuous batching so a finished sequence frees its slot immediately; chunked prefill so one long prompt does not stall every decode behind it; admission control for when you are full.
*Why it resists:* **your cost per token is not a property of your hardware. It is a property of how many people are talking to you at once.**
**Evidence:** sweeping batch size 1 → 256 on identical hardware moves cost per million tokens by roughly **100×** [2].
**Rent:** a provider batches your traffic with everyone else's, so it is always full. **Own:** you batch against your own traffic only — thin traffic means small batches means high unit cost.

**Layer 5 — Kernels.** *Fused attention, CUDA graphs, speculative decode.*
Attention that never materialises the full matrix, fused matmuls, CUDA graphs to remove per-step launch overhead, speculative decoding that spends cheap compute to buy back expensive latency.
*Why it resists:* it is the fastest-moving layer, so the cost is not implementation but *continuous* re-implementation.
**Evidence:** vLLM delivered 2.7× throughput over its own previous minor version [4].
**Rent:** every upstream improvement reaches you as a lower price, with no migration. **Own:** you upgrade, re-benchmark and re-validate, or quietly fall behind.

**Layer 6 — Parallelism.** *The counterintuitive one.*
Tensor parallelism to split a model across GPUs, pipeline parallelism across stages, expert parallelism for MoE, plus the collective communication stitching them back together every layer.
*Why it resists:* **adding GPUs does not add throughput.** You split a model to make it *fit*, not to make it *fast*. To serve more tokens you deploy another full replica and pay again. See §6 — this is the paper's most-contested claim and it is a modelling assumption, not a measurement.
**Rent:** the provider amortises the parallelism tax across all customers. **Own:** you pay it alone.

**Layer 7 — Fleet.** *Replicas, autoscaling, routing.*
Because throughput scales by replicas rather than width : warm pools so a cold start does not hit a user, autoscaling against a demand curve, load balancing, model swapping, capacity planning.
*Why it resists:* every replica is a full copy of the hardware bill, and you provision for peak but pay 24×7.
**Evidence:** idle capacity is routinely the largest single term in the gap (§5).
**Rent:** elastic — you pay per token and idle is free. **Own:** fixed — you size for the busiest hour and pay for the quiet ones.

**Layer 8 — Reliability.** *Health, drain, failover.*
Health checks that catch a wedged GPU, graceful drain, rolling upgrades that do not sever in-flight token streams, failover when a node dies mid-generation.
*Why it resists:* streaming makes this harder than ordinary web serving — you cannot simply retry a request that has already delivered 200 tokens.
**Evidence:** observed 30-minute uptime across 205 provider-endpoints ranges from **27% to 100%** [6] — a measure of how much operational competence varies among people doing this professionally.
**Rent:** someone else carries the pager. **Own:** you carry the pager.

**Layer 9 — Economics (utilisation).** *The block you cannot buy.*
A provider pools demand across thousands of unrelated customers whose peaks do not coincide, so their GPUs stay near full. You pool across one customer — yourself.
*Why it resists:* **it is the only layer here that is not an engineering problem.** It is a structural property of having many tenants. No skill, budget or vendor substitutes for it. A perfectly-run single-tenant fleet still loses this layer to a mediocre multi-tenant one.
**Evidence:** the dominant term in the loaded-versus-floor gap (§5).
**Rent:** their utilisation, which is far higher than yours will be. **Own:** your duty cycle; idle time is yours and it is expensive.

**Layer 10 — Surface.** *The API nobody budgets.*
An OpenAI-compatible endpoint, token streaming, structured output, tool calling, rate limits, quotas, usage metering, billing, keys and rotation.
*Why it resists:* invisible until you must build it, and then it is a quarter of work that produces no model quality whatsoever.
**Rent:** included, and compatible with what your code already calls. **Own:** you build and maintain it, forever.

### 2.3 The two claims that follow

**Claim 1 — the layers are not equally acquirable.** Layers 2–8 and 10 are engineering. They can be hired, bought, or copied from open source, and the open-source serving stack is closing them fast [1][4]. **Layer 9 cannot be.** It is a property of your customer base, not your competence. Any analysis that treats "self-host versus rent" as a pure engineering comparison has silently assumed layer 9 away.

**Claim 2 — the ten layers are why the cost gap survives good engineering.** §5 shows bare compute is usually *cheaper* than renting. The premium is created by layers 7 and 9. You can out-engineer layers 2–6 and 10. You cannot out-engineer having one tenant.

---

## 3. What the decomposition explains : demo, experiment, deployment

A release triggers three activities that get discussed as one. The decomposition separates them by **how many layers each touches**, and that is what makes their numbers non-transferable.

| | **Demo** | **Experimentation** | **Deployment** |
|---|---|---|---|
| Layers exercised | **1 of 10** | 2–3 of 10 | **10 of 10** |
| Question | Does it run? | Good enough for *our* task? | Can we serve it at our load? |
| Concurrency | 1 | 1–8 | Hundreds |
| Measures | Latency for one | Task quality | **Throughput for many**, p95 |
| Timescale | Hours | Weeks | Quarters |
| Typical cost | ~$0 | Tens to hundreds | Six to seven figures / year |
| Supports the decision | "worth an experiment" | **model selection** | **architecture and budget** |
| Cannot support | anything about cost | anything about scale | — |

**The trap is between the first column and the third, and it is arithmetic.** A demo measures how fast a model answers *one* person — layer 1, and a little of layer 2. A production bill is set by layers 3, 4, 7 and 9 together. On a 7B model at fp16 the two differ by roughly **100×** : about 39 tok/s for a single stream on high-bandwidth laptop memory, against roughly 3,900 tok/s aggregate on one H100 at batch 256 [2].

Both numbers are real. They are not the same measurement, and the demo is the one that feels finished. *Derived — Appendix B-7. The laptop figure is a bandwidth-bound estimate, not a benchmark I ran.*

---

## 4. Method and provenance

Fourteen data layers, each graded by how directly a claim traces to a record. **Appendix A** is the full table with URLs and limitations.

| Grade | Meaning | Count |
|---|---|---|
| **measured** | Fetched from a dated feed; we can point at the record | 4 |
| **derived** | Computed by us from a dated feed; method published | 3 |
| **published** | A real figure from a named third party, not machine-fetched | 6 |
| **estimate** | Our own judgement. The weakest class, flagged wherever it appears | 1 |

The rule the tool enforces on itself : *layers marked `estimate` are our own judgement and are flagged wherever they appear.* v1 and v2 both broke it — v1 graded the parallelism claim `measured` when it is an assumption; v2 still carried three inflated grades. Both corrected here and in the tool.

The economic model rests on one asymmetry. Self-hosting is **fixed** — you provision for peak and pay 24×7. An API is **variable** — you pay per token and idle is free. The deciding variable is the duty cycle, and `duty = 1 / peak-to-average ratio` exactly (Appendix B-1).

---

## 5. Evidence for layers 7 and 9 : the cost is not the silicon

At 200,000 requests/day of 2,000 in / 500 out, business-hours traffic (33% duty), H100s, 36-month amortisation, at the precision providers actually serve :

| Model | Served at | Replica GPUs | Fleet | Bare compute | Loaded |
|---|---|---|---|---|---|
| gpt-oss-120b | int4 | 1 | 2 | **0.15×** | 1.7× |
| Qwen3 30B-A3B | fp8 | 1 | 3 | **0.26×** | 2.6× |
| Gemma 4 31B | fp16 | 2 | 12 | **0.49×** | 2.5× |
| Llama 3.3 70B | fp8 | 2 | 8 | **0.54×** | 3.7× |
| DeepSeek V3.2 | fp8 | 11 | 33 | **1.80×** | 8.2× |

*Regenerate with `npm run paper:figures`. Prices [5] as of 2026-08-24; GPU rental [7]; serving precision [6].*

**Bare compute** is the GPU line alone at 100% utilisation, nobody paid, no overhead, no idle. **Loaded** is what you actually pay.

**For four of five models the silicon is cheaper than renting.** The premium is created almost entirely by layer 7 (you provision for peak and pay for the quiet hours) and layer 9 (a provider pools demand you cannot pool). A provider is not beating you on kernels. They are beating you on **having thousands of tenants whose peaks do not coincide**.

This is the paper's central empirical claim and it is what the decomposition predicts : the cost sits in the layers that are operational and structural, not in the ones that are technical.

*An earlier version of this paper quoted the bare-compute figure as if it were the cost. It is a floor. Separating them is what produced this section.*

---

## 6. Evidence for layer 6 : parallelism buys capacity, not speed

The most counterintuitive layer, and the paper's weakest-evidenced claim. Both are true.

| Model | Active | GPUs | Total tok/s |
|---|---|---|---|
| Qwen3 30B-A3B | 3B | 1 | 3,900 |
| Gemma 4 31B | 31B | 1 | 3,100 |
| Mistral Small 24B | 24B | 2 | 3,400 |
| Llama 3.3 70B | 70B | 8 | 2,800 |

*Published vLLM benchmarks, 256 concurrent, 512 in / 512 out [2].*

Eight GPUs do not deliver eight times the tokens. Tensor-parallel decode pays collective communication on every layer, and that cost cancels the bandwidth added.

**What is wrong with this evidence — stated plainly, because v1 called it measured and it is not.**

- **The anchors are confounded by construction.** Model size and GPU count move together. No anchor varies GPU count while holding model and precision fixed, which is the only experiment that tests the claim.
- **A constant fits nearly as well.** A flat 3,275 tok/s scores 1.11 geomean error; the two-parameter fit scores 1.02. Two parameters buy eight points on four observations.
- **The only same-model GPU-count comparison contradicts it, and it is the row I excluded.** Llama 3.1 70B fp8 on *one* H100 : 460 tok/s observed [3], 5,603 predicted — a **12.2× miss**. The harness and batch-size confound is real and is not 12× wide.

**The fit, honestly accounted :**

| Points | n | Geomean error |
|---|---|---|
| Fit points (algebraic identities, not predictions) | 4 | 1.000× |
| **Genuinely held out**, excluding the declared large-MoE blind spot | **5** | **1.099×** |
| Held out, including it | 6 | 1.414× |
| Excluded : large MoE | 1 | 4.99× |
| Excluded : cross-harness, batch 64, 1 GPU | 1 | **12.18×** |

v1 claimed "9 of 10 at 1.054×" — arithmetically true, rhetorically false, since five of the nine were fit points scoring 1.000 by construction.

**What would settle it :** one model, one precision, TP degrees 1/2/4/8, identical hardware and batch, topology recorded. About $5 of rented H100 time.

**A derived quantity from this layer, and its domain.** `Replica GPUs = ceil(params × bytes-per-param × 1.3 / VRAM)` — the GPUs one replica needs purely to hold the model. **The 1.3 is an assumed constant, not a measurement.** It reads no context length, batch size or attention architecture. At the benchmark configuration these numbers come from, required headroom is about 1.61×, not 1.30 — so it is wrong at its own anchor, and at production context lengths it is wrong by an order of magnitude. Worse, because it is a fraction of *weight* bytes, quantising a model perversely shrinks its credited KV budget. Read it as "cards to hold the weights" and nothing more. A defensible version needs `f(ctx, concurrency, kv_heads, head_dim, precision)` [1].

*v1 named this the "Tensor Parallel Tax". The name is withdrawn until the formula includes layer 3.*

---

## 7. Evidence for layer 9 : prices will not rescue you

If per-token prices were collapsing, layer 9's disadvantage would be temporary. They are not.

**Fixed basket** — the same 19 models present at both ends, 2025-01-13 to 2026-07-14 :

| Index | 18-month total | Annualised | |
|---|---|---|---|
| Carli — arithmetic mean of relatives | 0.964× | **0.976×/yr** | *v1 reported only this* |
| Jevons — geometric mean | 0.770× | **0.840×/yr** | the standard choice [9] |
| Median relative | 1.000× | **1.000×/yr** | |

v1 said "essentially flat" and quoted 0.976 — the **Carli index**, which has documented upward bias and fails time reversal [9]. My basket is the shape that maximises that bias. Under Jevons the same data says −16%/year. I did not pick Carli to flatter the result; I picked it without knowing there was a choice, which is worse and more common.

**What survives all three : nothing resembling 10×/year.** That the field's claim is wrong is the finding; its magnitude is not.

**Cheapest available** fell from $0.100 to $0.040 per million input tokens, about 46%/year — but that is the minimum of a *growing* set, monotonically non-increasing by construction, and the whole move is one step in September 2025. A direction, not a rate.

Prices fall because *cheaper new models keep arriving*, not because the model you picked gets cheaper. Commit to one model and the API side will not drift away from you. Re-platform quarterly and you capture the fast rate — and re-platforming is engineering work nobody costs.

**A caveat that may be fatal to the magnitude.** The basket is fixed in model identity, not sampling frame. Provider observations inside it grew **46 → 141**. Models that gained ≥3× providers show a geomean relative of **0.404**; stable ones, **1.038**. The series partly sorts on how many cheap listings entered each median window. A corrected version needs provider fixed effects I have not built.

---

## 8. Evidence for layer 2, and what moves on release day

**Dispersion beats every modelling choice in this paper.** The same open weights list from **$0.14 to $3.00** per million input tokens across 39 listings from 13 providers (DeepSeek V3.2); Llama 3.3 70B, $0.12–$0.90 across 13 listings from 11 providers. Which provider you sign with moves the answer more than fleet sizing, precision and duty cycle combined. Part of that spread *is* layer 2 : providers serve the same model at fp4 through fp16, so a cheap listing may be a heavily quantised one.

*v1 claimed "two independent price feeds disagree on 22% of models". Withdrawn. Recomputed : 7 of 37 disagree, but **21 of 37 are thin on one side** (n ≤ 2) and **OpenRouter sits inside the LiteLLM median for 10 of them** — so the feeds are not independent and most of the "disagreement" is sample size. The dispersion result above is better sampled and says more.*

**What moves the needle when a lab ships weights**, ranked by effect on enterprise cost, from the catalogue :

1. **Does it fit one card at its served precision?** The largest single lever, and usually absent from launch coverage. **27 of 55 models (49%)** fit one H100.
2. **Did the lab ship quantisation-aware weights?** Layer 2, pre-solved by the people best placed to validate it. Precision changes fleet size for **18 of 55**. gpt-oss-120b ships MXFP4 and fits one 80GB card; at fp16 the same model demands four.
3. **How fast providers pick it up.** For most enterprises the realistic price is what a neocloud charges, not what self-hosting costs. **6 of 55** have no provider at all — for those, "open" means you self-host by default and pay for all ten layers.
4. **Licence terms.** Binary; decides whether the rest of the analysis happens.
5. **KV-cache architecture** (layer 3). GQA, MLA and hybrid designs set concurrency per card. *This tool cannot price it — a known gap, not an argument that it does not matter.*

**Less than the coverage implies :** headline parameter count (VRAM at the *served* precision is operative), small benchmark deltas, and "runs on a laptop" (§3).

*A non-finding, reported because I looked :* I tested whether models with few providers carry worse prices. Median input price by provider depth ran $0.300 / $0.500 / $0.190 / $0.230 — non-monotonic, confounded by capability tier. **No relationship supported.**

**The honest read.** Open weights change **who you can buy from** far more than they change **what it costs**. The download removes lock-in and licence risk. It does not remove layers 2–10.

---

## 9. Limitations

**On the decomposition itself.** The partition is defensible, not unique — §2.1 names where the boundaries are arguable. I have not shown the layers are *orthogonal*; precision and KV cache interact, and fleet and reliability share staff. A stronger version would demonstrate independence rather than assert separability.

**On the evidence.** The throughput data is second-hand — ten of eleven anchors from one published run [2], n = 5 genuinely held out. The parallelism claim (layer 6) is an assumption, not a measurement. The replica-sizing formula omits layer 3 entirely and is wrong at its own anchor. Throughput swings ~100× with batch size and the model has no batch term. Serving precision is observed for 16 of 55 models and inferred for 37.

**On the prices.** Published list prices only — negotiated rates, committed-use discounts and free tiers are excluded, and all three favour the buyer. The median is over feed keys, not providers (27 of 37 models affected). GPU rental is community/spot supply with no SLA [7], so every self-host figure is a **lower bound**. Some neocloud pricing is probably below cost, and nothing public separates a subsidised price from an efficient one.

**On scope.** One axis is priced. No fine-tuning; no multi-LoRA serving — dozens of adapters on one resident base model, which does not exist on a per-token API at any price and is a common real reason to self-host. No latency SLO, p95 or TTFT. No prefix caching or offline batch on the self-host side while the API side gets prompt caching and batch discounts — that ledger is one-sided and favours renting. NVIDIA-only. The capability tier is editorial.

---

## 10. Reproduce it

```
git clone https://github.com/brettleehari/tokencalci
npm install

npm run paper:figures             # regenerates every table here
npm run paper:figures -- --live   # same, against today's live feeds
npm run refresh:history           # rebuild the 19-point price series from git
npm start                         # the calculator, with every input graded
```

`npm run paper:figures` prints the exact configuration first — workload, duty cycle, GPU price and basis, amortisation, staffing, overhead. **If a number here does not match what that script prints, the paper is wrong and I would like to know.**

- `scripts/paper-figures.mjs` — regenerates §5, §6, §7, §8
- `server/paper-prices.json`, `server/paper-gpu-prices.json` — pinned feed state
- `server/price-history.json` + `backfill-history.js` — the price series and its recovery script
- `client/src/throughput.js` — benchmark anchors and fitted factors
- `GET /api/sources` — machine-readable Appendix A

---

## Appendix A — every input, and where it came from

The tool's own registry, served live at `GET /api/sources`, so the paper and the machine-readable contract cannot drift apart.

| # | Layer | Source | How obtained | Grade | Refresh | Principal limitation |
|---|---|---|---|---|---|---|
| A-1 | Model API prices | LiteLLM price file [5] | Server-side fetch, ~2,300 keys, median across matching keys | **measured** | 6h | List prices only — excludes negotiated rates, committed-use discounts, free tiers |
| A-2 | Provider price spread | Derived from A-1 | min / median / max across keys serving a model | **derived** | 6h | Hyperscaler managed offerings excluded; median is over keys, not providers |
| A-3 | GPU rental prices | Vast.ai marketplace [7] | Live per-GPU-hour min/median/max on rentable offers | **measured** | 6h | Community/spot — below contracted enterprise pricing for the same card |
| A-4 | Price history & decline rate | Git history of [5] | 19 dated commits, normalised through the live code path | **derived** | on demand | Matchers occasionally span generations; provider set drifts within the basket |
| A-5 | Serving precision, uptime, jurisdiction | OpenRouter API [6] | Weekly committed snapshot, per-provider endpoints | **measured** | weekly | Throughput/latency null without an API key — does not close the throughput gap |
| A-6 | Second-source price agreement | A-1 vs A-5 | Ratio of medians per model | **derived** | weekly | Feeds are not independent — OpenRouter appears inside A-1 for 10 models |
| A-7 | GPU purchase price & node cost | Vendor / reseller street pricing [10] | Manual, dated constant | **published** | manual | Varies by volume, region, vendor relationship; node cost is an allocation |
| A-8 | Model specifications | Model cards, provider docs [12] | Hand-maintained catalogue | **published** | per review | Stales between reviews; knowledge cutoffs often unpublished |
| A-9 | Serving throughput | Published vLLM / SGLang benchmarks [2][3] | Fitted scaling factors, anchors committed | **published** | manual | Someone else's benchmarks; ~100× swing with batch; no batch or context term |
| A-10 | Capability tier | Editorial [13] | Coarse 1–4 bucket | **estimate** | manual | **NOT a benchmark score** — the only layer with no dated feed |
| A-11 | Data-control options | Provider policies [8][11] | Manual, dated | **published** | manual | ZDR terms differ by provider and between self-serve and negotiated agreements |
| A-12 | Power, space & staffing | Energy statistics [14], colo market ranges | Manual, dated defaults | **published** | manual | Single global defaults; staffing is a user assumption with no claimed provenance |
| A-13 | Routing split defaults | Published routing research [15] | Directional defaults | **published** | manual | Not a measurement of *your* traffic; reported hard-shares span ~14–40% |
| A-14 | Cache & batch discounts | Provider rates [5][16] | Feed rates plus documentation | **measured** | 6h | Input tokens only; no cache-write premium, no TTL expiry |

**Gaps the tool declares about itself** (`/api/sources` → `knownGaps`) : measured throughput; a benchmark-backed capability score; enterprise/contracted GPU pricing; your actual traffic; regional cost variation.

---

## Appendix B — derived quantities and the assumptions inside them

Everything below is **computed by us**, not fetched. Where a constant was chosen rather than measured, it says so.

| # | Quantity | Method | Assumptions — flagged |
|---|---|---|---|
| B-1 | Duty cycle from traffic shape | `duty = 1 / peak-to-average ratio` | **Exact identity.** But the ratio itself is a preset the user picks (1 / 2.5 / 4) |
| B-2 | VRAM footprint | `params × bytes-per-param × 1.3` | **The 1.3 is assumed, not measured.** No context, batch, concurrency or attention term. Wrong at the tool's own anchor (needs ~1.61) — §6 |
| B-3 | KV cache (layer 3) | *Not modelled.* Folded into B-2 | **Known gap.** Cannot represent GQA / MLA / hybrid attention. Scales with weight bytes, so quantising perversely shrinks the credited budget |
| B-4 | Fleet size | `replicaGPUs × replicas`, replicas from peak demand | Assumes **TP adds no throughput** (§6) — a modelling assumption |
| B-5 | Throughput | Bandwidth-scaled from a reference anchor; no GPU-count term | 4 confounded anchors; bandwidth exponent from **one** GPU pair; precision speedups from **one** dense model; held out n=5 |
| B-6 | Bare-compute floor | GPU line only, 100% utilisation, no people/overhead/idle | **A floor, not a cost.** v1's central error was quoting it as a cost |
| B-7 | Laptop vs server throughput (§3) | Memory bandwidth ÷ model bytes, single stream | **Derived estimate, not a benchmark I ran.** Crosses two models and two batch sizes |
| B-8 | Break-even duty | `selfHostMonthly / (apiMonthly / duty)` | Fleet held fixed; reported as "never" above 100% rather than extrapolated |
| B-9 | Break-even tokens/day | `selfHostMonthly / apiPer1M`, capped at fleet capacity | Nulled beyond what the fleet can serve — the uncapped version shipped in v1 and was wrong |
| B-10 | Price index | Mean of price relatives over a fixed basket | **Estimator choice changes the answer** — Carli 0.976, Jevons 0.840, median 1.000 (§7) |
| B-11 | Serving precision | Modal per-provider quantisation, ≥3 providers and a clear plurality | Observed for 16 of 55; the other 37 fall back to model card, then a **release-year heuristic** |
| B-12 | Effective API price | List rates with prompt-cache and batch discounts | Cache-read falls back to **10% of input rate** where none is published |

---

**References**

1. Kwon et al. *Efficient Memory Management for Large Language Model Serving with PagedAttention* (vLLM). https://arxiv.org/abs/2309.06180
2. Spheron. *GPU Cost Per Token Benchmark 2026.* vLLM, continuous batching, 256 concurrent, 512 in / 512 out, A100/H100/H200/B200. https://www.spheron.network/blog/gpu-cost-per-token-benchmark-llm-inference-2026/
3. Cerebrium. *Benchmarking vLLM vs SGLang vs TensorRT-LLM for Llama 3.1.* https://cerebrium.ai/blog/benchmarking-vllm-sglang-tensorrt-for-llama-3-1-api
4. vLLM Blog. *v0.6.0 — 2.7× Throughput Improvement and 5× Latency Reduction.* https://blog.vllm.ai/2024/09/05/perf-update.html
5. BerriAI. *LiteLLM `model_prices_and_context_window.json`* and its git history. https://github.com/BerriAI/litellm
6. OpenRouter. *Public API* — models, providers, per-provider endpoints including serving quantisation and uptime. https://openrouter.ai/docs
7. Vast.ai. *Public marketplace API.* https://vast.ai/
8. GroqDocs. *Your Data in GroqCloud* — Zero Data Retention. https://console.groq.com/docs/your-data
9. ILO / IMF / OECD / Eurostat / UN / World Bank. *Consumer Price Index Manual: Concepts and Methods* — on Carli bias and the case for Jevons. https://www.imf.org/en/Data/Statistics/cpi-manual
10. CloudZero. *H100 GPU Cost Analysis.* https://www.cloudzero.com/blog/h100-gpu-cost/
11. OpenRouter. *Privacy and Logging.* https://openrouter.ai/docs/features/privacy-and-logging
12. Hugging Face. *Model cards.* https://huggingface.co/models
13. Artificial Analysis. *Intelligence Index* — referenced as the industry capability reference, **not redistributed**. https://artificialanalysis.ai/
14. U.S. Energy Information Administration. *Electric Power Monthly.* https://www.eia.gov/electricity/
15. Ong et al. *RouteLLM: Learning to Route LLMs with Preference Data.* https://github.com/lm-sys/RouteLLM
16. OpenAI. *Batch API.* https://platform.openai.com/docs/guides/batch

*Staffing cost bands cited in v1 came from two recruitment-firm marketing pages. Removed rather than re-cited — a firm selling placements is not a source for the price of placements.*

---

**PS :** This paper has corrected itself three times, each against my own argument. v1 said self-hosting costs 4–6× — wrong, my fleet model assumed GPUs add throughput. v2 said 1.6–1.8× — also wrong, that was a floor quoted as a cost. v3 added the provenance tables after a reviewer pointed out that a paper insisting every number carry its source was not carrying its own. v4 puts the ten layers first, because that was always the contribution and the cost ratios were only ever evidence for it. Tell me where the reasoning still has holes, there is always room for improvement :)
