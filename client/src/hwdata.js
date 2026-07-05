// Model → hardware footprint → cost → throughput → break-even database.
// All numbers are directional (mid-2026) and every derived value is computed in
// hwcalc.js from these inputs so the math is transparent. Sources of the raw
// inputs: model param counts (model cards), GPU specs/pricing (cloud rental
// marketplaces — RunPod/Vast/Lambda ranges), throughput (heuristic, in the
// spirit of selfhostllm / gpu_poor, NOT measured benchmarks).

// GPU catalog. rentHr = mid-market GPU-rental $/hr (spot/community lower,
// hyperscaler higher — Vast/RunPod/Shadeform ranges). capex = street price of the
// card. nodePerGpu = the rest of the node attributable per GPU (CPU + system RAM +
// chassis + NIC + storage) — the "RAM in capex" that GPU-only calculators omit.
export const GPUS = [
  { id: 'rtx4090', name: 'RTX 4090',   vram: 24, rentHr: 0.40, capex: 1900,  nodePerGpu: 1500, powerW: 450, tputMul: 0.35 },
  { id: 'l40s',    name: 'L40S',       vram: 48, rentHr: 0.90, capex: 9500,  nodePerGpu: 6000, powerW: 350, tputMul: 0.45 },
  { id: 'a100',    name: 'A100 80GB',  vram: 80, rentHr: 1.50, capex: 16000, nodePerGpu: 8000, powerW: 400, tputMul: 0.60 },
  { id: 'h100',    name: 'H100 80GB',  vram: 80, rentHr: 2.50, capex: 28000, nodePerGpu: 9000, powerW: 700, tputMul: 1.00 }
]

