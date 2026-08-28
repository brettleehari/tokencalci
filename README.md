# opentoken — open weights are not open inference

When a lab publishes weights, the conversation moves from frontier to open as
though the hard part had shipped. **What shipped is the weights.** Turning them
into tokens at scale — continuous batching, quantisation that doesn't cost
quality, attention kernels, keeping thousands of GPUs hot across uncorrelated
demand — is a separate discipline. Frontier labs and neoclouds do that work, and
almost nobody prices it.

**This is a calculator for that gap:** what an open model costs to run yourself,
against what a neocloud charges for the identical weights — with the difference
decomposed into serving efficiency, facilities, people and idle capacity.

The finding that gives the tool its shape, after re-deriving it against published
serving benchmarks: **the split falls on whether the model fits in one GPU's
memory.** Tensor parallelism buys capacity, not speed — a modelling assumption
that fits the benchmark data but is not independently measured; eight GPUs
serve roughly what one does — so a model needing four GPUs to fit costs about
four times as much for the same tokens.

Models that fit on a single card (Gemma 4 31B, Qwen3 30B-A3B) beat the neocloud
on bare compute at around 0.5x. Models that don't (Llama 3.3 70B, gpt-oss-120b)
lose at roughly 1.7-8.2x fully loaded, while BARE COMPUTE usually wins (0.15-1.8x)
— the gap is not the silicon, it is idle time, people and overhead. Earlier
versions of this tool put the gap at 4-6x, then quoted the compute floor as if it
were the cost;
measuring it showed the hardware bill had been overstated by about 2.4x, because
the model assumed adding GPUs added throughput.


## Cite this work

Archived on Zenodo with a versioned DOI covering the paper, the calculator and the
price dataset together. Cite the DOI rather than a URL — the DOI is permanent, the
deployment host is not.

```
Sudharshan, H. (2026). From Free Weights to Reliable Tokens: the ten layers of open-model inference, and
the discipline forming around them (v7). Zenodo.
https://doi.org/10.5281/zenodo.XXXXXXX
```

Full paper: [`docs/from-free-weights-to-reliable-tokens.md`](docs/from-free-weights-to-reliable-tokens.md) · machine-readable
metadata in [`CITATION.cff`](CITATION.cff).

**Licensing.** Source code is MIT ([`LICENSE`](LICENSE)). The paper and the
reconstructed price series are CC BY 4.0 ([`LICENSE-CONTENT`](LICENSE-CONTENT)).

---

## What it does

1. **Define workload** — either the way you know it (requests/day, avg input and
   output tokens, traffic shape) or the way a fleet is sized (peak tokens/min +
   duty cycle). The two are exact translations: **duty = 1 / peak-to-average ratio**.
3. **Self-host vs neocloud, per model** — API cost vs. self-host TCO (rent/own GPU,
   power, colo, utilization, overhead, ops labor, HA), with break-even expressed
   three ways: **duty cycle**, **tokens/day**, and **months to payback**.
4. **Versus the frontier** — what the same workload costs on GPT / Claude / Gemini,
   priced live. Self-hosting an open model is really being weighed against this.
5. **Sovereignty premium** — the cost of full control, and how it widens as
   neocloud prices fall (LLMflation drift scenario).

Differentiators vs. the field: **nobody else plans the mix and the hosting
decision together** — price tables cost one model, self-host calculators size one
model, and routers execute a split at runtime without ever asking whether to own
the hardware. Plus the **duty-cycle / idle-cliff** framing, ops labour priced into
*both* rent and own, node cost (not just the GPU) in capex, prompt-cache and
batch-discount modelling on the API side, the **provider price spread** shown
rather than hidden behind a median, and an agent-facing JSON API.

## Data

**This tool doesn't generate data.** It aggregates public feeds and published
figures; its contribution is *dimensional* — turning scattered per-token prices,
GPU rental rates and hardware specs into one comparable question. That's a
presentation wedge, not a data moat, and the **Sources** tab says so publicly.

Every layer is sourced, dated and graded by confidence — and the two layers that
are our own estimates are flagged everywhere they appear, including in the API.

| Layer | Source | Live? |
|---|---|---|
| Model API prices | LiteLLM `model_prices_and_context_window.json` | live, 6h cache |
| GPU rental | Vast.ai public marketplace, min/median/max per card | live, 6h cache |
| Price history | git history of the LiteLLM price file (19 monthly points) | backfilled, re-runnable |
| Serving precision, uptime, jurisdiction | OpenRouter public API | **weekly**, automated |
| Second-source price check | LiteLLM vs OpenRouter, compared | weekly |
| GPU purchase price | dated constants — no open feed exists | constant, dated |
| Throughput | fitted to third-party vLLM serving benchmarks | **published** (not measured in-house) |
| Capability tier | editorial 1–4 | **not a benchmark** |

Full provenance — source, method, refresh cadence, confidence class, limitations,
known gaps and upstream credits — is on the **Sources** tab and at
`GET /api/sources`. Both render from the same registry (`client/src/sources.js`),
so the public claim and the machine-readable one cannot drift apart.

- **Fallback:** a bundled dated snapshot (`server/snapshot.json`) so the tool
  never shows a blank. Every result carries a visible **prices-as-of** date.

### Measured price history — and why "~10×/year" is wrong

The tool used to repeat the industry line that inference prices fall ~10×/year.
`server/backfill-history.js` recovers the real series from the price feed's own
git history, and it does not support that claim:

- **Fixed basket** (the same 19 models, Jan 2025 → Jul 2026): **0.98×/year.**
  Per-model list prices are essentially *flat*. A model you picked 18 months ago
  costs about what it cost then, and several rose.
