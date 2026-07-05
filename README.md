# Token TCO Planner (beta)

Turn a workload goal into a **recommended model mix** and a **local-vs-cloud TCO
comparison with break-even**, grounded in a live community price feed.

The only planner that connects the three things existing tools do separately:
which models to use (a mix, not one), what it costs on API, and whether to
self-host any tier — with the math shown.

## What it does

1. **Define workload** — daily requests, avg input/output tokens, task type,
   quality bar, and (advanced) agentic calls-per-task, caching %, batch %.
2. **Get the mix** — a cheap bulk model for the easy majority + a stronger model
   for the hard minority, with a blended $/month and an adjustable split slider.
3. **Local-vs-cloud, per tier** — API cost vs. self-host TCO (rent/own GPU,
   power, utilization, overhead, ops labor, HA) and break-even in tokens/day,
   including the **idle-cliff** ($/token at your volume vs. at full load).
4. **LLMflation scenario** — project falling API prices against fixed self-host
   opex to see whether hardware still pays off.

Differentiators vs. the field: honest self-host TCO (labor/HA/idle cliff),
caching & batch discount modeling, an agentic calls-per-task multiplier, and the
LLMflation drift scenario — none of which the single-column calculators do.

## Data

- **Primary feed:** LiteLLM `model_prices_and_context_window.json`, fetched
  server-side (no CORS), cached 6h, normalized to $/1M tokens.
- **Fallback:** a bundled dated snapshot (`server/snapshot.json`) so the tool
  never shows a blank. Every result carries a visible **prices-as-of** date.

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

## Caveats (also shown in the UI)

Prices move fast (~10×/year); throughput is heuristic, not measured; caching is
modeled simply (no write-premium/TTL). Every number traces to an input or the
dated feed. Not financial advice.
