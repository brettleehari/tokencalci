// MEASURED SERVING THROUGHPUT.
//
// This replaces a five-bucket step function that was the weakest input in the
// tool and, awkwardly, the one the whole open-weights-vs-open-inference argument
// rested on. The claim was that a dense model's bare compute is several times the
// neocloud price; that claim is a statement about tokens per GPU-hour, so it can
// only be settled with real tokens-per-GPU-hour numbers.
//
// These are PUBLISHED third-party benchmarks, not measurements we ran. That is a
// real distinction and the confidence grade reflects it: `published`, not
// `measured`. Running our own would be better still and remains the honest next
// step — but reasoning from someone's controlled benchmark beats reasoning from
// a number we invented.
//
// What the data changed:
//   - Dense 70B was RIGHT. Our heuristic said 336 tok/s/GPU; measured 350. The
//     headline claim survives contact with evidence.
//   - Quantisation was badly understated. We used 1.3x for fp8 and 1.6x for int4;
//     a controlled same-hardware series measures 2.0x and 3.0x.
//   - Models that FIT ON ONE GPU are far faster per GPU than we assumed, because
//     tensor-parallel communication is expensive. We had no term for this at all.

// ---------------------------------------------------------------------------
// GPU memory bandwidth (GB/s). Decode is bandwidth-bound: every token requires
// reading the active weights, so bandwidth — not FLOPs — sets the ceiling.
// ---------------------------------------------------------------------------
export const GPU_BANDWIDTH = {
  rtx4090: 1008,
  l40s: 864,
  a100: 2039,   // 80GB SXM4
  h100: 3350,   // SXM5 HBM3
  h200: 4800,   // HBM3e
  b200: 8000    // HBM3e
}
const REF_BANDWIDTH = GPU_BANDWIDTH.h100

// REFERENCE-ONLY hardware, for the demo myth-buster. These are not deployable
// options in the calculator — they exist to make one comparison concrete, because
// "it ran on my laptop" is the most common reason a leader believes an open model
// is production-ready.
//
// Decode is memory-bandwidth-bound, so bandwidth is the honest axis. A laptop is
// not slow because it is small; it is slow because it reads weights through a much
// narrower pipe, and it serves one stream instead of hundreds.
export const REFERENCE_HARDWARE = [
  { id: 'cpu-desktop', label: 'Desktop CPU (DDR5)', bandwidth: 90, note: 'dual-channel DDR5' },
  { id: 'cpu-server', label: 'Server CPU (12-channel)', bandwidth: 400, note: 'high-end dual-socket' },
  { id: 'mac', label: 'MacBook Pro M4 Max', bandwidth: 546, note: 'unified memory' },
  { id: 'rtx4090', label: 'RTX 4090', bandwidth: 1008, note: 'consumer GPU' },
  { id: 'h100', label: 'H100 SXM', bandwidth: 3350, note: 'datacentre' }
]

// ---------------------------------------------------------------------------
// Published benchmarks. Every row carries its configuration, because a
// throughput number without a batch size is close to meaningless — the same
// hardware and model span ~100x across batch sizes.
//
// Common config unless noted: vLLM, continuous batching, 256 concurrent
// requests, 512 input / 512 output tokens.
// ---------------------------------------------------------------------------
export const BENCHMARKS = [
  { model: 'Llama 3.3 70B', activeB: 70, gpu: 'h100', gpus: 8, precision: 'fp16', totalTokPerSec: 2800, src: 'spheron-2026' },
  { model: 'Llama 3.3 70B', activeB: 70, gpu: 'h100', gpus: 8, precision: 'fp8', totalTokPerSec: 5600, src: 'spheron-2026' },
  { model: 'Llama 3.3 70B', activeB: 70, gpu: 'h100', gpus: 8, precision: 'int4', totalTokPerSec: 8400, src: 'spheron-2026' },
  { model: 'Llama 3.3 70B', activeB: 70, gpu: 'a100', gpus: 8, precision: 'fp16', totalTokPerSec: 1400, src: 'spheron-2026' },
  { model: 'Llama 3.3 70B', activeB: 70, gpu: 'h200', gpus: 8, precision: 'fp16', totalTokPerSec: 3600, src: 'spheron-2026' },
  { model: 'Llama 3.3 70B', activeB: 70, gpu: 'b200', gpus: 8, precision: 'fp16', totalTokPerSec: 5200, src: 'spheron-2026' },
  { model: 'Gemma 4 31B', activeB: 31, gpu: 'h100', gpus: 1, precision: 'fp16', totalTokPerSec: 3100, src: 'spheron-2026' },
  { model: 'Mistral Small 24B', activeB: 24, gpu: 'h100', gpus: 2, precision: 'fp16', totalTokPerSec: 3400, src: 'spheron-2026' },
  { model: 'Qwen3 30B-A3B', activeB: 3, gpu: 'h100', gpus: 1, precision: 'fp16', totalTokPerSec: 3900, src: 'spheron-2026' },
  { model: 'DeepSeek V3', activeB: 37, gpu: 'h100', gpus: 8, precision: 'int4', totalTokPerSec: 1800, src: 'spheron-2026' },
  // Different harness and batch size — kept as a cross-check, not a fit anchor.
  { model: 'Llama 3.1 70B', activeB: 70, gpu: 'h100', gpus: 1, precision: 'fp8', totalTokPerSec: 460, batch: 64, engine: 'SGLang', src: 'cerebrium-2026' }
]

