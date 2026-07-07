import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getPrices } from './prices.js'
import { computeDecision, computeCompare, catalog, gpus, providers, precisions, API_INDEX } from './api.js'

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

app.get('/api', (_req, res) => res.json(API_INDEX))
app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/api/decide', withFeed((q, feed) => computeDecision(q, feed)))
app.get('/api/compare', withFeed((q, feed) => computeCompare(q, feed)))
app.get('/api/models', withFeed((_q, feed) => catalog(feed)))
app.get('/api/providers', (_req, res) => res.json(providers()))
app.get('/api/gpus', (_req, res) => res.json(gpus()))
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

// Serve the built frontend in production.
const dist = join(__dirname, '..', 'dist')
app.use(express.static(dist))
app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')))

app.listen(PORT, () => {
  console.log(`tokencalci listening on :${PORT}`)
})
