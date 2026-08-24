# Measuring what open-model inference actually costs

### Three things the field repeats that the data does not support

**Hariprasad Sudharshan** · August 2026 · Working paper v1 · [opentoken](https://tokencalci.onrender.com)

---

## Abstract

I built a calculator to price self-hosting an open-weight model against renting the same weights from a neocloud API. It told me that running a dense model yourself costs **4 to 6 times** what a provider charges. I published that figure.

Then I measured it properly and it was wrong. The real number is **1.6 to 1.8×**. My fleet-sizing model had assumed that adding GPUs adds throughput, which is not true, and that single assumption had overstated the hardware bill by about 2.4×.

This paper is the correction and the two other measurements I made while chasing it. All three contradict claims that circulate in this field without much challenge :

1. **Per-model prices are not falling.** A fixed basket of 19 models moved **0.976×/year** over 18 months. The widely-repeated "inference falls ~10×/year" does not hold for per-token list prices of a model you have already chosen.
2. **Tensor parallelism buys capacity, not speed.** Eight GPUs serve roughly what one does. Practitioners know this; no cost model I could find prices it, including mine until recently.
3. **Two independent price feeds disagree on 22% of models**, the worst by 5.7×. Any single-source price table is quietly reporting one sample as if it were the market.

Every input is a committed file and every script is re-runnable. Method is in section 6 and I would rather be corrected than cited.

**Disclosure :** No funding, no sponsorship, no commercial relationship with any provider named here. The paper argues for renting inference, which is a vendor-shaped conclusion, so it matters that the one number I revised moved **against** my own prior position.

---

## 1. Why bother measuring this

Every time a lab publishes weights, the discussion moves from frontier to open as though the hard part had shipped. What shipped is the weights.

An open weight is a file. A served token is a system. Between them sit roughly ten blocks — precision, KV cache, batching, kernels, parallelism, fleet, reliability, economics, API surface — and exactly one of them arrives in the download.

We have been here before. In 2008 we had the source code and thought we had the product. It took most of a decade to name the missing work DevOps, and only after naming it did anyone budget for it. Model serving is at that stage now.

The question I wanted answered was narrow and arithmetic : **for a given open model and a given workload, what does it cost to serve yourself versus to rent, and where exactly does the difference come from.**

---

## 2. Method

Four data layers, each graded by how directly the claim can be traced to a record. The grades matter more than the numbers, so they are stated on every figure the tool reports.

**Model prices — measured.** LiteLLM's `model_prices_and_context_window.json`, fetched server-side, ~2,200 keys. Each catalog model is matched against *every* provider serving it and the **median** taken; the full min/median/max spread is retained and displayed. A single provider key would silently pick a winner.

**Price history — derived.** Historical commits of that same file, recovered from git, normalised through the identical code path so a point in the series means what today's number means. 19 monthly observations, 2025-01-13 to 2026-07-14.

**GPU rental — measured.** Vast.ai public marketplace, per-GPU-hour min/median/max across currently-rentable offers, 6h cache. Purchase price has no open feed and stays a dated constant, labelled as such.

**Throughput — published.** Third-party vLLM and SGLang serving benchmarks (256 concurrent requests, 512 in / 512 out) across A100/H100/H200/B200 and 3B–70B active parameters. Scaling factors are fitted to that data rather than assumed. **These are benchmarks other people ran, not measurements I made** — see section 7.

The economic model rests on one asymmetry. Self-hosting is a **fixed** cost: you provision for peak and pay 24×7 whether tokens flow or not. An API is **variable**: you pay per token and idle is free. So the deciding variable is the duty cycle, and a workload stated as requests-per-day converts to peak-and-duty exactly, since duty = 1 / peak-to-average ratio.

---

## 3. Finding one : per-model prices are flat

Two different things get called "the price falling" and they differ by roughly 20×.

**Fixed basket.** Track the same 19 models present at both ends of the window. Total movement **0.964×** over 18 months, or **0.976×/year**. Essentially flat. Six of the nineteen did not move at all. Several rose.

**Cheapest available.** The lowest-priced model in the catalog at each date fell from **$0.100 to $0.040** per million input tokens — 2.5× over the window, about **46%/year**.

Both are true and they answer different questions. Prices fall because *cheaper new models keep arriving*, not because the model you picked gets cheaper. If you commit to one model, the API side will not drift away from you the way the folklore implies. If you re-platform to whatever is cheapest each quarter, you capture the fast rate — and re-platforming is engineering work nobody costs.

This matters directly to any build-versus-rent decision, because a hardware purchase is a multi-year bet against an assumed rate of decline. Assume 10×/year and owning hardware never makes sense. Measure it and the picture changes.

I have not found this series published elsewhere. It is 72KB of JSON and the script that rebuilds it is fifty lines.

---

## 4. Finding two : tensor parallelism buys capacity, not speed

This is the one that invalidated my own headline number.

Total fleet throughput barely moves with GPU count :

| Model | Active | GPUs | Total tok/s |
|---|---|---|---|
| Qwen3 30B-A3B | 3B | 1 | 3,900 |
| Gemma 4 31B | 31B | 1 | 3,100 |
| Mistral Small 24B | 24B | 2 | 3,400 |
| Llama 3.3 70B | 70B | 8 | 2,800 |

Eight GPUs do not deliver eight times the tokens. They deliver roughly what one does, because tensor-parallel decode pays collective communication on every layer and that cost cancels the bandwidth added. **You split a model across GPUs to make it fit, not to make it fast.** To serve more tokens you deploy another full replica and pay for it again.

My original model grew a single fleet until it was fast enough — silently assuming width bought speed — and so demanded 44 GPUs for a workload that actually needs 18 (six replicas of three). That is where the missing 4–6× lived.

**Whats the use of this correction :**

It produces a single number you can compute before committing a quarter. I am naming it because unnamed things do not get budgeted.

> **TPT — Tensor Parallel Tax**
> TPT = ceil( (total params × bytes per param × 1.3) / GPU VRAM )
> The GPUs one replica needs, purely to hold the model.

Because throughput is flat in GPU count, your cost multiple against a provider tracks TPT closely :

| Model | VRAM at fp16 | TPT | Bare compute vs neocloud |
|---|---|---|---|
| Qwen3 30B-A3B | 78 GB | **1×** | 0.5× — you win |
| Gemma 4 31B | 81 GB | **2×** | 0.5× — you win |
| Llama 3.3 70B | 182 GB | **3×** | 1.6× — you lose |
| gpt-oss-120b | 305 GB | **4×** | 1.8× — you lose |
| DeepSeek V3.2 | 1,745 GB | **22×** | 7.2× — you lose badly |

Not sparsity. Not parameter count. **VRAM fit.**

The most instructive row is Gemma. 31B at fp16 needs 81GB. An H100 holds 80. One gigabyte doubles TPT from 1 to 2 and doubles the hardware bill for identical tokens. At fp8 it needs 41GB and drops back to 1. Same weights, same card, half the cluster — which is why precision is not a config flag, and why the skill in quantisation was never the speedup but the calibration that keeps quality intact.

Gemma also shows TPT is a strong predictor and not a complete one : it sits at TPT 2 and still wins, because the provider price for that particular model is high. Compute TPT, then check the price you would actually pay. Both, not either.

**Model fit.** Rebuilt on this basis, the throughput model reproduces **9 of 10 published benchmarks with geometric-mean error 1.054×**, against 1.87× for the step function it replaced. The tenth — DeepSeek V3, a 671B MoE needing 22 GPUs purely to hold expert weights — is over-predicted by 5× and is flagged as a known blind spot rather than fitted on a single point.

---

## 5. Finding three : two feeds disagree on a fifth of models

Cross-checking the LiteLLM median against OpenRouter's median for the same model, across 37 comparable models :

- **8 of 37 (22%) disagree by more than 1.5×**
- Worst case **Mistral NeMo 12B at 5.71×**

Both feeds are reputable and neither is wrong. They sample different provider sets, and the provider spread within a single model is itself enormous — Llama 3.3 70B ranged $0.12–$0.90 input across 13 providers in one snapshot.

Two consequences. First, **any single-source price table is reporting one sample as if it were the market**, and most of the calculators in this space are single-source. Second, disagreement is information: when two independent feeds differ by 5×, the honest output is "this price is uncertain", not a confident point estimate.

There is a further wrinkle that makes cross-model comparison harder than it looks. Providers serve the *same* model at different precisions — fp4 through fp16 — so a cheap listing may simply be a heavily quantised one. Comparing your fp16 self-host plan against a blended median that includes fp4 serving is not like-for-like, and nothing in the price feeds flags it.

---

## 6. What this implies, briefly

This is not the interesting part of the paper, but it is the part people will ask about.

Self-hosting still loses on cost for most models, by roughly **1.6–1.8×** rather than the 4–6× I first published. It wins outright — around **0.5×** — when the model fits in a single GPU's memory and load is steady enough to keep it busy.

The two blocks that dominate the remaining gap are not engineering skill. They are **idle capacity** (you provision for peak, a provider pools demand across thousands of uncorrelated customers) and **staffing** (a single inference engineer costs more per year than the hardware underneath them, in a market with a severe shortage of exactly that profile).

So the intermediate position is straightforward. Rent while you learn the shape of your demand, measure your TPT and your real duty cycle, and revisit with data instead of a spreadsheet. The door does not close — weights you can download today you can still download in eighteen months, on cheaper hardware, with a faster serving stack.

One correction worth making to the *non*-cost argument as well : "our data cannot leave" is now largely satisfiable contractually. Zero Data Retention is widely available at no per-token premium. There is a ladder here — standard API, ZDR, in-region provider, dedicated endpoint, own hardware — and most discussions jump from the first rung to the last, skipping three cheaper options. The last rung is a *physical* guarantee where the others are *contractual* ones. Sometimes a regulator demands exactly that. Often nobody has written down which requirement actually binds.

---

## 7. Limitations

Stated before the reproduction section on purpose, because these are the places I expect to be corrected.

**The throughput data is second-hand.** The benchmarks are published by third parties, from one primary source for most anchors. I did not run them. Renting an H100 for two hours would cost roughly $5 at current marketplace rates and would move this layer from `published` to genuinely `measured`. That is the single highest-value thing left undone here and I intend to do it.

**Throughput swings ~100× with batch size** on identical hardware. Every figure assumes a throughput-optimised configuration at high concurrency — which is itself a demand-density assumption, not a hardware property. At low concurrency you will not reach these numbers, which makes the self-hosting case *worse* than reported, not better.

**One benchmark is badly mispredicted.** Large MoE models needing many GPUs purely to hold expert weights run far slower than the model says. Flagged, not fitted.

**Prices are published list prices.** Negotiated enterprise rates, committed-use discounts and free tiers are excluded, and all three favour the buyer.

**Some neocloud pricing is probably below cost.** Nothing in public data separates a subsidised price from an efficient one. If today's cheapest listings are land-grab pricing, every break-even here moves toward self-hosting when that stops.

**The capability tier is editorial.** The coarse 1–4 quality rating behind model shortlisting is my judgement, not a benchmark score. No open, current leaderboard ranks open and closed models together.

**Basket composition drifts.** In the price history, matchers occasionally span model generations. The fixed basket is the reliable signal; individual rows are indicative.

---

## 8. Reproduce it

Everything is a committed file or a re-runnable script.

```
git clone https://github.com/brettleehari/tokencalci
npm install

npm run refresh:history      # rebuild the 19-point price series from git
npm run refresh:openrouter    # re-pull the second price feed + serving precision
npm start                     # the calculator, with every input graded
```

- `server/price-history.json` — the price series, 72KB, 19 points, 49 models at the latest point
- `server/backfill-history.js` — recovers it from LiteLLM's git history
- `client/src/throughput.js` — the benchmark anchors, the fitted scaling factors, and the validation
- `GET /api/sources` — every data layer with its source, cadence, confidence grade and limitations
- `GET /api/history` — both decline rates and the series behind them

If a number here is wrong I would rather find out from you than from a reader six months from now.

---

**References :**

1. Kwon et al. *Efficient Memory Management for Large Language Model Serving with PagedAttention* (vLLM). 70–80% KV cache waste under naive allocation; 2–4× throughput at equal latency.
2. Spheron. *GPU Cost Per Token Benchmark 2026.* vLLM, continuous batching, 256 concurrent, 512 in / 512 out, A100/H100/H200/B200. https://www.spheron.network/blog/gpu-cost-per-token-benchmark-llm-inference-2026/
3. Cerebrium. *Benchmarking vLLM vs SGLang vs TensorRT-LLM for Llama 3.1.* SGLang 460 tok/s, batch 64, single H100, FP8. https://cerebrium.ai/blog/benchmarking-vllm-sglang-tensorrt-for-llama-3-1-api
4. vLLM Blog. *v0.6.0 — 2.7× Throughput Improvement and 5× Latency Reduction.* https://vllm.ai/blog/2024-09-05-perf-update
5. BerriAI. *LiteLLM model_prices_and_context_window.json* and its git history. https://github.com/BerriAI/litellm
6. OpenRouter. *Public API* — models, providers, per-provider endpoints. https://openrouter.ai/docs
7. Vast.ai. *Public marketplace API* — live GPU rental offers.
8. KORE1. *How to Hire LLM Engineers in 2026.* Loaded cost bands; the demo-to-production talent gap. https://www.kore1.com/hire-llm-engineers-2026/
9. CalTek Staffing. *The AI/ML Talent Shortage 2026.* 63% shortage, 500,000+ open roles.
10. GroqDocs. *Your Data in GroqCloud* — Zero Data Retention, self-serve. https://console.groq.com/docs/your-data

---

**PS :** The 4–6× figure I published earlier this year was wrong, and this paper is the correction. I would rather ship the smaller defensible number than keep the one that made the better argument. Tell me where the reasoning still has holes, there is always room for improvement :)