export const BENCHMARK_SOURCES = {
  'spheron-2026': {
    label: 'Spheron GPU cost-per-token benchmark (2026)',
    url: 'https://www.spheron.network/blog/gpu-cost-per-token-benchmark-llm-inference-2026/',
    config: 'vLLM, continuous batching, 256 concurrent requests, 512 in / 512 out'
  },
  'cerebrium-2026': {
    label: 'Cerebrium — vLLM vs SGLang vs TensorRT-LLM',
    url: 'https://cerebrium.ai/blog/benchmarking-vllm-sglang-tensorrt-for-llama-3-1-api',
    config: 'SGLang, batch 64, 256 in / 512 out'
  }
}

// ---------------------------------------------------------------------------
// Scaling factors, each derived from the data above rather than assumed.
// ---------------------------------------------------------------------------

// Precision. From the controlled same-hardware series (2800 / 5600 / 8400 on
// 8xH100): fp8 is 2.0x fp16 and int4 is 3.0x. Close to the byte ratio (2x, 4x)
// and sub-linear at int4, which is what you would expect once attention and KV
// traffic stop being dominated by weight reads.
export const PRECISION_SPEEDUP = { fp16: 1.0, fp8: 2.0, int4: 3.0 }

// THE FINDING THAT MATTERS MOST, and the one we had backwards.
//
// Total fleet throughput barely moves with GPU count:
//
//   Qwen3 30B-A3B   1 GPU   3900 tok/s
//   Gemma 4 31B     1 GPU   3100 tok/s
//   Mistral 24B     2 GPUs  3400 tok/s
//   Llama 70B       8 GPUs  2800 tok/s
//
// Eight GPUs do not deliver eight times the tokens. They deliver roughly what
// one would, because tensor-parallel decode pays communication on every layer
// and that cost cancels the added bandwidth. TENSOR PARALLELISM BUYS CAPACITY,
// NOT SPEED — you split a model across GPUs to make it fit, not to make it fast.
//
// This is the mechanism behind the structural gap. If a dense 70B needs eight
// GPUs to fit, you rent eight and get the throughput of about one. A neocloud
// serving the same weights pays that too — but amortises it across every
// customer at once, which you cannot.
export const TP_BUYS_CAPACITY_NOT_SPEED = true

// Bandwidth scaling is sub-linear: across A100/H100/H200/B200 on identical
// workloads, a 2.39x bandwidth advantage returned 1.86x throughput.
const BANDWIDTH_EXPONENT = 0.75

// FLEET throughput at the reference point (H100, fp16), as a function of ACTIVE
// parameters. Fitted log-linearly to the four clean H100 fp16 anchors, which
// span 3B to 70B active and 1 to 8 GPUs. The decay is shallow — a 23x increase
// in active parameters costs only about 28% of throughput — because at these
// batch sizes the bottleneck is attention and scheduling, not weight reads.
const REF_ACTIVE_B = 3
const REF_TOK_PER_SEC = 3900
const ACTIVE_EXPONENT = -0.105 // fit: 3B -> 3900, 70B -> 2800

function fleetBase(activeB) {
  const a = Math.max(0.5, activeB)
  return REF_TOK_PER_SEC * Math.pow(a / REF_ACTIVE_B, ACTIVE_EXPONENT)
}

// Aggregate decode throughput (tokens/sec) for a fleet.
//
// Returns the number plus how it was arrived at, so the UI can say whether a
// figure is anchored on a real benchmark or extrapolated away from one.
export function throughputFor({ activeB, totalB, gpuId, precision = 'fp16', numGpus = 1 }) {
  const bw = GPU_BANDWIDTH[gpuId] || REF_BANDWIDTH
  const base = fleetBase(activeB)
  const bandwidthScale = Math.pow(bw / REF_BANDWIDTH, BANDWIDTH_EXPONENT)
  const precScale = PRECISION_SPEEDUP[precision] ?? 1.0

  // Note the absence of a numGpus term. That is the finding, not an oversight.
  const total = base * bandwidthScale * precScale
  const perGpu = total / Math.max(1, numGpus)

  // Is there a benchmark close enough to call this anchored rather than modelled?
  const near = BENCHMARKS.find(
    (b) => b.gpu === gpuId && b.precision === precision &&
      Math.abs(Math.log((b.activeB || 1) / Math.max(0.5, activeB))) < 0.35
  )

  // Known blind spot, stated rather than papered over: very large MoE models
  // that need many GPUs purely to hold their expert weights (DeepSeek V3 at
  // 671B total) run far slower than this predicts, because expert parallelism
  // adds all-to-all communication that dense tensor parallelism does not. One
  // benchmark is not enough to fit a term for it, so it is flagged instead.
  const largeMoE = totalB && totalB > 300 && numGpus >= 4

  return {
    totalTokPerSec: total,
    perGpuTokPerSec: perGpu,
    basis: near ? 'anchored' : 'modelled',
    anchor: near || null,
    overPredictsLargeMoE: !!largeMoE,
    factors: { base, bandwidthScale, precScale }
  }
}

export const THROUGHPUT_META = {
  confidence: 'published',
  note: 'Third-party published benchmarks (vLLM/SGLang, batch 256, 512/512), not measurements we ran.',
  limitation: 'Throughput swings roughly 100x across batch sizes on identical hardware. These figures assume a throughput-optimised serving configuration at high concurrency — which is itself a demand-density assumption, not a hardware property. At low concurrency you will not reach these numbers.',
  asOf: '2026-08'
}