- **Cheapest available**: $0.100 → $0.040/1M, about **46%/year** — but that fall
  comes entirely from *cheaper new models arriving*, not from existing prices
  dropping.

Those two rates differ by ~20× and mean different things. Which one applies to
you depends on whether you actually re-platform every time something cheaper
ships. Quoting the fast rate while staying on one model overstates the case
against buying hardware — the Sovereign view now makes you pick.

### How models are priced

The same open model is served by a dozen providers at wildly different rates —
Llama 3.3 70B spanned **$0.12–$0.72** input and **$0.20–$2.25** output in one
feed snapshot. Picking any single provider's key silently picks a winner, so:

- Each catalog model is matched against every serving provider in the feed, and
  the **median** becomes the headline price; **min/median/max** are shown.
- Input, output and cache-read rates are carried separately and blended at *your*
  workload's actual in:out ratio — not a hardcoded 75/25.
- **49 of 55** models resolve live this way. The rest have no per-token match
  and keep a curated blended figure **badged `curated`**. Live and curated
  figures are never mixed or presented as equivalent.
- An entry is only ever priced from a feed key for the **same** model. Where the
  feed has moved to a newer generation, the catalog entry is refreshed rather
  than priced off its successor — a 2024 model must not inherit 2026 prices.

### Connectors and refresh cadence

The app reads **committed snapshots**; it never calls a third-party API on the
request path. That keeps it working when an upstream is down or the host has
slept — and it means snapshots refresh on a schedule.

```bash
npm run refresh:openrouter   # weekly — models, providers, per-provider endpoints
npm run refresh:history      # occasional — rebuild the price-history series
```

`.github/workflows/refresh-data.yml` runs the OpenRouter refresh **every Sunday
06:00 UTC**, sanity-checks the result (minimum model/provider/match counts) and
commits it only if something changed. It can also be triggered by hand from the
Actions tab. A stale snapshot still serves — the UI and `/api/openrouter` report
its age rather than hiding it.

**What OpenRouter gives us that LiteLLM doesn't:**

- **Serving precision per provider.** The same model is served at anything from
  fp4 to fp16. You choose a precision for self-hosting, so comparing against an
  API median that blends precisions is not like-for-like — now disclosed.
- **Provider jurisdiction.** Stated headquarters for 92 of 103 providers, which
  is the data the sovereignty argument actually needs.
- **Observed uptime.** On some models providers range from ~45% to 100%. The API
  side of the comparison previously assumed availability.
- **An independent price.** Where the two feeds disagree by more than 1.5×, that
  is flagged on the verdict rather than averaged away. 8 of 37 comparable models
  currently disagree at that threshold.

## Run locally

```bash
npm install
npm run build      # builds the React frontend to /dist
npm start          # Express serves the API + frontend on :3001
# open http://localhost:3001
```

Dev with hot reload (two terminals):

```bash
npm run dev:server   # Express API on :3001
npm run dev:web      # Vite dev server on :5173 (proxies /api -> :3001)
```

## Deploy to Render

This repo includes `render.yaml` (a Blueprint). One Web Service serves both the
API and the built frontend.

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo, and it reads `render.yaml`.
   (Build: `npm install && npm run build`; Start: `npm start`. Render sets `PORT`.)
3. Deploy. Free tier spins down after ~15 min idle (cold start ~30–50s); the
   price feed re-fetches on demand when its 6h cache is stale, so no worker needed.

## API (for other agents / programmatic use)

A public, read-only JSON API wraps the same economics engine. No auth, CORS open.
See [`SKILL.md`](./SKILL.md) for the agent-facing skill definition (also served at `/SKILL.md`).

- `GET /api` — self-describing endpoint index
- `GET /api/decide?model=…` — verdict + full TCO for one model. Workload either as
  `dailyRequests`+`avgTokensIn`+`avgTokensOut`+`peakiness`, or as
  `peakTokPerMin`+`dutyPct`+`outputShare`. Plus `cacheHitPct`, `batchPct`,
  `mode=auto`, `sovereign`.
- `GET /api/compare?limit=10&…` — verdict + $/1M across the first N models
- `GET /api/models` — open-model catalog with dimensions (size, context, license, modality, cutoff) and live in/out pricing with provider spread
- `GET /api/frontier` — frontier closed-model prices (GPT / Claude / Gemini) from the feed
- `GET /api/history` — measured price history: fixed-basket vs cheapest-available decline rates
- `GET /api/sources` — full provenance for every data layer, plus known gaps and credits
- `GET /api/openrouter` — connector freshness, provider jurisdictions, and which models are served at more than one precision
- `GET /api/gpus` — GPU catalog with **live** rental prices (min/median/max) and dated capex
- `GET /api/providers` · `GET /api/precisions` · `GET /api/prices`

```bash
# by traffic, with a 50% prompt-cache hit rate
curl "http://localhost:3001/api/decide?model=llama-70b&dailyRequests=200000&avgTokensIn=2000&avgTokensOut=500&cacheHitPct=50"

# the original peak/duty form still works unchanged
curl "http://localhost:3001/api/decide?model=llama-70b&dutyPct=85&mode=auto"
```

## Caveats (also shown in the UI)

Per-model prices are stickier than the folklore suggests (see the measured history
above) — but the cheapest *available* option does move fast, so check the as-of date.
Throughput is fitted to third-party vLLM benchmarks at batch 256 — it has no batch-size or context-length term; caching is modelled simply (input tokens only,
no write-premium or TTL); batch is a flat 50%.
GPU rental is live but sampled from a community/spot marketplace, so enterprise
contracts cost more — the full spread is shown. GPU purchase price, throughput and
the capability tier remain estimates and are labelled as such wherever they appear.
Every number traces to an input, a dated feed, or an explicitly-flagged constant.
Not financial advice.
