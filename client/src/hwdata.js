import { resolvePrice } from './pricing.js'

// Model → hardware footprint → cost → throughput → break-even database.
// All numbers are directional (mid-2026) and every derived value is computed in
// hwcalc.js from these inputs so the math is transparent. Sources of the raw
// inputs: model param counts (model cards), GPU specs/pricing (cloud rental
// marketplaces — RunPod/Vast/Lambda ranges). Throughput is NO LONGER a heuristic:
// it is fitted to third-party vLLM serving benchmarks in throughput.js, which
// carries its own anchors, exponents and known blind spots.

// GPU catalog.
//   rentHr      = FALLBACK $/hr, used only when the live Vast.ai feed is
//                 unreachable. Live prices (min/median/max) come from
//                 server/gpuprices.js and carry their own as-of date.
//   capex       = street purchase price. NO open feed exists for this, so it
//                 stays a dated constant — see CAPEX_AS_OF below. Do not present
//                 it as live.
//   nodePerGpu  = rest of the node attributable per GPU (CPU + system RAM +
//                 chassis + NIC + storage) — the cost GPU-only calculators omit.
export const CAPEX_AS_OF = '2026-07'

// PROVENANCE OF THE CAPABILITY TIER.
//
// Every other number in this tool now traces to a dated feed. `quality` does not,
// and pretending otherwise would be the exact failure this project exists to call
// out — so it is labelled instead.
//
// Why there is no feed: the industry reference is Artificial Analysis's
// Intelligence Index, which is not openly redistributable. The HuggingFace Open
// LLM Leaderboard is open but archived (its newest entries are Qwen-2.5-era,
// it is dominated by community fine-tunes, and it covers no closed models), so it
// cannot rank a catalog that spans DeepSeek V4, GLM-5.2 and Claude side by side.
//
// What `quality` therefore is: a coarse 1–4 editorial bucket, assigned from public
// benchmark reporting and provider positioning at the date below. It is adequate
// for "is this model in the right league for the job" — which is all the mix
// planner asks of it — and inadequate as a capability claim. Treat a one-tier gap
// as noise; validate on your own traffic before trusting a routing split.
export const QUALITY_BASIS = {
  scale: '1 = small, 2 = mid, 3 = strong, 4 = frontier',
  basis: 'editorial',
  asOf: '2026-07',
  sources: ['public benchmark reporting', 'provider positioning', 'Artificial Analysis Intelligence Index (referenced, not redistributed)'],
  notMeasured: true,
  limitation: 'Not a benchmark score. No open, current leaderboard spans both open-weight and closed models, so this axis is the one number in the tool without a dated feed behind it.',
  wouldFixIt: 'A licensed Artificial Analysis feed, or running a fixed eval suite in-house per model.'
}
export const GPUS = [
  { id: 'rtx4090', name: 'RTX 4090',   vram: 24,  rentHr: 0.34, capex: 1900,  nodePerGpu: 1500, powerW: 450 },
  { id: 'l40s',    name: 'L40S',       vram: 48,  rentHr: 0.63, capex: 9500,  nodePerGpu: 6000, powerW: 350 },
  { id: 'a100',    name: 'A100 80GB',  vram: 80,  rentHr: 0.83, capex: 16000, nodePerGpu: 8000, powerW: 400 },
  { id: 'h100',    name: 'H100 80GB',  vram: 80,  rentHr: 2.40, capex: 28000, nodePerGpu: 9000, powerW: 700 },
  { id: 'h200',    name: 'H200 141GB', vram: 141, rentHr: 4.21, capex: 34000, nodePerGpu: 9000, powerW: 700 },
  { id: 'b200',    name: 'B200 180GB', vram: 180, rentHr: 6.69, capex: 52000, nodePerGpu: 11000, powerW: 1000 }
]

// Apply the live GPU feed over the fallback constants. Returns a NEW array so
// callers can't accidentally mutate the catalog; every GPU carries where its
// rent figure came from, so the UI can badge live vs constant the same way it
// does for model prices.
export function pricedGpus(gpuFeed, { tier = 'median' } = {}) {
  return GPUS.map((g) => {
    const live = gpuFeed?.gpus?.[g.id]
    if (live && live[tier] > 0) {
      return { ...g, rentHr: live[tier], rentSource: 'live', rentSpread: live, rentAsOf: gpuFeed.asOf }
    }
    return { ...g, rentSource: 'constant', rentSpread: null, rentAsOf: CAPEX_AS_OF }
  })
}

