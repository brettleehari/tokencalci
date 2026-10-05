// WEEKLY BATCH: refresh the offline fallback price snapshot.
//
// server/snapshot.json is what the app serves when the LiteLLM feed is
// unreachable. It is a fallback, not the normal path — but a fallback that is a
// year stale is worse than useless, because the UI keeps its own as-of date and
// quietly reports prices nobody charges any more.
//
// Only the keys the catalogue actually resolves are kept, using the same matcher
// the app uses at runtime, so the file stays small and cannot drift from what the
// resolver expects.
//
// Run: npm run refresh:snapshot

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { FEED_URL, normalize } from './prices.js'
import { MODELS, MODEL_MATCH } from '../client/src/hwdata.js'
import { resolvePrice, resolveFrontier, FRONTIER } from '../client/src/pricing.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'snapshot.json')

async function main() {
  console.log('Refreshing the offline price snapshot...\n')

  const res = await fetch(FEED_URL)
  if (!res.ok) throw new Error(`LiteLLM feed returned ${res.status}`)
  const prices = normalize(await res.json())
  console.log(`  live feed: ${Object.keys(prices).length} priced keys`)

  // Ask the real resolver which keys it reads, then keep exactly those.
  const feed = { prices }
  const keep = new Set()
  let matched = 0
  for (const m of MODELS) {
    const hit = resolvePrice(feed, MODEL_MATCH[m.id])
    if (!hit) continue
    matched++
    for (const k of hit.keys) keep.add(k)
  }
  for (const f of FRONTIER) {
    const hit = resolveFrontier(feed, f.keys)
    if (hit) for (const k of f.keys) if (prices[k]) keep.add(k)
  }

  if (matched < 20) throw new Error(`only ${matched} catalogue models resolved — refusing to write`)

  const subset = {}
  for (const k of [...keep].sort()) subset[k] = prices[k]

  const snapshot = {
    asOf: new Date().toISOString().slice(0, 10),
    source: 'LiteLLM model_prices_and_context_window.json — offline fallback subset',
    note: 'Served only when the live feed is unreachable. Refreshed weekly by .github/workflows/refresh-data.yml.',
    prices: subset
  }
  await writeFile(OUT, JSON.stringify(snapshot, null, 2) + '\n')

  console.log(`  catalogue models resolved: ${matched} of ${MODELS.length}`)
  console.log(`  frontier models: ${FRONTIER.length}`)
  console.log(`\nWrote server/snapshot.json — ${Object.keys(subset).length} keys, as of ${snapshot.asOf}`)
}

main().catch((e) => {
  console.error(`\nFailed: ${e.message}`)
  process.exit(1)
})
