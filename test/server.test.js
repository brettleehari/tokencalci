// HTTP route tests.
//
// These exist because of a near miss. Dependabot proposed Express 4 -> 5 with every
// check green, and the suite at the time did not start the server even once. Express
// 5 moves to path-to-regexp v8, where a bare `*` is no longer a valid path: both
// `app.all('/api/*')` and the `app.get('*')` SPA fallback throw at startup. The
// upgrade would have passed CI and taken the site down on deploy.
//
// So the first assertion here is the one that matters: the server starts at all.
// Everything after it is the contract the frontend and the paper's links depend on.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3400 + (process.pid % 400)   // avoid collisions with a dev server
const BASE = `http://127.0.0.1:${PORT}`
const hasDist = existsSync(join(ROOT, 'dist', 'index.html'))

let proc
let startupLog = ''

before(async () => {
  proc = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const collect = (d) => { startupLog = (startupLog + d.toString()).slice(-4000) }
  proc.stdout.on('data', collect)
  proc.stderr.on('data', collect)

  // If the route table is invalid the process exits before it ever listens, so
  // watch for that rather than waiting out the whole timeout.
  let exited = null
  proc.on('exit', (code) => { exited = code })

  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (exited !== null) {
      throw new Error(`server exited with code ${exited} before listening.\n\n${startupLog}`)
    }
    try {
      const res = await fetch(`${BASE}/api/health`)
      if (res.ok) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`server did not start within 30s.\n\n${startupLog}`)
})

after(() => {
  if (proc && !proc.killed) proc.kill('SIGKILL')
})

describe('the server starts and routes resolve', () => {
  test('health check answers', async () => {
    const res = await fetch(`${BASE}/api/health`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true })
  })

  test('the API index lists its routes', async () => {
    const res = await fetch(`${BASE}/api`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type')?.includes('application/json'), true)
  })

  test('API responses carry the CORS header', async () => {
    const res = await fetch(`${BASE}/api/health`)
    assert.equal(res.headers.get('access-control-allow-origin'), '*')
  })
})

describe('wildcard routes — the Express 5 breakage', () => {
  // Both of these are bare `*` patterns in Express 4 and must be named captures in
  // Express 5. If either regresses, the process will not have started at all and
  // `before` has already failed loudly.
  test('an unknown /api path returns a JSON 404, not the SPA shell', async () => {
    const res = await fetch(`${BASE}/api/definitely-not-a-route`)
    assert.equal(res.status, 404)
    assert.equal(res.headers.get('content-type')?.includes('application/json'), true)
    const body = await res.json()
    assert.ok(body.error || body.message, 'a 404 from the API should say something')
  })

  test('an unknown non-API path falls through to the SPA', { skip: !hasDist && 'dist not built' }, async () => {
    const res = await fetch(`${BASE}/some/deep/client/route`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type')?.includes('text/html'), true)
  })

  test('the root serves the app', { skip: !hasDist && 'dist not built' }, async () => {
    const res = await fetch(`${BASE}/`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type')?.includes('text/html'), true)
  })
})

describe('the documents the paper links to', () => {
  test('/paper.md serves markdown', async () => {
    const res = await fetch(`${BASE}/paper.md`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type')?.includes('text/markdown'), true)
    const body = await res.text()
    assert.match(body, /^# From Free Weights to Reliable Tokens/, 'should be the paper itself')
  })

  test('/paper.pdf serves a PDF inline', async () => {
    const res = await fetch(`${BASE}/paper.pdf`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type')?.includes('application/pdf'), true)
    assert.match(res.headers.get('content-disposition') ?? '', /inline/)
    const head = Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()
    assert.equal(head, '%PDF-', 'should begin with the PDF magic bytes')
  })

  test('/canvas.md and /SKILL.md resolve', async () => {
    for (const path of ['/canvas.md', '/SKILL.md']) {
      const res = await fetch(BASE + path)
      assert.equal(res.status, 200, `${path} should resolve`)
    }
  })
})

describe('data endpoints', () => {
  // These read committed snapshots, falling back when a live feed is unreachable,
  // so they must answer on a machine with no network.
  test('/api/sources describes every data layer', async () => {
    const res = await fetch(`${BASE}/api/sources`)
    assert.equal(res.status, 200)
    const body = await res.json()
    const layers = body.layers ?? body.sources ?? []
    assert.ok(layers.length >= 10, 'expected the full provenance table')
  })

  test('/api/models returns the catalogue', async () => {
    const res = await fetch(`${BASE}/api/models`)
    assert.equal(res.status, 200)
    const body = await res.json()
    const list = Array.isArray(body) ? body : (body.models ?? [])
    assert.ok(list.length >= 20, 'expected a populated catalogue')
  })

  test('/api/prices always carries an as-of date', async () => {
    const res = await fetch(`${BASE}/api/prices`)
    assert.equal(res.status, 200)
    const body = await res.json()
    // Live or fallback, the contract is that a price never appears undated.
    assert.match(body.asOf ?? '', /^\d{4}-\d{2}-\d{2}$/, 'prices must be dated')
    assert.ok(typeof body.live === 'boolean', 'the response must say whether it is live')
  })
})