// Open-weight models worth self-hosting, refreshed against the live feed (2026).
// Fields users care about:
//   params  = total size (B)            active = MoE active params (B, drives compute)
//   ctx     = context window (K tokens)  license/commercial = self-host legal freedom
//   modality= text|vision|code|reasoning|multilingual|RAG   quality = coarse 1-4 tier
//   apiPer1M= FALLBACK blended $/1M, used only when the model has no live feed match.
//             Live models get real in/out rates from pricing.js instead.
//   org/country matter for sovereignty. year = release.
// HOW THE LIST WAS CHOSEN (editorial, directional — see Catalog view for the note):
//   filter: open, downloadable weights only (no GPT/Claude/Gemini — those are the
//   frontier baseline in pricing.js). Selected & ordered by a blend of (a) capability
//   tier, (b) adoption / neocloud availability, (c) recency, (d) coverage across sizes
//   and use-cases so the list is useful, not 50 of one family.
// STALENESS RULE: an entry is only priced from a feed key for the SAME model. Where
//   the feed has moved on to a newer generation (e.g. it serves GLM-5.x, not GLM-4 9B),
//   we refresh the entry rather than price a 2024 model off its 2026 successor.
export const MODELS = [
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4-Pro',   org: 'DeepSeek', country: 'CN', params: 1600,active: 49,  ctx: 1000,  license: 'MIT',        commercial: true,  modality: 'text',      quality: 4, apiPer1M: 0.60, tag: 'frontier MoE',   year: 2026 },
  { id: 'kimi-k2.6',       label: 'Kimi K2.6',         org: 'Moonshot', country: 'CN', params: 1000,active: 32,  ctx: 256,   license: 'Modified MIT',commercial: true, modality: 'text',      quality: 4, apiPer1M: 1.70, tag: 'frontier MoE',   year: 2026 },
  { id: 'glm-5.2',         label: 'GLM-5.2',           org: 'Zhipu',    country: 'CN', params: 753, active: 40,  ctx: 1000,  license: 'MIT',        commercial: true,  modality: 'text',      quality: 4, apiPer1M: 2.15, tag: 'frontier MoE',   year: 2026 },
  { id: 'mistral-large-3', label: 'Mistral Large 3',   org: 'Mistral',  country: 'FR', params: 675, active: 41,  ctx: 256,   license: 'Apache-2.0', commercial: true,  modality: 'vision',    quality: 4, apiPer1M: 0.75, tag: 'frontier MoE',   year: 2025 },
  { id: 'qwen3-coder-480b',label: 'Qwen3-Coder 480B',  org: 'Alibaba',  country: 'CN', params: 480, active: 35,  ctx: 256,   license: 'Apache-2.0', commercial: true,  modality: 'code',      quality: 4, apiPer1M: 0.70, tag: 'agentic coding', year: 2025 },
  { id: 'minimax-m3',      label: 'MiniMax M3',        org: 'MiniMax',  country: 'CN', params: 428, active: 23,  ctx: 1000,  license: 'MiniMax Community', commercial: false, modality: 'text', quality: 4, apiPer1M: 0.53, tag: 'long-context MoE',year: 2026 },
  { id: 'deepseek-v4-flash',label:'DeepSeek V4-Flash', org: 'DeepSeek', country: 'CN', params: 284, active: 13,  ctx: 1000,  license: 'MIT',        commercial: true,  modality: 'text',      quality: 3, apiPer1M: 0.25, tag: 'efficient MoE',  year: 2026 },
  { id: 'deepseek-v3',     label: 'DeepSeek V3.2',     org: 'DeepSeek', country: 'CN', params: 671, active: 37,  ctx: 128,   license: 'MIT',        commercial: true,  modality: 'text',      quality: 4, apiPer1M: 0.55, tag: 'frontier MoE',   year: 2025 },
  { id: 'deepseek-r1',     label: 'DeepSeek R1',       org: 'DeepSeek', country: 'CN', params: 671, active: 37,  ctx: 128,   license: 'MIT',        commercial: true,  modality: 'reasoning', quality: 4, apiPer1M: 1.20, tag: 'reasoning',      year: 2025 },
  { id: 'qwen3-235b',      label: 'Qwen3 235B',        org: 'Alibaba',  country: 'CN', params: 235, active: 22,  ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'reasoning', quality: 4, apiPer1M: 0.70, tag: 'frontier MoE',   year: 2025 },
  { id: 'nemotron-3-super',label: 'Nemotron 3 Super',  org: 'Nvidia',   country: 'US', params: 120, active: 12,  ctx: 128,   license: 'NVIDIA Open',commercial: true,  modality: 'reasoning', quality: 3, apiPer1M: 0.41, tag: 'hybrid MoE',     year: 2026 },
  { id: 'gpt-oss-120b',    label: 'gpt-oss-120b',      org: 'OpenAI',   country: 'US', params: 117, active: 5.1, ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'reasoning', quality: 3, apiPer1M: 0.26, tag: 'open-weight MoE',year: 2025 },
  { id: 'qwen3-next-80b',  label: 'Qwen3-Next 80B',    org: 'Alibaba',  country: 'CN', params: 80,  active: 3,   ctx: 256,   license: 'Apache-2.0', commercial: true,  modality: 'reasoning', quality: 3, apiPer1M: 0.41, tag: 'ultra-sparse MoE',year: 2025 },
  { id: 'llama4-maverick', label: 'Llama 4 Maverick',  org: 'Meta',     country: 'US', params: 400, active: 17,  ctx: 1000,  license: 'Llama',      commercial: true,  modality: 'vision',    quality: 3, apiPer1M: 0.60, tag: 'multimodal MoE', year: 2025 },
  { id: 'llama-405b',      label: 'Llama 3.1 405B',    org: 'Meta',     country: 'US', params: 405, active: 405, ctx: 128,   license: 'Llama',      commercial: true,  modality: 'text',      quality: 4, apiPer1M: 3.00, tag: 'dense frontier', year: 2024 },
  { id: 'dbrx',            label: 'DBRX',              org: 'Databricks',country:'US', params: 132, active: 36,  ctx: 32,    license: 'Databricks', commercial: true,  modality: 'text',      quality: 2, apiPer1M: 0.60, tag: 'MoE',            year: 2024 },
  { id: 'command-r-plus',  label: 'Command R+',        org: 'Cohere',   country: 'CA', params: 104, active: 104, ctx: 128,   license: 'CC-BY-NC',   commercial: false, modality: 'RAG',       quality: 3, apiPer1M: 0.90, tag: 'RAG',            year: 2024 },
  { id: 'qwen-72b',        label: 'Qwen 2.5 72B',      org: 'Alibaba',  country: 'CN', params: 72,  active: 72,  ctx: 128,   license: 'Qwen',       commercial: true,  modality: 'text',      quality: 3, apiPer1M: 0.80, tag: 'dense',          year: 2024 },
  { id: 'llama-70b',       label: 'Llama 3.3 70B',     org: 'Meta',     country: 'US', params: 70,  active: 70,  ctx: 128,   license: 'Llama',      commercial: true,  modality: 'text',      quality: 3, apiPer1M: 0.65, tag: 'dense',          year: 2024 },
  { id: 'nemotron-70b',    label: 'Nemotron 70B',      org: 'Nvidia',   country: 'US', params: 70,  active: 70,  ctx: 128,   license: 'Llama',      commercial: true,  modality: 'text',      quality: 3, apiPer1M: 0.70, tag: 'aligned',        year: 2024 },
  { id: 'gemma4-31b',      label: 'Gemma 4 31B',       org: 'Google',   country: 'US', params: 31,  active: 31,  ctx: 256,   license: 'Apache-2.0', commercial: true,  modality: 'vision',    quality: 3, apiPer1M: 0.57, tag: 'multimodal dense',year: 2026 },
  { id: 'gpt-oss-20b',     label: 'gpt-oss-20b',       org: 'OpenAI',   country: 'US', params: 21,  active: 3.6, ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'reasoning', quality: 2, apiPer1M: 0.23, tag: 'edge MoE',       year: 2025 },
  { id: 'yi-34b',          label: 'Yi-1.5 34B',        org: '01.AI',    country: 'CN', params: 34,  active: 34,  ctx: 32,    license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 2, apiPer1M: 0.40, tag: 'dense',          year: 2024 },
  { id: 'mixtral-8x22b',   label: 'Mixtral 8x22B',     org: 'Mistral',  country: 'FR', params: 141, active: 39,  ctx: 64,    license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 3, apiPer1M: 0.90, tag: 'MoE',            year: 2024 },
  { id: 'llama4-scout',    label: 'Llama 4 Scout',     org: 'Meta',     country: 'US', params: 109, active: 17,  ctx: 10000, license: 'Llama',      commercial: true,  modality: 'vision',    quality: 3, apiPer1M: 0.30, tag: 'long-context MoE',year: 2025 },
  { id: 'qwen3-32b',       label: 'Qwen3 32B',         org: 'Alibaba',  country: 'CN', params: 32,  active: 32,  ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'reasoning', quality: 3, apiPer1M: 0.30, tag: 'hybrid reasoning',year: 2025 },
  { id: 'qwen-32b',        label: 'Qwen 2.5 32B',      org: 'Alibaba',  country: 'CN', params: 32,  active: 32,  ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 3, apiPer1M: 0.30, tag: 'dense',          year: 2024 },
  { id: 'qwen-coder-32b',  label: 'Qwen2.5 Coder 32B', org: 'Alibaba',  country: 'CN', params: 32,  active: 32,  ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'code',      quality: 3, apiPer1M: 0.30, tag: 'coding',         year: 2024 },
  { id: 'deepseek-coder-v2',label:'DeepSeek-Coder V2', org: 'DeepSeek', country: 'CN', params: 236, active: 21,  ctx: 128,   license: 'DeepSeek',   commercial: true,  modality: 'code',      quality: 3, apiPer1M: 0.30, tag: 'coding MoE',      year: 2024 },
  { id: 'qwq-32b',         label: 'QwQ 32B',           org: 'Alibaba',  country: 'CN', params: 32,  active: 32,  ctx: 32,    license: 'Apache-2.0', commercial: true,  modality: 'reasoning', quality: 3, apiPer1M: 0.30, tag: 'reasoning',      year: 2025 },
  { id: 'gemma3-27b',      label: 'Gemma 3 27B',       org: 'Google',   country: 'US', params: 27,  active: 27,  ctx: 128,   license: 'Gemma',      commercial: true,  modality: 'vision',    quality: 3, apiPer1M: 0.30, tag: 'multimodal',     year: 2025 },
  { id: 'command-r',       label: 'Command R',         org: 'Cohere',   country: 'CA', params: 35,  active: 35,  ctx: 128,   license: 'CC-BY-NC',   commercial: false, modality: 'RAG',       quality: 2, apiPer1M: 0.30, tag: 'RAG',            year: 2024 },
  { id: 'mistral-small-3', label: 'Mistral Small 3',   org: 'Mistral',  country: 'FR', params: 24,  active: 24,  ctx: 32,    license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 2, apiPer1M: 0.20, tag: 'efficient',      year: 2025 },
  { id: 'codestral',       label: 'Codestral 22B',     org: 'Mistral',  country: 'FR', params: 22,  active: 22,  ctx: 32,    license: 'MNPL',       commercial: false, modality: 'code',      quality: 2, apiPer1M: 0.30, tag: 'coding',         year: 2024 },
  { id: 'internlm-20b',    label: 'InternLM2.5 20B',   org: 'Shanghai AI Lab',country:'CN',params:20,active:20, ctx: 256,   license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 2, apiPer1M: 0.30, tag: 'dense',          year: 2024 },
  { id: 'qwen3-30b-a3b',   label: 'Qwen3 30B-A3B',     org: 'Alibaba',  country: 'CN', params: 30,  active: 3,   ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'reasoning', quality: 3, apiPer1M: 0.20, tag: 'efficient MoE',  year: 2025 },
  { id: 'phi-4',           label: 'Phi-4 14B',         org: 'Microsoft',country: 'US', params: 14,  active: 14,  ctx: 16,    license: 'MIT',        commercial: true,  modality: 'text',      quality: 2, apiPer1M: 0.15, tag: 'small/strong',   year: 2024 },
  { id: 'qwen-14b',        label: 'Qwen 2.5 14B',      org: 'Alibaba',  country: 'CN', params: 14,  active: 14,  ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 2, apiPer1M: 0.20, tag: 'dense',          year: 2024 },
  { id: 'gemma3-12b',      label: 'Gemma 3 12B',       org: 'Google',   country: 'US', params: 12,  active: 12,  ctx: 128,   license: 'Gemma',      commercial: true,  modality: 'vision',    quality: 2, apiPer1M: 0.15, tag: 'multimodal',     year: 2025 },
  { id: 'mistral-nemo',    label: 'Mistral NeMo 12B',  org: 'Mistral',  country: 'FR', params: 12,  active: 12,  ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 2, apiPer1M: 0.15, tag: 'dense',          year: 2024 },
  { id: 'pixtral-12b',     label: 'Pixtral 12B',       org: 'Mistral',  country: 'FR', params: 12,  active: 12,  ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'vision',    quality: 2, apiPer1M: 0.15, tag: 'multimodal',     year: 2024 },
  { id: 'olmo2-13b',       label: 'OLMo 2 13B',        org: 'Ai2',      country: 'US', params: 13,  active: 13,  ctx: 4,     license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 2, apiPer1M: 0.20, tag: 'fully open',     year: 2024 },
  { id: 'falcon3-10b',     label: 'Falcon 3 10B',      org: 'TII',      country: 'AE', params: 10,  active: 10,  ctx: 32,    license: 'TII',        commercial: true,  modality: 'text',      quality: 2, apiPer1M: 0.15, tag: 'dense',          year: 2024 },
  { id: 'llama-8b',        label: 'Llama 3.1 8B',      org: 'Meta',     country: 'US', params: 8,   active: 8,   ctx: 128,   license: 'Llama',      commercial: true,  modality: 'text',      quality: 1, apiPer1M: 0.06, tag: 'edge/bulk',      year: 2024 },
  { id: 'qwen3-8b',        label: 'Qwen3 8B',          org: 'Alibaba',  country: 'CN', params: 8,   active: 8,   ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 2, apiPer1M: 0.10, tag: 'efficient',      year: 2025 },
  { id: 'qwen-7b',         label: 'Qwen 2.5 7B',       org: 'Alibaba',  country: 'CN', params: 7,   active: 7,   ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 1, apiPer1M: 0.10, tag: 'edge',           year: 2024 },
  { id: 'gemma2-9b',       label: 'Gemma 2 9B',        org: 'Google',   country: 'US', params: 9,   active: 9,   ctx: 8,     license: 'Gemma',      commercial: true,  modality: 'text',      quality: 1, apiPer1M: 0.10, tag: 'edge',           year: 2024 },
  { id: 'mistral-7b',      label: 'Mistral 7B',        org: 'Mistral',  country: 'FR', params: 7,   active: 7,   ctx: 32,    license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 1, apiPer1M: 0.10, tag: 'classic',        year: 2023 },
  { id: 'ministral-8b',    label: 'Ministral 8B',      org: 'Mistral',  country: 'FR', params: 8,   active: 8,   ctx: 128,   license: 'MRL',        commercial: false, modality: 'text',      quality: 1, apiPer1M: 0.10, tag: 'edge',           year: 2024 },
  { id: 'phi-3.5-mini',    label: 'Phi-3.5 mini',      org: 'Microsoft',country: 'US', params: 3.8, active: 3.8, ctx: 128,   license: 'MIT',        commercial: true,  modality: 'text',      quality: 1, apiPer1M: 0.08, tag: 'tiny',           year: 2024 },
  { id: 'llama-3b',        label: 'Llama 3.2 3B',      org: 'Meta',     country: 'US', params: 3,   active: 3,   ctx: 128,   license: 'Llama',      commercial: true,  modality: 'text',      quality: 1, apiPer1M: 0.06, tag: 'edge',           year: 2024 },
  { id: 'gemma3-4b',       label: 'Gemma 3 4B',        org: 'Google',   country: 'US', params: 4,   active: 4,   ctx: 128,   license: 'Gemma',      commercial: true,  modality: 'vision',    quality: 1, apiPer1M: 0.08, tag: 'tiny multimodal',year: 2025 },
  { id: 'granite-8b',      label: 'Granite 3 8B',      org: 'IBM',      country: 'US', params: 8,   active: 8,   ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 1, apiPer1M: 0.10, tag: 'enterprise',     year: 2024 },
  { id: 'starcoder2-15b',  label: 'StarCoder2 15B',    org: 'BigCode',  country: 'Intl',params: 15, active: 15,  ctx: 16,    license: 'OpenRAIL',   commercial: true,  modality: 'code',      quality: 1, apiPer1M: 0.20, tag: 'coding',         year: 2024 },
  { id: 'aya-32b',         label: 'Aya Expanse 32B',   org: 'Cohere',   country: 'CA', params: 32,  active: 32,  ctx: 128,   license: 'CC-BY-NC',   commercial: false, modality: 'multilingual',quality:2,apiPer1M: 0.30, tag: 'multilingual',  year: 2024 }
]

