// Re-pin the price feeds the paper is computed against.
//
// The paper's tables must be reproducible, so they are generated from committed
// snapshots rather than from whatever the feeds say today. This script replaces
// those snapshots with the live feeds, which is the one moment the paper's
// numbers are allowed to move. Every table and figure must be regenerated after
// it runs, and §5, §5.1 and §6 of the paper edited to match:
//
//   npm start                  # in another shell; this reads its live endpoints
//   npm run refresh:paper      # this script
//   npm run paper:figures      # the tables — copy its output into the paper
//   npm run paper:charts       # figures 2–5, 7, 8
//   node scripts/make-figure2.mjs
//   npm run paper:pdf
//
// Run: npm run refresh:paper [-- --port 3001]

import { writeFile, readFile } from 'node:fs/promises'

const argv = process.argv.slice(2)
const port = Number(argv[argv.indexOf('--port') + 1]) || 3001
const base = `http://localhost:${port}`

const targets = [
  ['/api/prices', '../server/paper-prices.json'],
  ['/api/gpus', '../server/paper-gpu-prices.json'],
]

// The provider snapshot is refreshed weekly by CI, so §13 would otherwise go stale
// every Sunday while claiming to be reproducible. The paper reads this pinned copy.
async function pinSnapshot() {
  const from = new URL('../server/openrouter-snapshot.json', import.meta.url)
  const to = new URL('../server/paper-openrouter.json', import.meta.url)
  const snap = JSON.parse(await readFile(from, 'utf8'))
  let before = null
  try { before = JSON.parse(await readFile(to, 'utf8')).fetchedAt } catch {}
  await writeFile(to, JSON.stringify(snap, null, 2) + '\n')
  console.log(`  server/paper-openrouter.json  ${before} -> ${snap.fetchedAt}  (${snap.counts.models} models)`)
}

async function main() {
  for (const [route, file] of targets) {
    const url = new URL(file, import.meta.url)
    let before = null
    try { before = JSON.parse(await (await import('node:fs/promises')).readFile(url, 'utf8')).asOf } catch {}

    const res = await fetch(base + route)
    if (!res.ok) throw new Error(`${route} returned ${res.status}`)
    const feed = await res.json()

    // A pinned feed with live:false is a cached or fallback response, which would
    // silently freeze the paper against stale data.
    if (!feed.live) throw new Error(`${route} answered from cache (live:false) — not pinning`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(feed.asOf || '')) throw new Error(`${route} has no asOf date`)

    await writeFile(url, JSON.stringify(feed, null, 2) + '\n')
    const size = feed.count ?? feed.gpus?.length
    console.log(`  ${file.replace('../', '')}  ${before} -> ${feed.asOf}  (${size} entries)`)
  }
  await pinSnapshot()
  console.log('\nPinned. Now regenerate the tables and figures, and edit the paper to match:')
  console.log('  npm run paper:figures && npm run paper:charts && node scripts/make-figure2.mjs && npm run paper:pdf')
}

main().catch((e) => {
  console.error(`\nFailed: ${e.message}`)
  console.error(`Is the server running? npm start (expected at ${base})`)
  process.exit(1)
})
