---
name: should-i-self-host
description: Decide whether to self-host an open-weight LLM or rent it from a neocloud API, with live-priced total cost of ownership. Use when a user or agent asks "is it cheaper to self-host model X or use an API?", "what GPUs does model X need?", "what's the break-even for self-hosting?", "how much does it really cost to serve open weights?", or needs self-host-vs-neocloud cost/TCO, break-even, provider price spread, or a model/provider catalog. Returns a verdict plus the underlying numbers.
---

# should-i-self-host

**Thesis:** open weights are not open inference. Publishing weights is not the same as being able to serve them; the serving work — batching, quantisation, kernels, keeping fleets hot — is a separate discipline that open-model discussions rarely price. This API prices it.

A public, read-only JSON API that answers **"which models should I use, and should I self-host any of them?"** It models the core asymmetry: self-host is a **fixed** cost (you provision for peak and pay 24×7), while a neocloud API is **variable** (pay per token, idle is free). The deciding variable is the **duty cycle** — how much of the time your hardware is actually busy.

- **Base URL:** `https://tokencalci.onrender.com`  *(the public **opentoken** deployment — the host predates the name; replace with your own if self-deploying)*
- **Auth:** none. **Method:** `GET`. **CORS:** open (`*`).
- **Self-describing index:** `GET /api` returns all endpoints. This file is served at `GET /SKILL.md`.

## When to use this
Call the API instead of guessing whenever the task involves: self-host vs API cost, GPU/VRAM requirements for an open model, break-even analysis, TCO (capex + opex incl. personnel/idle), a data-sovereignty cost premium, or comparing open models/neocloud providers. Do **not** answer these from memory — prices and hardware move fast; this feed is dated.

## Primary endpoint — `GET /api/decide`
Verdict + full TCO for one model at a workload.

State the workload **either** the human way (`dailyRequests` + token sizes) **or** the fleet way
(`peakTokPerMin` + `dutyPct`). Both are exact translations of each other: duty = 1 / peakiness.