// Approximate TRAINING KNOWLEDGE CUTOFF per model. Many labs don't publish exact
// dates, so these are best-effort/directional — verify against the model card
// before relying on recency. Format: "Mon YYYY" where known, else year.
const CUTOFFS = {
  // 2026-generation frontier open weights.
  'deepseek-v4-pro': 'early 2026', 'deepseek-v4-flash': 'early 2026',
  'kimi-k2.6': 'early 2026', 'glm-5.2': 'early 2026', 'minimax-m3': 'early 2026',
  'mistral-large-3': 'mid 2025', 'qwen3-coder-480b': 'early 2025',
  'nemotron-3-super': 'Feb 2026', 'gpt-oss-120b': 'Jun 2024', 'gpt-oss-20b': 'Jun 2024',
  'qwen3-next-80b': 'early 2025', 'gemma4-31b': 'mid 2025',
  'deepseek-v3': 'Jul 2024', 'deepseek-r1': 'Jul 2024',
  'qwen3-235b': 'early 2025', 'llama4-maverick': 'Aug 2024',
  'llama-405b': 'Dec 2023', 'dbrx': 'Dec 2023',
  'command-r-plus': 'early 2024', 'qwen-72b': '2024',
  'llama-70b': 'Dec 2023', 'nemotron-70b': 'Dec 2023', 'yi-34b': '2024',
  'mixtral-8x22b': '2023', 'llama4-scout': 'Aug 2024', 'qwen3-32b': 'early 2025',
  'qwen-32b': '2024', 'qwen-coder-32b': '2024', 'deepseek-coder-v2': '2024',
  'qwq-32b': '2024', 'gemma3-27b': 'Aug 2024', 'gemma2-27b': '2024',
  'command-r': 'early 2024', 'mistral-small-3': '2024', 'codestral': '2024',
  'internlm-20b': '2024', 'qwen3-30b-a3b': 'early 2025', 'phi-4': 'Jun 2024',
  'qwen-14b': '2024', 'gemma3-12b': 'Aug 2024', 'mistral-nemo': '2024',
  'pixtral-12b': '2024', 'olmo2-13b': '2023', 'falcon3-10b': '2024',
  'llama-8b': 'Dec 2023', 'qwen3-8b': 'early 2025', 'qwen-7b': '2024',
  'gemma2-9b': '2024', 'mistral-7b': '2023', 'ministral-8b': '2024',
  'phi-3.5-mini': 'Oct 2023', 'llama-3b': 'Dec 2023', 'gemma3-4b': 'Aug 2024',
  'granite-8b': '2024', 'glm4-9b': '2024', 'starcoder2-15b': '2023', 'aya-32b': '2024'
}
MODELS.forEach((m) => { m.cutoff = CUTOFFS[m.id] || '—' })

