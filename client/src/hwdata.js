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

// Popular open-weight models. params = total (B); active = MoE active params (B)
// that drive compute/throughput. apiPer1M = representative blended price ($/1M,
// ~75/25 in/out) for the SAME model served by a NEOCLOUD API (Together / Fireworks
// / DeepInfra / Groq-class) — the apples-to-apples thing you compare self-host
// against. quality is the coarse 1-4 tier used elsewhere.
export const MODELS = [
  { id: 'llama-8b',    label: 'Llama 3.1 8B',   params: 8,   active: 8,   quality: 1, apiPer1M: 0.06 },
  { id: 'qwen-14b',    label: 'Qwen 2.5 14B',   params: 14,  active: 14,  quality: 2, apiPer1M: 0.20 },
  { id: 'gemma-27b',   label: 'Gemma 2 27B',    params: 27,  active: 27,  quality: 2, apiPer1M: 0.30 },
  { id: 'mistral-24b', label: 'Mistral Small 24B', params: 24, active: 24, quality: 2, apiPer1M: 0.30 },
  { id: 'qwen-32b',    label: 'Qwen 2.5 32B',   params: 32,  active: 32,  quality: 3, apiPer1M: 0.40 },
  { id: 'mixtral',     label: 'Mixtral 8x7B',   params: 47,  active: 13,  quality: 2, apiPer1M: 0.50 },
  { id: 'llama-70b',   label: 'Llama 3.3 70B',  params: 70,  active: 70,  quality: 3, apiPer1M: 0.65 },
  { id: 'qwen-72b',    label: 'Qwen 2.5 72B',   params: 72,  active: 72,  quality: 3, apiPer1M: 0.80 },
  { id: 'deepseek-v3', label: 'DeepSeek V3',    params: 671, active: 37,  quality: 3, apiPer1M: 0.55 },
  { id: 'llama-405b',  label: 'Llama 3.1 405B', params: 405, active: 405, quality: 4, apiPer1M: 3.50 }
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
