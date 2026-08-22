// Resolves a catalog model to REAL prices from the live LiteLLM feed.
//
// Why a matcher and not a single key: the same open model is served by a dozen
// providers at wildly different rates (Llama 3.3 70B ranged $0.12–$0.72 in and
// $0.20–$2.25 out in the July 2026 feed). Picking one provider's key silently
// picks a winner. We take the MEDIAN across serving providers as the headline
// price and expose min/median/max so the spread is visible — that spread is the
// single biggest source of error in any self-host-vs-API comparison.
//
// Every price here traces to a feed key, listed in `keys`. Models with no feed
// match keep their curated figure and are badged `curated` — never silently
// mixed in with live data.

// Providers that actually sell open-weight models per token. Hyperscaler managed
// offerings (bedrock/azure/vertex/oci) are excluded from the OPEN-model spread:
// they publish one price per region, so 15 identical regional rows would swamp
// the median and they're a different product (enterprise managed, not neocloud).
// Frontier closed models use their first-party key directly instead — see FRONTIER.
const NEO_PROVIDERS = new Set([
  'deepinfra', 'together_ai', 'fireworks_ai', 'groq', 'novita', 'hyperbolic',
  'nebius', 'deepseek', 'mistral', 'cohere_chat', 'cohere', 'sambanova',
  'cerebras', 'baseten', 'nscale', 'crusoe', 'gmi', 'lambda_ai', 'moonshot',
  'openrouter', 'anyscale', 'perplexity', 'featherless_ai', 'friendliai'
])

const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
const round = (n) => (n == null ? null : Math.round(n * 1e4) / 1e4)

// A matcher is a list of alternative term-groups; a key matches if EVERY term in
// ANY group appears in it, and NO term in `not` appears. Case-insensitive.
function keyMatches(key, match) {
  const k = key.toLowerCase()
  if (match.not && match.not.some((t) => k.includes(t))) return false
  return (match.any || []).some((group) => group.every((t) => k.includes(t)))
}

// Resolve one model against the feed. Returns null when nothing matches, so the
// caller can fall back to the curated figure and badge it honestly.
export function resolvePrice(feed, match, { providers = NEO_PROVIDERS } = {}) {
  if (!feed?.prices || !match?.any?.length) return null

  const hits = []
  for (const [key, v] of Object.entries(feed.prices)) {
    if (providers && !providers.has(v.provider)) continue
    // A zero price is a placeholder in the feed, not a free model.
    if (!(v.in > 0) || !(v.out > 0)) continue
    if (!keyMatches(key, match)) continue
    hits.push({ key, ...v })
  }
  if (!hits.length) return null

  const ins = hits.map((h) => h.in)
  const outs = hits.map((h) => h.out)
  const cacheReads = hits.map((h) => h.cacheRead).filter((c) => typeof c === 'number' && c >= 0)

  return {
    source: 'live',
    in: round(median(ins)),
    out: round(median(outs)),
    // Cache-read price is published by only some providers. Where absent the
    // caller applies a documented fallback rather than pretending it's free.
    cacheRead: cacheReads.length ? round(median(cacheReads)) : null,
    cacheReadIsEstimate: cacheReads.length === 0,
    spread: {
      n: hits.length,
      inMin: round(Math.min(...ins)), inMax: round(Math.max(...ins)),
      outMin: round(Math.min(...outs)), outMax: round(Math.max(...outs)),
      providers: [...new Set(hits.map((h) => h.provider))].sort()
    },
    keys: hits.map((h) => h.key).sort()
  }
}

// Frontier closed models resolve against their FIRST-PARTY key only — there is
// no provider spread to speak of (Azure/Bedrock resell at ±10%), so a median
// over regional duplicates would add noise, not information.
export function resolveFrontier(feed, keys) {
  if (!feed?.prices) return null
  for (const key of keys) {
    const v = feed.prices[key]
    if (v && v.in > 0 && v.out > 0) {
      return {
        source: 'live',
        in: round(v.in), out: round(v.out),
        cacheRead: typeof v.cacheRead === 'number' ? round(v.cacheRead) : null,
        cacheReadIsEstimate: typeof v.cacheRead !== 'number',
        spread: null,
        keys: [key]
      }
    }
  }
  return null
}

// Frontier API models — the baseline a team is REALLY choosing against when they
// consider self-hosting an open model. Keys are first-party LiteLLM feed keys;
// alternates are tried in order so the catalog survives a model being renamed.
export const FRONTIER = [
  { id: 'gpt-5.6',        label: 'GPT-5.6',          org: 'OpenAI',    tier: 'frontier', keys: ['gpt-5.6', 'gpt-5.5', 'gpt-5.1'] },
  { id: 'gpt-5.6-luna',   label: 'GPT-5.6 Luna',     org: 'OpenAI',    tier: 'mid',      keys: ['gpt-5.6-luna', 'gpt-5-mini'] },
  { id: 'claude-opus-5',  label: 'Claude Opus 5',    org: 'Anthropic', tier: 'frontier', keys: ['claude-opus-5', 'claude-opus-4-8'] },
  { id: 'claude-sonnet-5',label: 'Claude Sonnet 5',  org: 'Anthropic', tier: 'mid',      keys: ['claude-sonnet-5', 'claude-sonnet-4-5'] },
  { id: 'claude-haiku-4-5',label:'Claude Haiku 4.5', org: 'Anthropic', tier: 'cheap',    keys: ['claude-haiku-4-5'] },
  { id: 'gemini-3-pro',   label: 'Gemini 3.1 Pro',   org: 'Google',    tier: 'frontier', keys: ['gemini-3.1-pro-preview', 'gemini-3-pro-preview'] },
  { id: 'gemini-3-flash', label: 'Gemini 3.5 Flash', org: 'Google',    tier: 'mid',      keys: ['gemini-3.5-flash', 'gemini-3-flash-preview'] },
  { id: 'gemini-3-flash-lite', label: 'Gemini 3.1 Flash-Lite', org: 'Google', tier: 'cheap', keys: ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'] }
]

export function frontierModels(feed) {
  return FRONTIER.map((f) => {
    const price = resolveFrontier(feed, f.keys)
    return { ...f, price, closed: true, asOf: feed?.asOf || null }
  }).filter((f) => f.price)
}

export { NEO_PROVIDERS }