// Feed matchers — how each catalog model is found among the ~2,200 live keys.
// A key matches if every term in ANY `any` group appears in it and no `not` term
// does. Matched across serving providers, then median-blended (see pricing.js).
//
// Models deliberately left unmatched: the live feed serves a NEWER generation of
// the same family (MiniMax M2.x not MiniMax-01; GLM-4.6/4.7 not GLM-4 9B), and
// pricing a 2024 model off its 2026 successor would be wrong. Those keep their
// curated figure and are badged `curated` in the UI. Hunyuan Large, Snowflake
// Arctic, Falcon 3 and Aya have no per-token feed presence at all.
export const MODEL_MATCH = {
  // --- 2026 generation ---
  'deepseek-v4-pro':  { any: [['deepseek-v4-pro'], ['deepseek-v4pro']] },
  'deepseek-v4-flash':{ any: [['deepseek-v4-flash'], ['deepseek-v4flash']] },
  'kimi-k2.6':        { any: [['kimi-k2.6'], ['kimi-k2p6']] },
  'glm-5.2':          { any: [['glm-5.2'], ['glm-5p2']] },
  'minimax-m3':       { any: [['minimax-m3'], ['minimax.m3'], ['minimax-m3.0']], not: ['m3-pro'] },
  'mistral-large-3':  { any: [['mistral-large-3'], ['mistral-large-2512']] },
  'qwen3-coder-480b': { any: [['qwen3-coder-480b']] },
  'nemotron-3-super': { any: [['nemotron-3-super'], ['nemotron-120b'], ['nemotron', '120b-a12b']] },
  'gpt-oss-120b':     { any: [['gpt-oss-120b']], not: ['safeguard'] },
  'gpt-oss-20b':      { any: [['gpt-oss-20b']], not: ['safeguard'] },
  'qwen3-next-80b':   { any: [['qwen3-next-80b']] },
  'gemma4-31b':       { any: [['gemma-4-31b'], ['gemma4-31b']] },
  // --- earlier generations still worth self-hosting ---
  'deepseek-v3':      { any: [['deepseek', 'chat'], ['deepseek-v3'], ['deepseek', 'v3']], not: ['coder', 'v2', 'v4'] },
  // `distill` excluded: R1-Distill-Qwen-32B is a 32B model, not 671B R1.
  'deepseek-r1':      { any: [['deepseek', 'r1'], ['deepseek', 'reasoner']], not: ['distill'] },
  'qwen3-235b':       { any: [['qwen3-235b']] },
  'llama4-maverick':  { any: [['llama-4-maverick'], ['llama4-maverick'], ['maverick']] },
  // `hermes` excluded: Hermes-3-405B is a third-party fine-tune, not base Llama.
  'llama-405b':       { any: [['llama-3.1-405b'], ['llama-3-1-405b'], ['llama-v3p1-405b'], ['405b']], not: ['hermes'] },
  'dbrx':             { any: [['dbrx']] },
  'command-r-plus':   { any: [['command-r-plus']] },
  'qwen-72b':         { any: [['qwen2.5-72b'], ['qwen2p5-72b'], ['qwen-2.5-72b']] },
  'llama-70b':        { any: [['llama-3.3-70b'], ['llama-3-3-70b'], ['llama-v3p3-70b']] },
  'nemotron-70b':     { any: [['nemotron', '70b']] },
  'yi-34b':           { any: [['yi-34b'], ['yi-1.5-34b']] },
  'mixtral-8x22b':    { any: [['mixtral-8x22b']] },
  'llama4-scout':     { any: [['llama-4-scout'], ['llama4-scout'], ['scout']] },
  'qwen3-32b':        { any: [['qwen3-32b']] },
  'qwen-32b':         { any: [['qwen2.5-32b'], ['qwen2p5-32b']], not: ['coder'] },
  'qwen-coder-32b':   { any: [['qwen2.5-coder-32b'], ['qwen2p5-coder-32b']] },
  // Must say v2: plain `deepseek-coder-7b/33b` are the older, smaller generation.
  'deepseek-coder-v2':{ any: [['deepseek-coder-v2']], not: ['lite'] },
  'qwq-32b':          { any: [['qwq-32b']], not: ['preview'] },
  'gemma3-27b':       { any: [['gemma-3-27b'], ['gemma3-27b']] },
  // `r7b` excluded: Command R7B is a 7B model, not the 35B Command R.
  'command-r':        { any: [['command-r']], not: ['plus', 'r7b'] },
  'mistral-small-3':  { any: [['mistral-small']] },
  // `mamba` excluded: Codestral Mamba is a different architecture and size class.
  'codestral':        { any: [['codestral']], not: ['mamba'] },
  'internlm-20b':     { any: [['internlm']] },
  'qwen3-30b-a3b':    { any: [['qwen3-30b']] },
  'phi-4':            { any: [['phi-4']] },
  'qwen-14b':         { any: [['qwen2.5-14b'], ['qwen2p5-14b']] },
  'gemma3-12b':       { any: [['gemma-3-12b'], ['gemma3-12b']] },
  'mistral-nemo':     { any: [['mistral-nemo'], ['mistral', 'nemo']] },
  'pixtral-12b':      { any: [['pixtral-12b']] },
  // Left unmatched deliberately: the only `olmo` key in the feed is olmOCR-7B, a
  // document-OCR model that has nothing to do with OLMo 2 13B.
  'llama-8b':         { any: [['llama-3.1-8b'], ['llama-3-1-8b'], ['llama-v3p1-8b']], not: ['dobby'] },
  'qwen3-8b':         { any: [['qwen3-8b']] },
  'qwen-7b':          { any: [['qwen2.5-7b'], ['qwen2p5-7b']] },
  'gemma2-9b':        { any: [['gemma-2-9b'], ['gemma2-9b']] },
  'mistral-7b':       { any: [['mistral-7b'], ['open-mistral-7b']] },
  'ministral-8b':     { any: [['ministral-8b']] },
  'phi-3.5-mini':     { any: [['phi-3.5-mini'], ['phi-3-5-mini']] },
  'llama-3b':         { any: [['llama-3.2-3b'], ['llama-3-2-3b'], ['llama-v3p2-3b']] },
  'gemma3-4b':        { any: [['gemma-3-4b'], ['gemma3-4b']] },
  'granite-8b':       { any: [['granite', '8b']] },
  'starcoder2-15b':   { any: [['starcoder2-15b']] }
}

