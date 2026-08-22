// WEEKLY BATCH: pull OpenRouter into a committed snapshot.
//
// Run: npm run refresh:openrouter        (all catalog models)
//      npm run refresh:openrouter -- 10  (first 10 only — quick smoke test)
//
// Writes server/openrouter-snapshot.json, which is the ONLY thing the running
// server reads. Committing the output means the app never depends on OpenRouter
// being reachable at request time, and it works on hosts that sleep.
//
// Cost: 2 list calls + one call per catalog model (~55), paced to stay polite.

import { writeFile } from 'node:fs/promises'
import { MODELS } from '../client/src/hwdata.js'
import {
  fetchModels, fetchProviders, fetchEndpoints, resolveOrId,
  quantizationSummary, SNAPSHOT_PATH, REFRESH_DAYS
} from './openrouter.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const today = () => new Date().toISOString().slice(0, 10)

async function main() {
  const limit = Number(process.argv[2]) || Infinity
  console.log('Refreshing OpenRouter snapshot...\n')

  const [models, providers] = await Promise.all([fetchModels(), fetchProviders()])
  console.log(`  models:    ${models.count}`)
  console.log(`  providers: ${providers.length} (${providers.filter((p) => p.headquarters).length} with a stated HQ)`)

  const targets = MODELS.slice(0, limit === Infinity ? MODELS.length : limit)
  const endpoints = {}
  const unmatched = []
  let withQuant = 0

  console.log(`\n  pulling per-provider detail for ${targets.length} catalog models:`)
  for (const m of targets) {
    const orId = resolveOrId(m.id, models)
    if (!orId) { unmatched.push(m.id); continue }
    try {
      const eps = await fetchEndpoints(orId)
      if (!eps.length) { unmatched.push(`${m.id} (no endpoints)`); continue }
      const quant = quantizationSummary(eps)
      endpoints[m.id] = { orId, providers: eps, quantization: quant }
      if (quant?.distinctPrecisions) withQuant++
      const mixed = quant?.mixed ? ' MIXED-PRECISION' : ''
      console.log(`    ${m.id.padEnd(20)} ${orId.padEnd(42)} ${String(eps.length).padStart(2)} providers${mixed}`)
    } catch (err) {
      unmatched.push(`${m.id} (${err.message})`)
    }
    await sleep(250)
  }

  const snapshot = {
    fetchedAt: today(),
    source: 'OpenRouter public API (https://openrouter.ai/api/v1)',
    refreshDays: REFRESH_DAYS,
    note: 'Weekly batch. The server only reads this file; it never calls OpenRouter on the request path.',
    counts: {
      models: models.count,
      providers: providers.length,
      catalogMatched: Object.keys(endpoints).length,
      catalogTotal: MODELS.length,
      mixedPrecisionModels: Object.values(endpoints).filter((e) => e.quantization?.mixed).length
    },
    providers,
    endpoints,
    // Trimmed to the catalog plus anything matched, so the file stays reviewable
    // in a diff rather than being a 700KB blob nobody reads.
    models: Object.fromEntries(
      Object.entries(models.byId).filter(([id]) =>
        Object.values(endpoints).some((e) => e.orId === id))
    ),
    unmatched
  }

  await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2))

  console.log(`\n  matched ${snapshot.counts.catalogMatched}/${snapshot.counts.catalogTotal} catalog models`)
  console.log(`  ${snapshot.counts.mixedPrecisionModels} are served at MORE THAN ONE precision (blended medians are not like-for-like)`)
  if (unmatched.length) console.log(`  unmatched: ${unmatched.join(', ')}`)
  console.log(`\nWrote ${SNAPSHOT_PATH}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