// Top 50 open-weight models worth self-hosting (2026). Fields users care about:
//   params  = total size (B)            active = MoE active params (B, drives compute)
//   ctx     = context window (K tokens)  license/commercial = self-host legal freedom
//   modality= text|vision|code|reasoning|multilingual|RAG   quality = coarse 1-4 tier
//   apiPer1M= representative blended NEOCLOUD price ($/1M) for the SAME model — the
//             apples-to-apples baseline. org/country matter for sovereignty. year = release.
// HOW THE TOP 50 WAS CHOSEN (editorial, directional — see Catalog view for the note):
//   filter: open, downloadable weights only (no GPT/Claude/Gemini). Selected & ordered
//   by a blend of (a) capability tier, (b) adoption / neocloud availability, (c) recency,
//   (d) coverage across sizes & use-cases so the list is useful, not 50 of one family.
export const MODELS = [
  { id: 'deepseek-v3',     label: 'DeepSeek V3.1',     org: 'DeepSeek', country: 'CN', params: 671, active: 37,  ctx: 128,   license: 'DeepSeek',   commercial: true,  modality: 'text',      quality: 4, apiPer1M: 0.55, tag: 'frontier MoE',   year: 2025 },
  { id: 'deepseek-r1',     label: 'DeepSeek R1',       org: 'DeepSeek', country: 'CN', params: 671, active: 37,  ctx: 128,   license: 'MIT',        commercial: true,  modality: 'reasoning', quality: 4, apiPer1M: 1.20, tag: 'reasoning',      year: 2025 },
  { id: 'kimi-k2',         label: 'Kimi K2',           org: 'Moonshot', country: 'CN', params: 1000,active: 32,  ctx: 128,   license: 'MIT',        commercial: true,  modality: 'text',      quality: 4, apiPer1M: 0.60, tag: 'frontier MoE',   year: 2025 },
  { id: 'qwen3-235b',      label: 'Qwen3 235B',        org: 'Alibaba',  country: 'CN', params: 235, active: 22,  ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'reasoning', quality: 4, apiPer1M: 0.70, tag: 'frontier MoE',   year: 2025 },
  { id: 'minimax-01',      label: 'MiniMax-01',        org: 'MiniMax',  country: 'CN', params: 456, active: 46,  ctx: 1000,  license: 'MiniMax',    commercial: true,  modality: 'text',      quality: 3, apiPer1M: 0.40, tag: 'long-context MoE',year: 2025 },
  { id: 'llama4-maverick', label: 'Llama 4 Maverick',  org: 'Meta',     country: 'US', params: 400, active: 17,  ctx: 1000,  license: 'Llama',      commercial: true,  modality: 'vision',    quality: 3, apiPer1M: 0.60, tag: 'multimodal MoE', year: 2025 },
  { id: 'llama-405b',      label: 'Llama 3.1 405B',    org: 'Meta',     country: 'US', params: 405, active: 405, ctx: 128,   license: 'Llama',      commercial: true,  modality: 'text',      quality: 4, apiPer1M: 3.00, tag: 'dense frontier', year: 2024 },
  { id: 'hunyuan-large',   label: 'Hunyuan Large',     org: 'Tencent',  country: 'CN', params: 389, active: 52,  ctx: 256,   license: 'Tencent',    commercial: true,  modality: 'text',      quality: 3, apiPer1M: 0.55, tag: 'MoE',            year: 2024 },
  { id: 'dbrx',            label: 'DBRX',              org: 'Databricks',country:'US', params: 132, active: 36,  ctx: 32,    license: 'Databricks', commercial: true,  modality: 'text',      quality: 2, apiPer1M: 0.60, tag: 'MoE',            year: 2024 },
  { id: 'arctic',          label: 'Snowflake Arctic',  org: 'Snowflake',country: 'US', params: 480, active: 17,  ctx: 4,     license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 2, apiPer1M: 0.50, tag: 'MoE',            year: 2024 },
  { id: 'mistral-large',   label: 'Mistral Large 2',   org: 'Mistral',  country: 'FR', params: 123, active: 123, ctx: 128,   license: 'MRL',        commercial: false, modality: 'text',      quality: 3, apiPer1M: 1.00, tag: 'dense',          year: 2024 },
  { id: 'command-r-plus',  label: 'Command R+',        org: 'Cohere',   country: 'CA', params: 104, active: 104, ctx: 128,   license: 'CC-BY-NC',   commercial: false, modality: 'RAG',       quality: 3, apiPer1M: 0.90, tag: 'RAG',            year: 2024 },
  { id: 'qwen-72b',        label: 'Qwen 2.5 72B',      org: 'Alibaba',  country: 'CN', params: 72,  active: 72,  ctx: 128,   license: 'Qwen',       commercial: true,  modality: 'text',      quality: 3, apiPer1M: 0.80, tag: 'dense',          year: 2024 },
  { id: 'llama-70b',       label: 'Llama 3.3 70B',     org: 'Meta',     country: 'US', params: 70,  active: 70,  ctx: 128,   license: 'Llama',      commercial: true,  modality: 'text',      quality: 3, apiPer1M: 0.65, tag: 'dense',          year: 2024 },
  { id: 'nemotron-70b',    label: 'Nemotron 70B',      org: 'Nvidia',   country: 'US', params: 70,  active: 70,  ctx: 128,   license: 'Llama',      commercial: true,  modality: 'text',      quality: 3, apiPer1M: 0.70, tag: 'aligned',        year: 2024 },
  { id: 'yi-34b',          label: 'Yi-1.5 34B',        org: '01.AI',    country: 'CN', params: 34,  active: 34,  ctx: 32,    license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 2, apiPer1M: 0.40, tag: 'dense',          year: 2024 },
  { id: 'mixtral-8x22b',   label: 'Mixtral 8x22B',     org: 'Mistral',  country: 'FR', params: 141, active: 39,  ctx: 64,    license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 3, apiPer1M: 0.90, tag: 'MoE',            year: 2024 },
  { id: 'llama4-scout',    label: 'Llama 4 Scout',     org: 'Meta',     country: 'US', params: 109, active: 17,  ctx: 10000, license: 'Llama',      commercial: true,  modality: 'vision',    quality: 3, apiPer1M: 0.30, tag: 'long-context MoE',year: 2025 },
  { id: 'qwen3-32b',       label: 'Qwen3 32B',         org: 'Alibaba',  country: 'CN', params: 32,  active: 32,  ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'reasoning', quality: 3, apiPer1M: 0.30, tag: 'hybrid reasoning',year: 2025 },
  { id: 'qwen-32b',        label: 'Qwen 2.5 32B',      org: 'Alibaba',  country: 'CN', params: 32,  active: 32,  ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'text',      quality: 3, apiPer1M: 0.30, tag: 'dense',          year: 2024 },
  { id: 'qwen-coder-32b',  label: 'Qwen2.5 Coder 32B', org: 'Alibaba',  country: 'CN', params: 32,  active: 32,  ctx: 128,   license: 'Apache-2.0', commercial: true,  modality: 'code',      quality: 3, apiPer1M: 0.30, tag: 'coding',         year: 2024 },
  { id: 'deepseek-coder-v2',label:'DeepSeek-Coder V2', org: 'DeepSeek', country: 'CN', params: 236, active: 21,  ctx: 128,   license: 'DeepSeek',   commercial: true,  modality: 'code',      quality: 3, apiPer1M: 0.30, tag: 'coding MoE',      year: 2024 },
  { id: 'qwq-32b',         label: 'QwQ 32B',           org: 'Alibaba',  country: 'CN', params: 32,  active: 32,  ctx: 32,    license: 'Apache-2.0', commercial: true,  modality: 'reasoning', quality: 3, apiPer1M: 0.30, tag: 'reasoning',      year: 2025 },
  { id: 'gemma3-27b',      label: 'Gemma 3 27B',       org: 'Google',   country: 'US', params: 27,  active: 27,  ctx: 128,   license: 'Gemma',      commercial: true,  modality: 'vision',    quality: 3, apiPer1M: 0.30, tag: 'multimodal',     year: 2025 },
  { id: 'gemma2-27b',      label: 'Gemma 2 27B',       org: 'Google',   country: 'US', params: 27,  active: 27,  ctx: 8,     license: 'Gemma',      commercial: true,  modality: 'text',      quality: 2, apiPer1M: 0.30, tag: 'dense',          year: 2024 },
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
  { id: 'glm4-9b',         label: 'GLM-4 9B',          org: 'Zhipu',    country: 'CN', params: 9,   active: 9,   ctx: 128,   license: 'GLM',        commercial: true,  modality: 'text',      quality: 1, apiPer1M: 0.10, tag: 'dense',          year: 2024 },
  { id: 'starcoder2-15b',  label: 'StarCoder2 15B',    org: 'BigCode',  country: 'Intl',params: 15, active: 15,  ctx: 16,    license: 'OpenRAIL',   commercial: true,  modality: 'code',      quality: 1, apiPer1M: 0.20, tag: 'coding',         year: 2024 },
  { id: 'aya-32b',         label: 'Aya Expanse 32B',   org: 'Cohere',   country: 'CA', params: 32,  active: 32,  ctx: 128,   license: 'CC-BY-NC',   commercial: false, modality: 'multilingual',quality:2,apiPer1M: 0.30, tag: 'multilingual',  year: 2024 }
]