// Return MODELS with a resolved `price` object. Live where the feed matches,
// curated otherwise — the two are never blended and the UI badges which is which.
//
// `price.in`/`price.out` are real per-token rates for live models. Curated models
// only ever had a blended figure, so we expose `blendedOnly` rather than invent
// an input/output split that was never measured.
export function pricedModels(feed) {
  return MODELS.map((m) => {
    const live = resolvePrice(feed, MODEL_MATCH[m.id])
    if (live) {
      return {
        ...m,
        price: { ...live, blendedOnly: null },
        livePrice: true,
        asOf: feed?.asOf || null,
        // Back-compat: a 75/25 blend, the ratio the old single-number field used.
        apiPer1M: Math.round((live.in * 0.75 + live.out * 0.25) * 100) / 100
      }
    }
    return {
      ...m,
      price: {
        source: 'curated', in: null, out: null, cacheRead: null,
        cacheReadIsEstimate: true, spread: null, keys: [],
        blendedOnly: m.apiPer1M
      },
      livePrice: false,
      asOf: feed?.asOf || null
    }
  })
}

// Neocloud providers that serve open models as an API, with directional pricing.
// ref70 = typical blended $/1M for a Llama-70B-class model (mid-2026). These move
// fast; treat as ballpark. OpenRouter aggregates most of the per-token players.
export const NEOCLOUDS = [
  { name: 'DeepInfra',      chip: 'H100/H200',   model: 'per-token',        ref70: 0.23, breadth: 'very broad', notes: 'Often the cheapest per-token' },
  { name: 'Novita AI',      chip: 'GPU',         model: 'per-token',        ref70: 0.34, breadth: 'broad',      notes: 'Low cost, open-model focus' },
  { name: 'Hyperbolic',     chip: 'GPU',         model: 'per-token',        ref70: 0.40, breadth: 'broad',      notes: 'Cheap; open-weights focus' },
  { name: 'Groq',           chip: 'LPU',         model: 'per-token',        ref70: 0.59, breadth: 'curated',    notes: 'Ultra-low latency' },
  { name: 'SambaNova',      chip: 'RDU',         model: 'per-token',        ref70: 0.60, breadth: 'curated',    notes: 'Fast; large models' },
  { name: 'Cerebras',       chip: 'Wafer-scale', model: 'per-token',        ref70: 0.85, breadth: 'curated',    notes: 'Fastest tokens/sec' },
  { name: 'Together AI',    chip: 'H100/H200',   model: 'per-token + dedicated', ref70: 0.88, breadth: 'very broad (200+)', notes: 'Fine-tuning + dedicated endpoints' },
  { name: 'Fireworks AI',   chip: 'GPU',         model: 'per-token + dedicated', ref70: 0.90, breadth: 'broad', notes: 'FireAttention; enterprise' },
  { name: 'Lambda',         chip: 'GPU',         model: 'inference API + rental', ref70: 0.90, breadth: 'curated', notes: 'Also raw GPU rental' },
  { name: 'Baseten',        chip: 'GPU',         model: 'dedicated $/GPU-min', ref70: null, breadth: 'custom',  notes: 'Dedicated deployments (Truss)' },
  { name: 'Replicate',      chip: 'GPU',         model: 'per-second/token', ref70: null, breadth: 'broad',      notes: 'Easy deploy, community models' },
  { name: 'OpenRouter',     chip: 'aggregator',  model: 'routes to above',  ref70: null, breadth: 'all',        notes: 'Shows the provider price spread' },
  { name: 'AWS Bedrock',    chip: 'managed',     model: 'per-token / PT',   ref70: 0.72, breadth: 'Llama/Mistral/Cohere', notes: 'Enterprise, compliance' },
  { name: 'Azure AI Foundry',chip: 'managed',    model: 'per-token / PTU',  ref70: 0.75, breadth: 'Llama/Mistral/Phi', notes: 'Enterprise, MaaS' },
  { name: 'Google Vertex',  chip: 'managed',     model: 'per-token',        ref70: 0.75, breadth: 'Llama/Gemma', notes: 'Enterprise, Model Garden' }
]

