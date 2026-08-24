// OPENROUTER CONNECTOR
//
// A second, independent source of truth. LiteLLM gives us prices; OpenRouter gives
// us four things LiteLLM does not:
//
//   1. SERVING QUANTIZATION per provider. The same model is served at anything from
//      fp4 to fp16. Our self-host side lets you pick a precision, so comparing it
//      against an API median that silently blends precisions is not like-for-like.
//   2. PROVIDER JURISDICTION (headquarters + datacenter regions) for ~100 providers.
//      The sovereignty view argues data residency; this is the data that argument needs.
//   3. UPTIME per provider per model. The API side of our comparison has always
//      assumed availability. Observed uptime on the same model ranges from ~40% to 100%.
//   4. An INDEPENDENT PRICE for cross-checking. Where two feeds disagree, that
//      disagreement is information — and no single-source competitor can show it.
//
// Cadence: the per-model endpoint data needs one request per model, which is far too
// slow for the request path. So this is a WEEKLY BATCH: refresh-openrouter.js writes a
// committed snapshot, and the server only ever reads it. That also means the app keeps
// working when OpenRouter is unreachable, and on hosts that sleep (Render free tier)
// where an in-process weekly timer would never reliably fire.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const SNAPSHOT_PATH = join(__dirname, 'openrouter-snapshot.json')

const BASE = 'https://openrouter.ai/api/v1'
export const REFRESH_DAYS = 7

// Our catalog id -> OpenRouter model id. Alternates are tried in order, so an entry
// survives OpenRouter renaming or retiring a slug.
export const OR_MODEL_MAP = {
  'deepseek-v4-pro': ['deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-pro-0813'],
  'deepseek-v4-flash': ['deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-flash-latest'],
  'deepseek-v3': ['deepseek/deepseek-chat', 'deepseek/deepseek-v3.2', 'deepseek/deepseek-v3.1'],
  'deepseek-r1': ['deepseek/deepseek-r1'],
  'deepseek-coder-v2': ['deepseek/deepseek-coder'],
  'kimi-k2.6': ['moonshotai/kimi-k2.6', 'moonshotai/kimi-k2.5'],
  'glm-5.2': ['z-ai/glm-5.2', 'z-ai/glm-5.1', 'z-ai/glm-5'],
  'minimax-m3': ['minimax/minimax-m3'],
  'mistral-large-3': ['mistralai/mistral-large-2512', 'mistralai/mistral-large'],
  'qwen3-coder-480b': ['qwen/qwen3-coder'],
  'qwen3-235b': ['qwen/qwen3-235b-a22b'],
  'qwen3-next-80b': ['qwen/qwen3-next-80b-a3b-instruct'],
  'qwen3-32b': ['qwen/qwen3-32b'],
  'qwen3-30b-a3b': ['qwen/qwen3-30b-a3b'],
  'qwen3-8b': ['qwen/qwen3-8b'],
  'qwen-72b': ['qwen/qwen-2.5-72b-instruct'],
  'qwen-32b': ['qwen/qwen2.5-32b-instruct'],
  'qwen-coder-32b': ['qwen/qwen-2.5-coder-32b-instruct'],
  'qwen-14b': ['qwen/qwen-2.5-14b-instruct'],
  'qwen-7b': ['qwen/qwen-2.5-7b-instruct'],
  'qwq-32b': ['qwen/qwq-32b'],
  'gpt-oss-120b': ['openai/gpt-oss-120b'],
  'gpt-oss-20b': ['openai/gpt-oss-20b'],
  'llama-70b': ['meta-llama/llama-3.3-70b-instruct'],
  'llama-405b': ['meta-llama/llama-3.1-405b-instruct'],
  'llama-8b': ['meta-llama/llama-3.1-8b-instruct'],
  'llama-3b': ['meta-llama/llama-3.2-3b-instruct'],
  'llama4-maverick': ['meta-llama/llama-4-maverick'],
  'llama4-scout': ['meta-llama/llama-4-scout'],
  'nemotron-3-super': ['nvidia/nemotron-3-super-120b-a12b', 'nvidia/llama-3.3-nemotron-super-49b-v1.5'],
  'nemotron-70b': ['nvidia/llama-3.1-nemotron-70b-instruct'],
  'gemma4-31b': ['google/gemma-4-31b-it'],
  'gemma3-27b': ['google/gemma-3-27b-it'],
  'gemma3-12b': ['google/gemma-3-12b-it'],
  'gemma3-4b': ['google/gemma-3-4b-it'],
  'gemma2-9b': ['google/gemma-2-9b-it'],
  'mistral-small-3': ['mistralai/mistral-small-3.2-24b-instruct', 'mistralai/mistral-small'],
  'mistral-nemo': ['mistralai/mistral-nemo'],
  'mistral-7b': ['mistralai/mistral-7b-instruct'],
  'ministral-8b': ['mistralai/ministral-8b'],
  'codestral': ['mistralai/codestral-2508'],
  'pixtral-12b': ['mistralai/pixtral-12b'],
  'mixtral-8x22b': ['mistralai/mixtral-8x22b-instruct'],
  'command-r-plus': ['cohere/command-r-plus-08-2024', 'cohere/command-r-plus'],
  'command-r': ['cohere/command-r-08-2024', 'cohere/command-r'],
  'phi-4': ['microsoft/phi-4'],
  'granite-8b': ['ibm-granite/granite-4.1-8b'],
  'dbrx': ['databricks/dbrx-instruct'],
  'yi-34b': ['01-ai/yi-large'],
  'starcoder2-15b': ['bigcode/starcoder2-15b'],
  'aya-32b': ['cohere/aya-expanse-32b'],
  'internlm-20b': ['internlm/internlm2_5-20b-chat'],
  'olmo2-13b': ['allenai/olmo-2-0325-32b-instruct'],
  'falcon3-10b': ['tiiuae/falcon3-10b-instruct'],
  'llama-405b-alt': ['meta-llama/llama-3.1-405b']
}

