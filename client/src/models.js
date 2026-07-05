// Curated candidate catalog. Each entry lists possible LiteLLM feed keys; we use
// the live price if any key is present, else the baked fallback (with its
// snapshot date). `quality` is a coarse 1-4 tier (1=small, 4=frontier) used only
// to map the quality bar to candidates — documented, not a benchmark claim.
// `open` marks self-hostable open-weight models. `params` (B) drives the
// heuristic self-host throughput/VRAM defaults, reused in the spirit of
// selfhostllm / gpu_poor rather than measured.

export const CATALOG = [
  // ---- open-weight, self-hostable (bulk-tier candidates) ----
  { id: 'llama-3.1-8b', label: 'Llama 3.1 8B', provider: 'Meta (open)', open: true, params: 8, quality: 1,
    feedKeys: ['groq/llama-3.1-8b-instant', 'together_ai/meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'],
    fallback: { in: 0.05, out: 0.08, cacheRead: null } },
  { id: 'mistral-small', label: 'Mistral Small', provider: 'Mistral (open)', open: true, params: 22, quality: 2,
    feedKeys: ['mistral/mistral-small-latest'],
    fallback: { in: 0.2, out: 0.6, cacheRead: null } },
  { id: 'llama-3.3-70b', label: 'Llama 3.3 70B', provider: 'Meta (open)', open: true, params: 70, quality: 3,
    feedKeys: ['groq/llama-3.3-70b-versatile', 'together_ai/meta-llama/Llama-3.3-70B-Instruct-Turbo'],
    fallback: { in: 0.59, out: 0.79, cacheRead: null } },
  { id: 'qwen-2.5-72b', label: 'Qwen 2.5 72B', provider: 'Alibaba (open)', open: true, params: 72, quality: 3,
    feedKeys: ['fireworks_ai/accounts/fireworks/models/qwen2p5-72b-instruct'],
    fallback: { in: 0.9, out: 0.9, cacheRead: null } },
  { id: 'deepseek-v3', label: 'DeepSeek V3', provider: 'DeepSeek (open)', open: true, params: 671, moeActive: 37, quality: 3,
    feedKeys: ['deepseek/deepseek-chat'],
    fallback: { in: 0.27, out: 1.1, cacheRead: 0.07 } },

  // ---- closed / API-only (frontier & cheap-hosted candidates) ----
  { id: 'gemini-flash', label: 'Gemini 1.5 Flash', provider: 'Google', open: false, quality: 2,
    feedKeys: ['gemini/gemini-1.5-flash', 'gemini-1.5-flash'],
    fallback: { in: 0.075, out: 0.3, cacheRead: 0.01875 } },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'OpenAI', open: false, quality: 2,
    feedKeys: ['gpt-4o-mini'],
    fallback: { in: 0.15, out: 0.6, cacheRead: 0.075 } },
  { id: 'claude-haiku', label: 'Claude 3.5 Haiku', provider: 'Anthropic', open: false, quality: 2,
    feedKeys: ['claude-3-5-haiku-20241022', 'claude-3-5-haiku-latest'],
    fallback: { in: 0.8, out: 4, cacheRead: 0.08 } },
  { id: 'gemini-pro', label: 'Gemini 1.5 Pro', provider: 'Google', open: false, quality: 3,
    feedKeys: ['gemini/gemini-1.5-pro', 'gemini-1.5-pro'],
    fallback: { in: 1.25, out: 5, cacheRead: 0.3125 } },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', open: false, quality: 3,
    feedKeys: ['gpt-4o'],
    fallback: { in: 2.5, out: 10, cacheRead: 1.25 } },
  { id: 'claude-sonnet', label: 'Claude 3.5 Sonnet', provider: 'Anthropic', open: false, quality: 3,
    feedKeys: ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-latest'],
    fallback: { in: 3, out: 15, cacheRead: 0.3 } },
  { id: 'claude-opus', label: 'Claude 3 Opus', provider: 'Anthropic', open: false, quality: 4,
    feedKeys: ['claude-3-opus-20240229', 'claude-3-opus-latest'],
    fallback: { in: 15, out: 75, cacheRead: 1.5 } }
]

// Quality bar -> minimum quality tier a candidate must meet.
export const QUALITY_BARS = [
  { id: 'budget', label: 'Budget (small models OK)', floor: 1 },
  { id: 'mid', label: 'Mid-tier or better', floor: 2 },
  { id: 'high', label: 'High (strong models)', floor: 3 },
  { id: 'frontier', label: 'Frontier required', floor: 4 }
]

// Task type -> default hard-share (% routed to the strong tier) and default
// calls-per-task multiplier. Agentic loops many calls per task; a FAQ chatbot
// does one. These are editable defaults, not fixed truths.
export const TASK_TYPES = [
  { id: 'chatbot', label: 'Chatbot / FAQ', hardShare: 20, callsPerTask: 1 },
  { id: 'rag', label: 'RAG / search', hardShare: 30, callsPerTask: 1 },
  { id: 'batch', label: 'Batch processing', hardShare: 25, callsPerTask: 1 },
  { id: 'agentic', label: 'Agentic / tools', hardShare: 40, callsPerTask: 6 }
]

// Resolve a catalog entry's price: live feed key if present, else fallback.
export function resolvePrice(entry, feed) {
  if (feed?.prices) {
    for (const key of entry.feedKeys) {
      if (feed.prices[key]) {
        return { ...feed.prices[key], key, live: !!feed.live, asOf: feed.asOf }
      }
    }
  }
  return { ...entry.fallback, key: null, live: false, asOf: '2025-06-01 (bundled)' }
}

// Pick the cheap (bulk) and strong candidates meeting the quality bar for a task.
// Bulk tier prefers an open-weight model so the self-host comparison is meaningful.
export function recommendMix(feed, barId, taskId) {
  const bar = QUALITY_BARS.find((b) => b.id === barId) || QUALITY_BARS[1]
  const eligible = CATALOG.filter((m) => m.quality >= bar.floor)
  const pool = eligible.length ? eligible : CATALOG.slice()

  const priced = pool.map((m) => ({ m, p: resolvePrice(m, feed) }))
  const blended = (x) => x.p.in * 0.75 + x.p.out * 0.25 // rough $/1M proxy for ranking

  // Bulk: cheapest overall, preferring open-weight (self-hostable) on ties of intent.
  const openCandidates = priced.filter((x) => x.m.open)
  const bulkFrom = openCandidates.length ? openCandidates : priced
  const bulk = [...bulkFrom].sort((a, b) => blended(a) - blended(b))[0]

  // Strong: highest quality; break ties by cheaper.
  const strong = [...priced].sort(
    (a, b) => b.m.quality - a.m.quality || blended(a) - blended(b)
  )[0]

  return { bar, bulk, strong }
}
