---
name: should-i-self-host
description: Decide whether to self-host an open-weight LLM or rent it from a neocloud API, with live-priced total cost of ownership. Use when a user or agent asks "is it cheaper to self-host model X or use an API?", "what GPUs does model X need?", "what's the break-even for self-hosting?", or needs self-host-vs-neocloud cost/TCO, break-even, or a model/provider catalog. Returns a verdict plus the underlying numbers.
---

# should-i-self-host

A public, read-only JSON API that answers **"should I self-host this LLM, or use a neocloud API?"** It models the core asymmetry: self-host is a **fixed** cost (you provision for peak and pay 24×7), while a neocloud API is **variable** (pay per token, idle is free). The deciding variable is the **duty cycle** — how much of the time your hardware is actually busy.

- **Base URL:** `https://tokencalci.onrender.com`  *(replace with your deployment host)*
- **Auth:** none. **Method:** `GET`. **CORS:** open (`*`).
- **Self-describing index:** `GET /api` returns all endpoints. This file is served at `GET /SKILL.md`.

## When to use this
Call the API instead of guessing whenever the task involves: self-host vs API cost, GPU/VRAM requirements for an open model, break-even analysis, TCO (capex + opex incl. personnel/idle), a data-sovereignty cost premium, or comparing open models/neocloud providers. Do **not** answer these from memory — prices and hardware move fast; this feed is dated.

## Primary endpoint — `GET /api/decide`
Verdict + full TCO for one model at a workload.

| Param | Default | Meaning |
|---|---|---|
| `model` | `llama-70b` | Model id (see `GET /api/models`) |
| `peakTokPerMin` | `100000` | Peak tokens/min — sizes the self-host fleet |
| `dutyPct` | `30` | % of the time you actually need peak (the key variable) |
| `precision` | `fp16` | `fp16` \| `fp8` \| `int4` |
| `gpu` | `h100` | GPU id (see `GET /api/gpus`) |
| `mode` | `auto` | `rent` \| `own` \| `auto` (auto = cheaper of the two) |
| `sovereign` | `false` | If `true`, data must stay in-house → self-host is forced; returns the premium |

**Example**
```bash
curl "https://tokencalci.onrender.com/api/decide?model=llama-70b&peakTokPerMin=2000000&dutyPct=85&mode=auto"
```
**Response** (shape — values are illustrative; call the API for live numbers)
```json
{
  "model": { "id": "llama-70b", "label": "Llama 3.3 70B", "params": 70, "license": "Llama", "commercial": true, "cutoff": "Dec 2023" },
  "workload": { "peakTokPerMin": 2000000, "dutyPct": 85, "monthlyTokens": 73440000000, "precision": "fp16", "gpu": "h100" },
  "verdict": "neocloud",
  "recommendation": "Use a neocloud API — self-host (own, the cheaper basis) would still cost ~3.0x the neocloud bill at 85% duty.",
  "sovereign": false,
  "selfHost": { "basis": "own", "gpus": 5, "vramGB": 182, "capexUSD": 185000, "monthlyUSD": 142560, "per1MUSD": 1.94,
                "breakEvenDuty": null, "rent": {"monthlyUSD": 208800, "per1MUSD": 2.84}, "own": {"monthlyUSD": 142560, "per1MUSD": 1.94} },
  "neocloud": { "per1MUSD": 0.64, "livePrice": true, "monthlyUSD": 47001 },
  "pricesAsOf": "2026-07-07",
  "caveats": ["Throughput is a heuristic ...", "Neocloud prices fall ~10x/year ...", "Different models use different tokenizers ..."]
}
```
(At neocloud's low per-token prices, the verdict is usually `neocloud` unless duty is very high or the workload is huge; `breakEvenDuty: null` means self-host never wins within 0–100% at this workload.)

**Interpreting `verdict`:**
- `neocloud` — pay-per-token is cheaper; recommend the API. (Common at low duty cycle.)
- `self-host` — sustained load high enough that fixed cost wins; `selfHost.basis` says rent or own.
- `self-host-required` — sovereignty forces self-host; `recommendation` states the cost premium.

Always surface `pricesAsOf` and the relevant `caveats` to the user; never present figures as exact.

## Other endpoints
- `GET /api/compare?limit=10&peakTokPerMin=…&dutyPct=…` — verdict + $/1M for the first N models at one workload (leaderboard style).
- `GET /api/models` — 50-model catalog with dimensions: `params`, `active` (MoE), `ctx` (context K), `license` + `commercial`, `modality`, `org`/`country`, `quality` tier, `cutoff` (knowledge cutoff), `apiPer1M`, `livePrice`.
- `GET /api/providers` — neocloud providers (DeepInfra, Together, Fireworks, Groq…) with reference $/1M.
- `GET /api/gpus` — GPU catalog (VRAM, rent $/hr, capex, power).
- `GET /api/precisions` — serving precisions.
- `GET /api/prices` — the dated live LiteLLM pricing feed.

## Guardrails for agents
- **License:** if `model.commercial` is `false`, self-hosting in a product needs a paid license — warn the user before recommending it.
- **Tokenizers differ:** the same text is a different token count per model, so cross-model `$/1M` comparisons are approximate.
- **It's a planner, not a router:** it recommends; it does not route live traffic or provision anything.
- Numbers are **directional** (throughput heuristic, prices dated). Do not present as precise quotes.

## Human UI
The same engine powers an interactive site (3D self-host-vs-neocloud-over-time view, break-even, sovereignty premium, 50-model catalog) at the base URL.