const PER_M = 1_000_000
const num = (v) => (v == null ? null : Number(v))
const per1M = (v) => {
  const n = num(v)
  return n == null || Number.isNaN(n) ? null : Math.round(n * PER_M * 1e6) / 1e6
}

async function get(path, { timeout = 25000 } = {}) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), timeout)
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: c.signal,
      headers: { 'User-Agent': 'opentoken-connector', Accept: 'application/json' }
    })
    if (!res.ok) throw new Error(`OpenRouter ${res.status} on ${path}`)
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

// --- fetchers (used by the weekly batch, never on the request path) ---

export async function fetchModels() {
  const { data } = await get('/models')
  const byId = {}
  for (const m of data || []) {
    byId[m.id] = {
      id: m.id,
      name: m.name,
      contextLength: m.context_length ?? null,
      knowledgeCutoff: m.knowledge_cutoff ?? null,
      huggingFaceId: m.hugging_face_id ?? null,
      modality: m.architecture?.modality ?? null,
      tokenizer: m.architecture?.tokenizer ?? null,
      inputModalities: m.architecture?.input_modalities ?? null,
      pricing: {
        in: per1M(m.pricing?.prompt),
        out: per1M(m.pricing?.completion),
        cacheRead: per1M(m.pricing?.input_cache_read)
      },
      created: m.created ?? null
    }
  }
  return { count: Object.keys(byId).length, byId }
}

export async function fetchProviders() {
  const { data } = await get('/providers')
  return (data || []).map((p) => ({
    name: p.name,
    slug: p.slug,
    // The reason this connector exists for the sovereignty view.
    headquarters: p.headquarters ?? null,
    datacenters: p.datacenters ?? null,
    statusPageUrl: p.status_page_url ?? null,
    privacyPolicyUrl: p.privacy_policy_url ?? null,
    termsUrl: p.terms_of_service_url ?? null
  }))
}

// Per-provider serving detail for ONE model: quantization, uptime, price.
export async function fetchEndpoints(orId) {
  const { data } = await get(`/models/${orId}/endpoints`)
  const eps = data?.endpoints || []
  return eps.map((e) => ({
    provider: e.provider_name ?? e.name ?? null,
    // fp4 / fp8 / bf16 / fp16 / unknown — the field that makes the comparison honest.
    quantization: e.quantization ?? 'unknown',
    contextLength: e.context_length ?? null,
    in: per1M(e.pricing?.prompt),
    out: per1M(e.pricing?.completion),
    uptime30m: num(e.uptime_last_30m),
    uptime1d: num(e.uptime_last_1d),
    // Present in the schema but null without an API key. Captured anyway so the
    // snapshot starts carrying it the moment access changes.
    throughput30m: num(e.throughput_last_30m),
    latency30m: num(e.latency_last_30m),
    status: e.status ?? null
  }))
}

// Resolve one of our catalog ids to a live OpenRouter id.
export function resolveOrId(catalogId, models) {
  const candidates = OR_MODEL_MAP[catalogId] || []
  for (const c of candidates) if (models.byId[c]) return c
  return null
}

// --- snapshot access (the ONLY thing the running server touches) ---

let cache = null

export async function getSnapshot() {
  if (cache !== null) return cache
  try {
    cache = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'))
  } catch {
    cache = false // distinguish "checked, absent" from "not yet checked"
  }
  return cache
}

export function ageDays(snap) {
  if (!snap?.fetchedAt) return null
  const ms = Date.now() - new Date(snap.fetchedAt + 'T00:00:00Z').getTime()
  return Math.floor(ms / 86400000)
}

// Freshness is reported, never hidden. A stale snapshot still serves — it just
// says how stale, the same way the price feed does.
export function freshness(snap) {
  if (!snap) {
    return { available: false, stale: true, ageDays: null, refreshDays: REFRESH_DAYS,
      note: 'No OpenRouter snapshot — run: npm run refresh:openrouter' }
  }
  const age = ageDays(snap)
  return {
    available: true,
    fetchedAt: snap.fetchedAt,
    ageDays: age,
    refreshDays: REFRESH_DAYS,
    stale: age != null && age > REFRESH_DAYS,
    note: age != null && age > REFRESH_DAYS
      ? `Snapshot is ${age} days old (weekly cadence) — re-run npm run refresh:openrouter`
      : `Refreshed weekly; ${age} day(s) old.`
  }
}