// Serving precision options: bytes/param for weights.
//
// tputMul is GONE from this table on purpose. It used to carry fp8 1.3 / int4 1.6
// while throughput.js carried fp8 2.0 / int4 3.0 from the benchmark refit — two
// live, contradictory sets ~1.9x apart. PRECISION_SPEEDUP in throughput.js is the
// single source of truth; this table now describes only the weight footprint.
export const PRECISIONS = [
  { id: 'fp16', label: 'FP16 (reference)', bytesPerParam: 2.0,
    note: 'Reference precision. Almost nobody serves production traffic at fp16 — shown so you can see the unquantised footprint.' },
  { id: 'fp8',  label: 'FP8',              bytesPerParam: 1.0,
    note: 'The mainstream serving precision for 2025–26 releases, and what many of them ship in.' },
  { id: 'int4', label: 'INT4 (quantised)', bytesPerParam: 0.5,
    note: 'Aggressive quantisation. Quality impact is model- and task-dependent and is NOT modelled here.' }
]

// NATIVE SERVING PRECISION — the precision a model's weights were actually
// released in, as distinct from the precision you choose to serve at.
//
// Why this exists: the tool used to evaluate every model at fp16, because that is
// the arithmetic reference. But labs increasingly ship quantisation-aware weights
// SPECIFICALLY to get a model under a VRAM boundary — which is the boundary this
// whole tool argues is decisive. Scoring a model at a precision it never shipped
// in inverts that work: gpt-oss-120b was built to fit one 80GB card and, at fp16,
// this tool demanded twenty of them. Defaulting to the released precision makes
// the calibration work visible instead of penalising it.
//
// CONFIDENCE: the explicit entries below are from model cards / release notes and
// are `published`. The fallback rule is an `estimate` — 2025+ releases overwhelmingly
// ship fp8-or-lower checkpoints, older ones fp16 — and is labelled as such wherever
// it is surfaced. Correcting an entry here is the cheapest contribution anyone can
// make to this project.
export const NATIVE_PRECISION = {
  // Released with MXFP4 weights, explicitly sized to fit a single 80GB card.
  'gpt-oss-120b': 'int4',
  'gpt-oss-20b': 'int4',
  // Trained and released in FP8.
  'deepseek-v3': 'fp8',
  'deepseek-r1': 'fp8',
  'deepseek-v4-pro': 'fp8',
  'deepseek-v4-flash': 'fp8'
}