// Approximate TRAINING KNOWLEDGE CUTOFF per model. Many labs don't publish exact
// dates, so these are best-effort/directional — verify against the model card
// before relying on recency. Format: "Mon YYYY" where known, else year.
const CUTOFFS = {
  'deepseek-v3': 'Jul 2024', 'deepseek-r1': 'Jul 2024', 'kimi-k2': 'early 2025',
  'qwen3-235b': 'early 2025', 'minimax-01': '2024', 'llama4-maverick': 'Aug 2024',
  'llama-405b': 'Dec 2023', 'hunyuan-large': '2024', 'dbrx': 'Dec 2023', 'arctic': '2024',
  'mistral-large': '2024', 'command-r-plus': 'early 2024', 'qwen-72b': '2024',
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

// LiteLLM feed keys for models we can price live. Where a key is present in the
// live feed, we override the curated apiPer1M with the live blended price and mark
// it live; otherwise the curated (directional) figure stands.
const MODEL_FEED_KEYS = {
  'deepseek-v3': ['deepseek/deepseek-chat'],
  'deepseek-r1': ['deepseek/deepseek-reasoner'],
  'llama-405b': ['together_ai/meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', 'fireworks_ai/accounts/fireworks/models/llama-v3p1-405b-instruct'],
  'llama-70b': ['groq/llama-3.3-70b-versatile', 'together_ai/meta-llama/Llama-3.3-70B-Instruct-Turbo'],
  'llama-8b': ['groq/llama-3.1-8b-instant', 'together_ai/meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'],
  'qwen-72b': ['fireworks_ai/accounts/fireworks/models/qwen2p5-72b-instruct'],
  'mixtral-8x22b': ['mistral/open-mixtral-8x22b'],
  'mistral-large': ['mistral/mistral-large-latest'],
  'mistral-small-3': ['mistral/mistral-small-latest'],
  'mistral-7b': ['mistral/open-mistral-7b'],
  'codestral': ['mistral/codestral-latest'],
  'command-r-plus': ['command-r-plus', 'cohere_chat/command-r-plus'],
  'command-r': ['command-r', 'cohere_chat/command-r']
}

// Return MODELS with apiPer1M refined from the live feed where a key matches.
// Always returns the full list (curated prices when no feed / no match).
export function pricedModels(feed) {
  return MODELS.map((m) => {
    const keys = MODEL_FEED_KEYS[m.id]
    if (feed && feed.prices && keys) {
      for (const k of keys) {
        const p = feed.prices[k]
        if (p && typeof p.in === 'number' && typeof p.out === 'number') {
          const blended = Math.round((p.in * 0.75 + p.out * 0.25) * 100) / 100
          return { ...m, apiPer1M: blended, livePrice: true, liveKey: k, asOf: feed.asOf }
        }
      }
    }
    return { ...m, livePrice: false }
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
export const PRECISIONS = [
  { id: 'fp16', label: 'FP16 (full)', bytesPerParam: 2.0, tputMul: 1.0 },
  { id: 'fp8',  label: 'FP8',         bytesPerParam: 1.0, tputMul: 1.3 },
  { id: 'int4', label: 'INT4 (quant)',bytesPerParam: 0.5, tputMul: 1.6 }
]

// Aggregate decode throughput heuristic (tokens/sec) on ONE H100 at FP16, by the
// ACTIVE parameter count, assuming healthy batching. Scaled by GPU tputMul,
// precision tputMul, and GPU count (with a batching-efficiency haircut) in
// hwcalc.js. Directional only — real throughput swings widely with batch size,
// context length, and engine (vLLM/TGI/SGLang).
export function baseAggTokPerSec(activeParams) {
  if (activeParams <= 8) return 2400
  if (activeParams <= 14) return 1600
  if (activeParams <= 32) return 900
  if (activeParams <= 70) return 420
  return 250
}
