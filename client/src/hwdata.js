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

// Top ~20 open-weight models worth self-hosting (mid-2026). params = total (B);
// active = MoE active params (B) that drive compute/throughput. apiPer1M =
// representative blended price ($/1M, ~75/25 in/out) for the SAME model served by a
// NEOCLOUD API (Together / Fireworks / DeepInfra / Groq-class) — the apples-to-apples
// baseline you compare self-host against. quality = coarse 1-4 tier. tag = its niche.
// All directional; the live feed refines prices where a match exists.
export const MODELS = [
  // ---- frontier-class open weights ----
  { id: 'deepseek-v3',     label: 'DeepSeek V3.1',     params: 671,  active: 37,  quality: 4, apiPer1M: 0.55, tag: 'frontier MoE' },
  { id: 'deepseek-r1',     label: 'DeepSeek R1',       params: 671,  active: 37,  quality: 4, apiPer1M: 1.20, tag: 'reasoning' },
  { id: 'kimi-k2',         label: 'Kimi K2',           params: 1000, active: 32,  quality: 4, apiPer1M: 0.60, tag: 'frontier MoE' },
  { id: 'qwen3-235b',      label: 'Qwen3 235B',        params: 235,  active: 22,  quality: 4, apiPer1M: 0.70, tag: 'frontier MoE' },
  { id: 'llama-405b',      label: 'Llama 3.1 405B',    params: 405,  active: 405, quality: 4, apiPer1M: 3.00, tag: 'dense frontier' },
  { id: 'llama4-maverick', label: 'Llama 4 Maverick',  params: 400,  active: 17,  quality: 3, apiPer1M: 0.60, tag: 'MoE' },
  // ---- strong mid/large ----
  { id: 'llama4-scout',    label: 'Llama 4 Scout',     params: 109,  active: 17,  quality: 3, apiPer1M: 0.30, tag: 'long-context MoE' },
  { id: 'mistral-large',   label: 'Mistral Large 2',   params: 123,  active: 123, quality: 3, apiPer1M: 1.00, tag: 'dense' },
  { id: 'command-r-plus',  label: 'Command R+',        params: 104,  active: 104, quality: 3, apiPer1M: 0.90, tag: 'RAG' },
  { id: 'mixtral-8x22b',   label: 'Mixtral 8x22B',     params: 141,  active: 39,  quality: 3, apiPer1M: 0.90, tag: 'MoE' },
  { id: 'llama-70b',       label: 'Llama 3.3 70B',     params: 70,   active: 70,  quality: 3, apiPer1M: 0.65, tag: 'dense' },
  { id: 'qwen-72b',        label: 'Qwen 2.5 72B',      params: 72,   active: 72,  quality: 3, apiPer1M: 0.80, tag: 'dense' },
  { id: 'nemotron-70b',    label: 'Nemotron 70B',      params: 70,   active: 70,  quality: 3, apiPer1M: 0.70, tag: 'aligned' },
  // ---- efficient workhorses (32B and under) ----
  { id: 'qwen3-32b',       label: 'Qwen3 32B',         params: 32,   active: 32,  quality: 3, apiPer1M: 0.30, tag: 'hybrid reasoning' },
  { id: 'qwen-coder-32b',  label: 'Qwen2.5 Coder 32B', params: 32,   active: 32,  quality: 3, apiPer1M: 0.30, tag: 'coding' },
  { id: 'qwq-32b',         label: 'QwQ 32B',           params: 32,   active: 32,  quality: 3, apiPer1M: 0.30, tag: 'reasoning' },
  { id: 'gemma3-27b',      label: 'Gemma 3 27B',       params: 27,   active: 27,  quality: 3, apiPer1M: 0.30, tag: 'dense' },
  { id: 'mistral-small-3', label: 'Mistral Small 3',   params: 24,   active: 24,  quality: 2, apiPer1M: 0.20, tag: 'efficient' },
  { id: 'phi-4',           label: 'Phi-4 14B',         params: 14,   active: 14,  quality: 2, apiPer1M: 0.15, tag: 'small/strong' },
  { id: 'llama-8b',        label: 'Llama 3.1 8B',      params: 8,    active: 8,   quality: 1, apiPer1M: 0.06, tag: 'edge/bulk' }
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
