# PRD: LLM Token Budget & Local-vs-Cloud TCO Planner (MVP)

**Document type:** Build brief for an AI coding agent (Claude Code / Cowork)
**Status:** v0.1 — MVP scope
**Owner:** Hari
**One-line:** A planner that turns a workload goal into a recommended model mix and a local-vs-cloud TCO comparison with break-even, grounded in live community pricing data.

---

## 1. Problem & why this tool

Every existing token tool does *one* of these and stops:
- API per-token calculators (dozens: llm-prices.com, LLM Price Check, Helicone's tool) — price tables only.
- Self-host TCO calculators (BenchLM, SitePoint, NavyaAI, Kenodo) — single model vs. single API, no goal input, no mix.
- Gateways/observability (OpenRouter, LiteLLM, Langfuse, Helicone) — track spend *after* you build, don't help you *plan*.

**Nobody connects the three.** The unmet need: given a workload goal, recommend *which models to use* (a mix, not one), *how much it costs on API*, *whether to self-host any of them*, and *the break-even*. This MVP builds exactly that integrated path and nothing more.

## 2. Goal & non-goals

**Goal:** Ship a working web tool where a user enters a workload, picks a quality bar, and gets (a) a recommended model mix with blended monthly cost, and (b) a per-model local-vs-cloud TCO + break-even comparison.

**Non-goals for MVP (explicitly deferred):**
- Real measured throughput benchmarks (use published heuristics + clear confidence caveats).
- Live "connect your usage" import from LiteLLM/Helicone/Langfuse.
- Dated price-history / scenario modeling ("if prices drop 30%").
- User accounts, saved plans, multi-user, billing.
- Quality-vs-cost *automated* routing (we *recommend* a split; we don't route live traffic).

## 3. Target user

Primary: a technical PM or founding engineer deciding architecture + budget *before* building. Secondary (later): FinOps/platform teams. Build for the primary only.

## 4. Core user flow

1. **Define workload** — daily requests, avg input tokens, avg output tokens, task type (chatbot / RAG / batch / agentic), and a quality bar (e.g., "≥ mid-tier", "frontier required").
2. **Get the mix** — tool proposes a split: a cheap/small model for the easy majority of traffic (e.g., 70%) and a stronger model for the hard remainder, with a blended $/month. User can adjust the split %.
3. **See local-vs-cloud** — for each model in the mix, show API cost vs. self-host TCO (rent-or-own GPU, electricity, utilization, overhead) and the break-even in tokens/day.
4. **Read the verdict** — a plain-language recommendation per tier ("self-host the bulk model above ~X tokens/day; keep the frontier tier on API").

## 5. Functional requirements

### 5.1 Pricing data (do NOT build a scraper)
- Source API prices from **LiteLLM's `model_prices_and_context_window.json`** as the primary feed; supplement with **OpenRouter `/models` API** for multi-provider live rates. Both are reusable open feeds.
- Cache locally; refresh on a schedule (LiteLLM's pattern is ~every 6h). Show a "prices as of <date>" stamp on every result.
- Cover at minimum: OpenAI, Anthropic, Google Gemini, and major open-weight models served via API (DeepSeek, Llama, Qwen, Mistral).

### 5.2 Cost math (API side)
- Per-model monthly cost = (daily input tokens × in-price + daily output tokens × out-price) × 30, with input/output priced separately per the feed.
- Blended mix cost = sum across tiers weighted by the split %.

### 5.3 Model-mix recommendation
- Map the quality bar + task type to a candidate model set (a simple rules table is fine for MVP; document the mapping).
- Default split: route the "easy" share to the cheapest candidate meeting the bar, the "hard" share to the strongest. Make the split a user-editable slider. (Reference point: published routing work like RouteLLM reports large cost cuts by sending only the hard minority of queries to the strong model — use that as the design rationale, not as a hard dependency.)

### 5.4 Local-vs-cloud TCO engine
Inputs (with sensible defaults, all editable): GPU choice, rent-vs-own, GPU $/hr or purchase price, amortization period (default 36–48mo), utilization % (default ~70%), tokens/sec throughput, power draw + PUE (default ~1.3) + $/kWh, overhead % (default ~20%).
- For VRAM-fit and throughput estimation, reuse logic/heuristics from open tools (e.g., `erans/selfhostllm`, `RahulSChand/gpu_poor`) rather than inventing it.
- Self-host $/1M tokens = monthly TCO ÷ monthly tokens (millions).
- **Break-even** = hardware capex ÷ (monthly API cost − monthly self-host opex); also express as a tokens/day threshold.
- Run this **per model in the mix**, so output is tier-by-tier, not one global number.

### 5.5 Output / verdict
- Side-by-side: API monthly, self-host monthly, break-even tokens/day, and a winner per tier at the user's current volume.
- Plain-language summary line per tier.

## 6. Non-functional requirements
- **Stack:** single-page web app; client-side calc where possible. (If built as a Claude artifact: React, in-memory state only — no localStorage/sessionStorage.)
- **Transparency:** every number traceable to an input or the dated price feed; no hidden constants. Show the formulas on demand.
- **Resilience to stale data:** never display a price without its as-of date.
- **Speed:** all calculations instant/client-side after the price feed loads.

## 7. Data sources to wire in
| Purpose | Source |
|---|---|
| API price map (primary) | LiteLLM `model_prices_and_context_window.json` |
| Live multi-provider rates | OpenRouter `/models` API |
| Price metadata / cross-check | models.dev, simonw/llm-prices |
| VRAM + throughput heuristics | erans/selfhostllm, RahulSChand/gpu_poor |

## 8. Explicit assumptions & caveats to surface in the UI
- All per-token prices move fast (LLMflation: inference cost has fallen roughly 10x/year) — display the as-of date and treat figures as directional.
- Throughput (tokens/sec) is highly conditional on batch size, context length, quantization, and engine; MVP uses heuristic estimates with a visible confidence caveat.
- Many public break-even numbers come from vendors with an interest in the answer; this tool shows its math so users can check it.

## 9. Acceptance criteria (definition of done)
1. User can enter a workload + quality bar and receive a recommended model mix with a blended monthly $ figure.
2. The split between tiers is user-adjustable and recomputes instantly.
3. For each model in the mix, the tool shows API cost, self-host TCO, and break-even in tokens/day.
4. All prices carry a visible as-of date sourced from a real feed (not hardcoded).
5. A plain-language per-tier verdict is shown.
6. No price or throughput number appears without its caveat/confidence note.

## 10. Out of scope → next iterations (don't lose these)
- Measured throughput benchmark dataset (the real long-term moat).
- "Connect your usage" import from observability tools to ground planning in real traffic.
- Price-history + scenario modeling.
- Accounts, saved plans, sharing.

---

### Prompt to hand Claude alongside this PRD
> "Build the MVP described in this PRD as a single-page React app. Start by wiring the LiteLLM price feed and OpenRouter `/models` API with a dated cache. Implement the workload→mix→TCO→verdict flow in section 4. Use the data sources in section 7 and reuse the open self-host heuristics rather than inventing throughput math. Meet every acceptance criterion in section 9. Surface all caveats from section 8 in the UI. Ask me before adding anything from section 10."
