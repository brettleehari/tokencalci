import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getPrices } from './prices.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.get('/api/prices', async (_req, res) => {
  try {
    const { asOf, source, prices, live } = await getPrices()
    res.set('Cache-Control', 'public, max-age=300')
    res.json({ asOf, source, live, count: Object.keys(prices).length, prices })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Serve the built frontend in production.
const dist = join(__dirname, '..', 'dist')
app.use(express.static(dist))
app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')))

app.listen(PORT, () => {
  console.log(`tokencalci listening on :${PORT}`)
})
