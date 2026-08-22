// THE SOURCE REGISTRY — single source of truth for where every number comes from.
//
// Both the Sources tab and GET /api/sources render from this list, so the public
// provenance claim and the machine-readable one cannot drift apart.
//
// Positioning, stated plainly because the tab states it publicly: this tool does
// not generate data. It aggregates public feeds and published figures, and its
// contribution is the *dimensions* — turning scattered per-token prices, GPU
// rental rates and hardware specs into a single comparable question. That is a
// presentation wedge, not a data moat, and pretending otherwise would fail the
// standard this page exists to hold everyone else to.
//
// `confidence` is deliberately blunt:
//   measured  — fetched from a dated feed; we can point at the exact record
//   derived   — computed by us from a dated feed; method is published here
//   published — a real figure from a named third party, but not machine-fetched
//   estimate  — our own judgement. The weakest class; never presented as fact.

export const SOURCE_LAYERS = [
  {
    id: 'model-prices',
    layer: 'Model API prices',
    what: 'Per-token input, output and cache-read rates for every model in the catalog.',
    source: 'LiteLLM — model_prices_and_context_window.json',
    url: 'https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json',
    how: 'Fetched server-side (no CORS), cached 6h, normalized to $/1M tokens. Falls back to a bundled dated snapshot if the feed is unreachable, and says so.',
    confidence: 'measured',
    refresh: 'every 6 hours',
    limitation: 'Published list prices only — excludes negotiated enterprise rates, committed-use discounts and free tiers.',
    usedFor: ['Every API cost figure', 'the frontier comparison', 'the mix planner']
  },
  {
    id: 'provider-spread',
    layer: 'Provider price spread',
    what: 'The min / median / max rate across every provider serving the same open model.',
    source: 'Derived from the LiteLLM feed',
    url: 'https://github.com/BerriAI/litellm',
    how: 'Each catalog model is matched against all serving providers; the median becomes the headline price and the full range is shown. Matched keys are returned in the API so you can check the sample.',
    confidence: 'derived',
    refresh: 'every 6 hours',
    limitation: 'Hyperscaler managed offerings are excluded from the open-model sample — they publish one price per region, which would swamp the median.',
    usedFor: ['The spread shown under every verdict', 'price sanity-checking']
  },
  {
    id: 'gpu-rental',
    layer: 'GPU rental prices',
    what: 'Live $/GPU-hour for each card in the hardware catalog, as a min / median / max.',
    source: 'Vast.ai public marketplace API',
    url: 'https://vast.ai/',
    how: 'One query per GPU model for currently-rentable offers; bundle prices are divided by GPU count to give a true per-GPU rate. Cached 6h.',
    confidence: 'measured',
    refresh: 'every 6 hours',
    limitation: 'Community/spot capacity — the median sits BELOW contracted neocloud and hyperscaler pricing for the same card. Use the upper end of the spread if you are buying enterprise capacity.',
    usedFor: ['Self-host rental cost', 'the rent-vs-own comparison']
  },
  {
    id: 'price-history',
    layer: 'Price history & decline rate',
    what: '19 monthly observations of the whole price file, and the two decline rates derived from them.',
    source: 'Git history of the LiteLLM price file',
    url: 'https://github.com/BerriAI/litellm/commits/main/model_prices_and_context_window.json',
    how: 'Historical commits are fetched, normalized with the same code path as the live feed, and resolved through the same matcher — so a point in the series means the same thing as today’s number. Re-runnable via server/backfill-history.js.',
    confidence: 'derived',
    refresh: 'on demand (backfill script)',
    limitation: 'Some matchers span model generations, so a few individual series compare successive releases rather than one frozen model. The fixed basket is the reliable signal, not any single row.',
    usedFor: ['The measured decline rate', 'the sovereignty projection', 'replacing the unsupported “~10×/year” claim']
  },
  {
    id: 'openrouter',
    layer: 'Serving precision, uptime & jurisdiction',
    what: 'Which precision each provider actually serves a model at, their observed uptime, and where they are headquartered.',
    source: 'OpenRouter public API',
    url: 'https://openrouter.ai/docs/api-reference/overview',
    how: 'A weekly batch pulls the model list, the provider list and per-provider endpoint detail into a committed snapshot. The server only ever reads that snapshot, so the site keeps working when OpenRouter is unreachable.',
    confidence: 'measured',
    refresh: 'weekly (automated)',
    limitation: 'Throughput and latency exist in their schema but are null without an API key, so this does NOT close the measured-throughput gap. Uptime is as observed for traffic routed through their gateway, not a provider SLA.',
    usedFor: ['Like-for-like precision comparison', 'the second-source price cross-check', 'provider jurisdiction']
  },
  {
    id: 'cross-check',
    layer: 'Second-source price agreement',
    what: 'Whether two independent price feeds agree on what a model costs.',
    source: 'LiteLLM feed vs OpenRouter, compared by us',
    url: 'https://openrouter.ai/',
    how: 'Both medians are computed for the same model and the ratio reported. Disagreement beyond 1.5x is flagged in the verdict rather than averaged away.',
    confidence: 'derived',
    refresh: 'weekly (bounded by the OpenRouter snapshot)',
    limitation: 'The two feeds sample different provider sets, so some disagreement is expected. A large gap means the price is uncertain — not that one feed is wrong.',
    usedFor: ['Confidence flag on every model price']
  },
  {
    id: 'gpu-capex',
    layer: 'GPU purchase price & node cost',
    what: 'Street purchase price per card, plus the rest of the node attributable per GPU (CPU, RAM, chassis, NIC, storage).',
    source: 'Vendor and reseller street pricing',
    url: 'https://www.cloudzero.com/blog/h100-gpu-cost/',
    how: 'Dated constants, reviewed against public price guides. There is no open feed for hardware purchase prices, so this layer is not live and is labelled as a constant everywhere it appears.',
    confidence: 'published',
    refresh: 'manual, dated',
    limitation: 'Purchase prices vary hugely by volume, region and vendor relationship. Node cost is an allocation, not a quote.',
    usedFor: ['Owned-hardware capex', 'payback period']
  },
  {
    id: 'model-specs',
    layer: 'Model specifications',
    what: 'Parameter count, MoE active params, context window, licence, release year and knowledge cutoff.',
    source: 'Model cards, provider documentation and release announcements',
    url: 'https://huggingface.co/models',
    how: 'Hand-maintained per model and refreshed against the live feed — an entry is only priced from a feed key for the SAME model, so when the feed moves to a newer generation the catalog entry is refreshed rather than priced off its successor.',
    confidence: 'published',
    refresh: 'manual, per catalog review',
    limitation: 'A hand-maintained table goes stale between reviews. Knowledge cutoffs in particular are often unpublished and are best-effort.',
    usedFor: ['VRAM sizing', 'licence warnings', 'the mix planner’s candidate filter']
  },
  {
    id: 'throughput',
    layer: 'Serving throughput (tokens/sec)',
    what: 'How fast a model serves on a given GPU — which sets how many GPUs you need.',
    source: 'Our own heuristic, in the spirit of selfhostllm and gpu_poor',
    url: 'https://github.com/RahulSChand/gpu_poor',
    how: 'A step function on active parameter count, scaled by GPU class, precision and a sub-linear multi-GPU factor.',
    confidence: 'estimate',
    refresh: 'not applicable',
    limitation: 'NOT MEASURED. Real throughput swings widely with batch size, context length, quantization and serving engine (vLLM/SGLang/TGI). Tools like APXML model this from memory bandwidth; Artificial Analysis measures it end-to-end. We do neither. Treat every GPU count and break-even as a ballpark.',
    usedFor: ['GPU count', 'self-host $/1M', 'every break-even']
  },
  {
    id: 'capability',
    layer: 'Capability tier',
    what: 'The coarse 1–4 bucket used to decide which models clear a quality bar.',
    source: 'Editorial, informed by public benchmark reporting',
    url: 'https://artificialanalysis.ai/',
    how: 'Assigned by hand from published benchmark results and provider positioning.',
    confidence: 'estimate',
    refresh: 'manual, dated',
    limitation: 'NOT A BENCHMARK SCORE, and the only number here without a dated feed behind it. The industry reference (Artificial Analysis Intelligence Index) is not openly redistributable, and the open HuggingFace leaderboard is archived and covers no closed models — so nothing available ranks this catalog end to end. Treat a one-tier gap as noise.',
    usedFor: ['The mix planner’s quality bar', 'catalog sorting']
  },
  {
    id: 'data-control',
    layer: 'Data-control options (ZDR, dedicated, in-region)',
    what: 'What each rung of data control gives you, and roughly what it costs relative to the standard per-token price.',
    source: 'Provider policies and documentation',
    url: 'https://openrouter.ai/docs/features/privacy-and-logging',
    how: 'Editorial summary, dated and reviewed. No feed publishes ZDR availability or terms in machine-readable form, so this layer cannot be fetched — provider privacy-policy URLs are pulled live from OpenRouter and linked so you can check the actual terms.',
    confidence: 'published',
    refresh: 'manual, dated',
    limitation: 'ZDR terms differ materially between providers, and between self-serve and negotiated agreements. This is a map of the options, not a compliance opinion — read the policy for the provider you would actually use.',
    usedFor: ['The walled-garden premium', 'the sovereignty decision']
  },
  {
    id: 'operating-costs',
    layer: 'Power, space & staffing',
    what: 'Electricity $/kWh, datacentre PUE, colocation $/kW·month, and the engineer-time cost of running a serving stack.',
    source: 'Public energy statistics and colocation market ranges',
    url: 'https://www.eia.gov/electricity/',
    how: 'Defaults you can edit. Every one is exposed as an input rather than buried as a constant.',
    confidence: 'published',
    refresh: 'manual, dated',
    limitation: 'Single global defaults — electricity and colo pricing vary enormously by region. Staffing cost is a placeholder for your real team cost, and it is the figure most calculators omit entirely.',
    usedFor: ['Owned-hardware opex', 'the sovereign cost stack']
  },
  {
    id: 'routing',
    layer: 'Routing split defaults',
    what: 'How much of a workload is “hard” enough to need the strong tier, per task type.',
    source: 'Published routing research (RouteLLM and successors)',
    url: 'https://github.com/lm-sys/RouteLLM',
    how: 'Starting points for the split slider, chosen from reported production mixes and routing papers.',
    confidence: 'published',
    refresh: 'manual, dated',
    limitation: 'Directional defaults, not a measurement of YOUR traffic. Reported hard-shares span roughly 14–40% depending on task and router. Routing cost itself is not modelled at all.',
    usedFor: ['The mix planner’s default split']
  },
  {
    id: 'discounts',
    layer: 'Cache & batch discounts',
    what: 'Prompt-cache read rates and the batch-API discount.',
    source: 'Provider published rates (via the LiteLLM feed) + provider documentation',
    url: 'https://platform.openai.com/docs/guides/batch',
    how: 'Cache-read prices come from the feed where a provider publishes one; where none exists we assume 10% of the input rate and flag it. Batch is modelled as a flat 50%, the rate the major providers converged on.',
    confidence: 'measured',
    refresh: 'every 6 hours',
    limitation: 'Cache modelling is simple: input tokens only, no cache-WRITE premium and no TTL expiry. Real savings depend on how much of your prompt is genuinely reused.',
    usedFor: ['Effective API rate', 'the discount sliders']
  }
]

