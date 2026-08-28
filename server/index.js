import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getPrices } from './prices.js'
import { historyPayload } from './history.js'
import { getGpuPrices } from './gpuprices.js'
import { getSnapshot } from './openrouter.js'
import { computeDecision, computeCompare, catalog, frontier, sources, openrouter, gpus, providers, precisions, API_INDEX } from './api.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

// Public read-only API — allow any origin so other agents/services can call it.
app.use('/api', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

const withFeed = (handler) => async (req, res) => {
  try {
    const feed = await getPrices()
    res.set('Cache-Control', 'public, max-age=300')
    res.json(handler(req.query, feed))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Endpoints whose economics depend on GPU rental prices need both feeds.
const withFeeds = (handler) => async (req, res) => {
  try {
    const [feed, gpuFeed, orSnap] = await Promise.all([getPrices(), getGpuPrices(), getSnapshot()])
    res.set('Cache-Control', 'public, max-age=300')
    res.json(handler(req.query, feed, gpuFeed, orSnap || null))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

app.get('/api', (_req, res) => res.json(API_INDEX))
app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/api/decide', withFeeds((q, feed, gpuFeed, orSnap) => computeDecision(q, feed, gpuFeed, orSnap)))
app.get('/api/compare', withFeeds((q, feed, gpuFeed, orSnap) => computeCompare(q, feed, gpuFeed, orSnap)))
app.get('/api/models', withFeed((_q, feed) => catalog(feed)))
app.get('/api/frontier', withFeed((_q, feed) => frontier(feed)))
app.get('/api/history', async (_req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=3600')
    res.json(await historyPayload())
  } catch (err) { res.status(500).json({ error: err.message }) }
})
app.get('/api/sources', (_req, res) => res.json(sources()))
app.get('/api/openrouter', async (_req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=3600')
    res.json(openrouter(await getSnapshot() || null))
  } catch (err) { res.status(500).json({ error: err.message }) }
})
app.get('/api/providers', (_req, res) => res.json(providers()))
app.get('/api/gpus', async (_req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=300')
    res.json(await gpus())
  } catch (err) { res.status(500).json({ error: err.message }) }
})
app.get('/api/precisions', (_req, res) => res.json(precisions()))

app.get('/api/prices', async (_req, res) => {
  try {
    const { asOf, source, prices, live } = await getPrices()
    res.set('Cache-Control', 'public, max-age=300')
    res.json({ asOf, source, live, count: Object.keys(prices).length, prices })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Serve SKILL.md for agent discovery.
app.get('/SKILL.md', (_req, res) => res.sendFile(join(__dirname, '..', 'SKILL.md')))

// The paper, served from the same file the repository holds — one source of
// truth for a document whose entire argument is "check my numbers".
app.get('/paper.md', (_req, res) => {
  res.type('text/markdown; charset=utf-8')
  res.sendFile(join(__dirname, '..', 'docs', 'from-free-weights-to-reliable-tokens.md'))
})

// Unknown /api paths must 404 as JSON. Without this they fall through to the SPA
// catch-all below and return index.html with a 200 — so a typo'd endpoint looks
// like success to anything consuming this as an API, which is most of the point.
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: `unknown endpoint '${req.path}'`,
    hint: 'GET /api lists every available endpoint.',
    endpoints: Object.keys(API_INDEX.endpoints)
  })
})

// Serve the built frontend in production.
const dist = join(__dirname, '..', 'dist')
app.use(express.static(dist))
app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')))

app.listen(PORT, () => {
  console.log(`opentoken listening on :${PORT}`)
})