export function nativePrecisionFor(model) {
  // Always an object. Returning a bare string here for the null case was a trap:
  // callers do `.id` on the result and would silently get undefined.
  if (!model) return { id: 'fp16', basis: 'estimate' }
  const explicit = NATIVE_PRECISION[model.id]
  if (explicit) return { id: explicit, basis: 'published' }
  // Fallback: generation-based, and honest about being a guess.
  return { id: (model.year || 2024) >= 2025 ? 'fp8' : 'fp16', basis: 'estimate' }
}

// Providers report the precision they serve at in wildly varying vocabulary.
// Collapse to the three the cost model can represent.
const PRECISION_BUCKET = {
  fp32: 'fp16', bf16: 'fp16', fp16: 'fp16',
  fp8: 'fp8', int8: 'fp8', bf8: 'fp8',
  fp6: 'int4', fp4: 'int4', int4: 'int4', mxfp4: 'int4', nf4: 'int4', gptq: 'int4', awq: 'int4'
}

// SERVING PRECISION — what the model is ACTUALLY served at in production, taken
// from observed per-provider data where we have it.
//
// This supersedes "native precision" as the default basis, and the distinction
// matters. Native precision is what a lab released; serving precision is what the
// market runs. They are often different — Llama 3.3 70B shipped in bf16 and is
// mostly served at fp8 — and for THIS tool the second one is the correct basis,
// because the number we compare against is an API median produced by exactly
// these providers at exactly these precisions. Costing your own fleet at fp16
// against a median served at fp8 is not a like-for-like comparison, which is a
// caveat the tool already prints and previously ignored in its own arithmetic.
//
// Precedence: observed (weekly OpenRouter snapshot) > published model card >
// release-generation guess. The basis travels with the value so the UI can say
// which one it used rather than presenting all three with equal confidence.
export function servingPrecisionFor(model, byPrecision) {
  if (!model) return { id: 'fp16', basis: 'estimate', label: 'assumed' }

  const counts = {}
  for (const [raw, v] of Object.entries(byPrecision || {})) {
    const bucket = PRECISION_BUCKET[String(raw).toLowerCase()]
    if (!bucket) continue // 'unknown' and anything unrecognised abstain rather than vote
    counts[bucket] = (counts[bucket] || 0) + (v?.providers ?? v ?? 0)
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1])
  // A modal precision decided by one or two listings is a coin flip, not an
  // observation — DeepSeek V3 sat at fp8 1 : int4 1, and which one won moved the
  // headline by 2x. Require a real sample and a real margin before claiming to
  // have observed anything; otherwise fall through to the model card.
  const total = ranked.reduce((s, [, c]) => s + c, 0)
  const decisive = ranked.length && total >= 3 && (ranked.length === 1 || ranked[0][1] > ranked[1][1])
  if (decisive) {
    const [id, n] = ranked[0]
    return {
      id,
      basis: 'observed',
      label: `served at ${id} by ${n} of ${total} providers reporting a precision`,
      providers: n,
      total
    }
  }

  const native = nativePrecisionFor(model)
  const thin = total > 0 && total < 3
  return {
    ...native,
    label: native.basis === 'published'
      ? 'the precision its weights were released in'
      : thin
        ? 'inferred from release generation — too few providers report a precision to observe one'
        : 'inferred from release generation — no provider data, no model card read'
  }
}