// Things we deliberately do NOT have. Listed publicly because a transparency page
// that only lists strengths is marketing.
export const KNOWN_GAPS = [
  {
    gap: 'Measured throughput',
    detail: 'Nobody publishes self-host tokens/sec per GPU as an open feed. Artificial Analysis measures per-provider API speed; APXML models memory bandwidth. Closing this means benchmarking on real hardware — the single biggest quality gap in this tool.'
  },
  {
    gap: 'A benchmark-backed capability score',
    detail: 'Would require licensing Artificial Analysis, or running a fixed eval suite in-house for every model in the catalog.'
  },
  {
    gap: 'Enterprise and contracted GPU pricing',
    detail: 'The live rental feed is a community marketplace. Contracted neocloud and hyperscaler rates are not openly published, so the upper end of the spread is the best proxy we can show.'
  },
  {
    gap: 'Your actual traffic',
    detail: 'Every workload figure is something you typed. Importing real usage from a gateway or observability tool (LiteLLM, Helicone, Langfuse) would ground the whole calculation — and no planning tool in this space does it yet.'
  },
  {
    gap: 'Regional cost variation',
    detail: 'Electricity, colocation and salary defaults are single global figures. They are editable, but they are not localised.'
  }
]

// Upstream projects this tool stands on, credited by name.
export const CREDITS = [
  { name: 'LiteLLM', url: 'https://github.com/BerriAI/litellm', for: 'the open price feed this entire tool depends on' },
  { name: 'Vast.ai', url: 'https://vast.ai/', for: 'a public GPU marketplace API with no auth wall' },
  { name: 'Artificial Analysis', url: 'https://artificialanalysis.ai/', for: 'the reference standard for measured model speed and capability' },
  { name: 'gpu_poor / selfhostllm', url: 'https://github.com/RahulSChand/gpu_poor', for: 'the VRAM and throughput heuristics this borrows from' },
  { name: 'RouteLLM', url: 'https://github.com/lm-sys/RouteLLM', for: 'the routing research behind the mix planner’s defaults' },
  { name: 'simonw/llm-prices', url: 'https://github.com/simonw/llm-prices', for: 'demonstrating that dated price validity ranges matter' }
]

export const CONFIDENCE_META = {
  measured: { label: 'Measured', note: 'Fetched from a dated feed — we can point at the exact record.' },
  derived: { label: 'Derived', note: 'Computed by us from a dated feed; the method is published above.' },
  published: { label: 'Published', note: 'A real figure from a named third party, but not machine-fetched.' },
  estimate: { label: 'Estimate', note: 'Our own judgement. The weakest class — never present it as fact.' }
}