const median = (xs) => {
  const s = xs.filter((v) => v != null).sort((a, b) => a - b)
  if (!s.length) return null
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const round = (n) => (n == null ? null : Math.round(n * 1e4) / 1e4)

// CROSS-CHECK: what a second, independent feed says about the same model.
//
// Two feeds agreeing raises confidence; two feeds disagreeing by 5x means the
// number is uncertain and the user should be told, not smoothed over. A
// single-source tool structurally cannot produce this signal.
export function crossCheck(catalogId, litellmIn, snap) {
  const e = snap?.endpoints?.[catalogId]
  if (!e?.providers?.length) return null

  const orIn = median(e.providers.map((p) => p.in))
  const orOut = median(e.providers.map((p) => p.out))
  const ratio = orIn > 0 && litellmIn > 0 ? litellmIn / orIn : null
  // 1.5x is the threshold at which a disagreement changes a decision rather than
  // reflecting a different provider sample.
  const agrees = ratio == null ? null : ratio <= 1.5 && ratio >= 1 / 1.5

  const uptimes = e.providers.map((p) => p.uptime30m).filter((v) => v != null)

  return {
    openrouterId: e.orId,
    providers: e.providers.length,
    openrouterMedianIn: round(orIn),
    openrouterMedianOut: round(orOut),
    litellmMedianIn: round(litellmIn),
    ratio: round(ratio),
    agrees,
    quantization: e.quantization,
    // Serving reliability — the API side of our comparison has always assumed 100%.
    uptime: uptimes.length
      ? { min: round(Math.min(...uptimes)), median: round(median(uptimes)), max: round(Math.max(...uptimes)), sampled: uptimes.length }
      : null,
    note: agrees === false
      ? `The two independent price feeds disagree by ${round(ratio)}x on this model. Treat its cost as uncertain and check the provider you would actually use.`
      : agrees === true
        ? 'Two independent price feeds agree within 1.5x.'
        : null
  }
}

// Providers whose stated jurisdiction is known — the data the sovereignty view needs.
export function jurisdictions(snap) {
  const ps = (snap?.providers || []).filter((p) => p.headquarters || p.datacenters)
  const byCountry = {}
  for (const p of ps) {
    const k = p.headquarters || 'unstated'
    ;(byCountry[k] ||= []).push(p.name)
  }
  return {
    total: snap?.providers?.length || 0,
    withJurisdiction: ps.length,
    byHeadquarters: Object.fromEntries(
      Object.entries(byCountry).sort((a, b) => b[1].length - a[1].length)
    ),
    providers: ps.map((p) => ({
      name: p.name, slug: p.slug, headquarters: p.headquarters,
      datacenters: p.datacenters, statusPageUrl: p.statusPageUrl, termsUrl: p.termsUrl
    }))
  }
}

// Quantization summary for a model: what precisions is it actually served at, and
// does the headline median blend several? Answering that is the whole point.
export function quantizationSummary(endpoints) {
  if (!endpoints?.length) return null
  const groups = {}
  for (const e of endpoints) {
    const q = (e.quantization || 'unknown').toLowerCase()
    const bucket = ['bf16', 'fp16'].includes(q) ? 'full'
      : q === 'fp8' ? 'fp8'
      : ['fp4', 'int4', 'nf4'].includes(q) ? 'fp4'
      : 'unknown'
    ;(groups[bucket] ||= []).push(e)
  }
  const med = (xs) => {
    const s = xs.filter((v) => v != null).sort((a, b) => a - b)
    if (!s.length) return null
    const m = s.length >> 1
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }
  const out = {}
  for (const [k, v] of Object.entries(groups)) {
    out[k] = { providers: v.length, medianIn: med(v.map((e) => e.in)), medianOut: med(v.map((e) => e.out)) }
  }
  const known = Object.keys(groups).filter((k) => k !== 'unknown')
  return {
    byPrecision: out,
    distinctPrecisions: known.length,
    // True when the headline number blends genuinely different products.
    mixed: known.length > 1,
    unknownProviders: groups.unknown?.length || 0
  }
}

// Observed serving precision per catalogue model, derived from the weekly snapshot.
// Returns { modelId: { fp8: {providers: n}, ... } } in the shape servingPrecisionFor
// expects, so the client (which gets this via /api/openrouter) and the server compute
// the same answer from the same evidence.
export function servingPrecisionMap(snap) {
  const out = {}
  for (const [modelId, e] of Object.entries(snap?.endpoints || {})) {
    const counts = {}
    for (const p of e?.providers || []) {
      const q = (p?.quantization || 'unknown').toLowerCase()
      if (q === 'unknown') continue
      counts[q] = counts[q] || { providers: 0 }
      counts[q].providers++
    }
    if (Object.keys(counts).length) out[modelId] = counts
  }
  return out
}