| Param | Default | Meaning |
|---|---|---|
| `model` | `llama-70b` | Model id (see `GET /api/models`) |
| **Workload A — by traffic** | | *preferred; state it the way you know it* |
| `dailyRequests` | — | Requests per day. Presence of this switches to traffic mode. |
| `avgTokensIn` | `2000` | Avg input tokens per request (prompt + context) |
| `avgTokensOut` | `500` | Avg output tokens per request |
| `peakiness` | `3` | Peak-to-average ratio. `1` = flat/batch, `2.5` = business hours, `4` = consumer-spiky |
| **Workload B — by fleet** | | *original params, unchanged* |
| `peakTokPerMin` | `100000` | Peak tokens/min — sizes the self-host fleet |
| `dutyPct` | `30` | % of the time you actually need peak (the key variable) |
| `outputShare` | `0.25` | Output share of tokens — sets how input/output rates blend |
| **API-side discounts** | | |
| `cacheHitPct` | `0` | % of **input** tokens served from prompt cache (priced at the feed's cache-read rate) |
| `batchPct` | `0` | % of traffic via batch API (flat 50% discount) |
| **Hardware** | | |
| `precision` | *observed serving precision for the model* | `fp16` \| `fp8` \| `int4` — omit to get what providers actually serve it at; the response reports `precisionBasis` |
| `gpu` | `h100` | GPU id (see `GET /api/gpus`) |
| `mode` | `auto` | `rent` \| `own` \| `auto` (auto = cheaper of the two) |
| `sovereign` | `false` | If `true`, data must stay in-house → self-host is forced; returns the premium |

**Example**
```bash
curl "https://tokencalci.onrender.com/api/decide?model=llama-70b&dailyRequests=200000&avgTokensIn=2000&avgTokensOut=500&peakiness=3&cacheHitPct=50"
```
**Response** (shape — values are illustrative; call the API for live numbers)
```json
{
  "model": { "id": "llama-70b", "label": "Llama 3.3 70B", "params": 70, "license": "Llama", "commercial": true, "cutoff": "Dec 2023" },
  "workload": { "peakTokPerMin": 1041667, "dutyPct": 33.33, "outputShare": 0.2, "monthlyTokens": 15000000000,
                "dailyTokens": 500000000, "statedAs": "requests", "cacheHitPct": 50, "batchPct": 0, "precision": "fp16", "gpu": "h100" },
  "verdict": "neocloud",
  "recommendation": "Use a neocloud API — self-host (own, the cheaper basis) would still cost ~32x the neocloud bill at 33% duty.",
  "sovereign": false,
  "selfHost": { "basis": "own", "gpus": 52, "vramGB": 182, "capexUSD": 1924000, "monthlyUSD": 75892, "per1MUSD": 5.06,
                "breakEvenDuty": null, "breakEvenTokensPerDay": null, "breakEvenBeyondFleetCapacity": true, "paybackMonths": null,
                "rent": {"monthlyUSD": 208800, "per1MUSD": 13.92, "gpus": 52}, "own": {"monthlyUSD": 75892, "per1MUSD": 5.06, "gpus": 52} },
  "neocloud": {
    "source": "live", "inPer1MUSD": 0.23, "outPer1MUSD": 0.4, "cacheReadPer1MUSD": 0.02,
    "listPer1MUSD": 0.26, "effectivePer1MUSD": 0.18, "monthlyUSD": 2718, "livePrice": true,
    "providerSpread": { "providers": 13, "inMin": 0.12, "inMax": 0.9, "outMin": 0.2, "outMax": 1.2,
                        "servedBy": ["deepinfra", "groq", "together_ai", "..."] },
    "feedKeys": ["deepinfra/meta-llama/Llama-3.3-70B-Instruct", "..."]
  },
  "frontierAPI": [
    { "id": "claude-opus-5", "label": "Claude Opus 5", "org": "Anthropic", "tier": "frontier",
      "inPer1MUSD": 5, "outPer1MUSD": 25, "effectivePer1MUSD": 6.3, "monthlyUSD": 94500, "vsSelfHost": 1.25 }
  ],
  "pricesAsOf": "2026-07-31",
  "caveats": ["Throughput is a heuristic ...", "Price is the MEDIAN across 13 live provider listings ..."]
}
```
(At neocloud's low per-token prices, the verdict is usually `neocloud` unless duty is very high or the workload is huge; `breakEvenDuty: null` means self-host never wins within 0–100% at this workload.)

**Three numbers matter most in the response:**
- `neocloud.providerSpread` — the same open model can cost **5× more** at one provider than another. This spread swamps every other input; quote it, don't hide behind the median.
- `neocloud.source` — `live` (median of real feed listings) or `curated` (no feed match; directional, no input/output split, so cache/batch discounts don't apply). Never present the two as equivalent.
- `frontierAPI` — what the same workload costs on GPT/Claude/Gemini. Self-hosting an open model is usually being weighed against *this*, not against the same model on a neocloud.

**Interpreting `verdict`:**
- `neocloud` — pay-per-token is cheaper; recommend the API. (Common at low duty cycle.)
- `self-host` — sustained load high enough that fixed cost wins; `selfHost.basis` says rent or own.
- `self-host-required` — sovereignty forces self-host; `recommendation` states the cost premium.

Always surface `pricesAsOf` and the relevant `caveats` to the user; never present figures as exact.


## Other endpoints
- `GET /api/compare?limit=10&…` — verdict + $/1M for the first N models at one workload (leaderboard style). Accepts any `/api/decide` workload param.
- `GET /api/models` — open-model catalog with dimensions: `params`, `active` (MoE), `ctx` (context K), `license` + `commercial`, `modality`, `org`/`country`, `quality` tier, `cutoff` (knowledge cutoff), plus `price` (`in`/`out`/`cacheRead`, `spread`, `keys`, `source`) and `livePrice`. Also returns `priceCoverage` — how many entries are feed-priced vs curated.
- `GET /api/frontier` — frontier closed-model prices (GPT / Claude / Gemini) from the live feed.
- `GET /api/openrouter` — connector snapshot: freshness (weekly cadence), provider jurisdictions (HQ + datacenters), and models served at more than one precision.
- `GET /api/sources` — **full provenance**: every data layer with its source, refresh cadence, confidence class (`measured` / `derived` / `published` / `estimate`) and limitations, plus known gaps and upstream credits. Call this when asked where a number came from.
- `GET /api/history` — **measured** price history from the price feed's own git history. Returns `fixedBasket` (same models over time) and `cheapestAvailable` (includes new entrants). Use this instead of repeating the "~10x/year" figure, which the data does not support.
- `GET /api/gpus` — GPU catalog with **live** rental prices: `rentHr` plus a `rentSpread` of min/median/max across currently-rentable offers, and `rentSource` of `live` or `constant`.
- `GET /api/providers` — neocloud providers (DeepInfra, Together, Fireworks, Groq…) with reference $/1M.
- `GET /api/gpus` — GPU catalog (VRAM, rent $/hr, capex, power).
- `GET /api/precisions` — serving precisions.
- `GET /api/prices` — the dated live LiteLLM pricing feed.

## Guardrails for agents
- **License:** if `model.commercial` is `false`, self-hosting in a product needs a paid license — warn the user before recommending it.
- **Tokenizers differ:** the same text is a different token count per model, so cross-model `$/1M` comparisons are approximate.
- **It's a planner, not a router:** it recommends; it does not route live traffic or provision anything.
- Numbers are **directional** (throughput fitted to third-party benchmarks at one batch size, prices dated). Do not present as precise quotes.
- **Do not repeat "prices fall ~10x/year."** Call `/api/history`: a fixed basket of the same models moved ~0.98x/year over 18 months. Only the *cheapest available* option falls fast (~46%/year), and capturing that requires re-platforming. Which rate applies depends on whether the user will switch models.
- **GPU rental is community-marketplace pricing.** `rentSpread.median` is below enterprise/contracted rates; quote the spread, not just the median.
- **Check `secondSource` on `/api/decide`.** It compares our LiteLLM price against OpenRouter. If `agrees` is `false`, the two independent feeds disagree materially — say the cost is uncertain rather than quoting a point estimate. If `quantization.mixed` is true, the API median blends different serving precisions, so it is not like-for-like against a self-host precision.
- **Cite provenance, don't assert authority.** This API aggregates public feeds; it does not measure. `/api/sources` grades every layer — quote the confidence class when a number matters.
- **The capability tier is editorial, not measured** (`qualityBasis` on `/api/models`). It is the only number in the API without a dated feed behind it. Never present it as a benchmark score.

## Human UI
The same engine powers an interactive site (3D self-host-vs-neocloud-over-time view, break-even, sovereignty premium, open-model catalog) at the base URL.
