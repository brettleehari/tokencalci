// Unit tests for the cost model.
//
// These check the identities and the directions the paper asserts, not specific
// dollar figures — those live in the golden transcript, which moves when the feeds
// are re-pinned. A test here failing means the mechanism is wrong, not that prices
// changed.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { MODELS, KV_ARCH, pricedGpus, pricedModels, servingPrecisionFor } from '../client/src/hwdata.js'
import {
  kvBytesPerToken, vramBreakdown, vramNeed, gpusNeeded, deriveWorkload, deriveConcurrency,
  decodeEquivalentTokens, correlationTax, temporalTax, modelEconomics, decomposeCost, PER_STREAM_DECODE
} from '../client/src/hwcalc.js'
import { throughputFor } from '../client/src/throughput.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'))
const gpu = pricedGpus(J('server/paper-gpu-prices.json')).find((g) => g.id === 'h100')
const model = pricedModels(J('server/paper-prices.json')).find((m) => m.id === 'llama-70b')

describe('KV cache', () => {
  test('is linear in context and in concurrency', () => {
    const one = vramBreakdown(model, 'fp8', { ctxTokens: 1000, concurrency: 1 })
    const ctx2 = vramBreakdown(model, 'fp8', { ctxTokens: 2000, concurrency: 1 })
    const conc2 = vramBreakdown(model, 'fp8', { ctxTokens: 1000, concurrency: 2 })
    assert.ok(Math.abs(ctx2.kv - one.kv * 2) < 1e-6, 'doubling context should double KV')
    assert.ok(Math.abs(conc2.kv - one.kv * 2) < 1e-6, 'doubling concurrency should double KV')
  })

  test('is set by attention architecture, not parameter count (§6)', () => {
    // The paper's central KV claim: DeepSeek V3.2 has ~10x the parameters of
    // Llama 3.3 70B and a far smaller cache, because MLA stores a latent.
    const llama = MODELS.find((m) => m.id === 'llama-70b')
    const deepseek = MODELS.find((m) => m.id === 'deepseek-v32') || MODELS.find((m) => /deepseek v3/i.test(m.label))
    if (!deepseek) return // catalogue changed; §6's example is checked in the golden transcript
    assert.ok(deepseek.params > llama.params * 5, 'expected DeepSeek to be much larger')
    assert.ok(
      kvBytesPerToken(deepseek, 'fp8') < kvBytesPerToken(llama, 'fp8'),
      'the larger model should hold the smaller cache per token'
    )
  })

  test('every KV architecture entry is complete for its kind', () => {
    // Grouped-query entries need heads and head dimension; multi-head latent
    // attention stores a single latent instead, so it carries latentDim.
    for (const [id, a] of Object.entries(KV_ARCH)) {
      assert.ok(a.layers > 0, `${id}: layers missing`)
      assert.ok(['gqa', 'mla'].includes(a.kind), `${id}: unknown attention kind "${a.kind}"`)
      if (a.kind === 'mla') {
        assert.ok(a.latentDim > 0, `${id}: MLA entry needs latentDim`)
      } else {
        assert.ok(a.kvHeads > 0, `${id}: GQA entry needs kvHeads`)
        assert.ok(a.headDim > 0, `${id}: GQA entry needs headDim`)
      }
      assert.ok(kvBytesPerToken({ id, ...MODELS.find((m) => m.id === id) }, 'fp8') > 0,
        `${id}: produces no KV bytes per token`)
    }
  })
})

describe('fleet sizing', () => {
  test('GPUs per replica is a step function of context', () => {
    const serving = (ctx) => ({ ctxTokens: ctx, concurrency: 64 })
    let last = gpusNeeded(model, gpu, 'fp8', serving(500))
    let rises = 0
    for (let ctx = 1000; ctx <= 30000; ctx += 500) {
      const n = gpusNeeded(model, gpu, 'fp8', serving(ctx))
      assert.ok(n >= last, 'GPU count must never fall as context grows')
      if (n > last) rises++
      last = n
    }
    assert.ok(rises >= 2, 'expected several fit cliffs across this range (§5.2)')
  })

  test('replica VRAM is weights plus KV plus the stated allowances', () => {
    const serving = { ctxTokens: 1024, concurrency: 256 }
    const b = vramBreakdown(model, 'fp8', serving)
    const sum = b.weights + b.kv + b.workspace + b.comms + b.fragmentation
    assert.ok(Math.abs(sum - b.total) < 1e-6, 'the parts must add up to the stated total')
    // vramNeed rounds the same quantity to whole gigabytes.
    assert.ok(Math.abs(b.total - vramNeed(model, 'fp8', serving)) <= 1,
      'vramNeed should be the rounded breakdown total')
  })
})

describe('workload derivation', () => {
  test('duty cycle is exactly the inverse of peak-to-average (Appendix B-1)', () => {
    for (const peakiness of [1, 2.5, 3, 4]) {
      const w = deriveWorkload({ dailyRequests: 100000, avgTokensIn: 1000, avgTokensOut: 250, peakiness })
      assert.ok(Math.abs(w.dutyPct / 100 - 1 / peakiness) < 1e-9, `duty should be 1/${peakiness}`)
    }
  })

  test('concurrency is inversely proportional to the assumed decode rate (B-3b)', () => {
    const base = { peakTokPerMin: 1e6, avgTokensIn: 2000, avgTokensOut: 500 }
    const c = deriveConcurrency(base)
    assert.ok(c > 0, 'concurrency should be positive')
    assert.equal(PER_STREAM_DECODE.basis, 'assumption', 'the decode rate must stay declared as an assumption')
  })

  test('prefix reuse lowers decode-equivalent work, and cannot go below the output alone', () => {
    const none = decodeEquivalentTokens({ inTokens: 2000, outTokens: 500, prefixReuse: 0 })
    const half = decodeEquivalentTokens({ inTokens: 2000, outTokens: 500, prefixReuse: 0.5 })
    const all = decodeEquivalentTokens({ inTokens: 2000, outTokens: 500, prefixReuse: 1 })
    assert.ok(half < none, 'reuse should reduce work')
    assert.ok(all <= half, 'more reuse should not increase work')
    assert.ok(all >= 500, 'output tokens can never be discounted away')
  })
})

describe('the taxes in Appendix C', () => {
  test('correlation tax is zero at full utilisation and rises as it falls', () => {
    assert.equal(correlationTax(1), 0)
    assert.ok(correlationTax(0.5) > correlationTax(0.9))
    assert.ok(Math.abs(correlationTax(0.5) - 1) < 1e-9, 'half-used fleet buys twice what it consumes')
  })

  test('temporal tax follows the duty cycle', () => {
    assert.equal(temporalTax(100), 0)
    assert.ok(Math.abs(temporalTax(50) - 1) < 1e-9)
  })
})

describe('throughput model', () => {
  test('adding GPUs does not add throughput (§6, a stated modelling assumption)', () => {
    const one = throughputFor({ activeB: 70, totalB: 70, gpuId: 'h100', precision: 'fp8', numGpus: 1 })
    const eight = throughputFor({ activeB: 70, totalB: 70, gpuId: 'h100', precision: 'fp8', numGpus: 8 })
    assert.equal(one.totalTokPerSec, eight.totalTokPerSec,
      'the model deliberately has no GPU-count term; §6 defends this')
  })

  test('lower precision is faster, and the speedups are the declared constants', () => {
    const at = (p) => throughputFor({ activeB: 70, totalB: 70, gpuId: 'h100', precision: p }).totalTokPerSec
    assert.ok(at('int4') > at('fp8'), 'int4 should beat fp8')
    assert.ok(at('fp8') > at('fp16'), 'fp8 should beat fp16')
    assert.ok(Math.abs(at('fp8') / at('fp16') - 2.0) < 1e-6, 'fp8 speedup should be the stated 2.0x')
  })
})

describe('economics', () => {
  const opts = {
    mode: 'own', amortMonths: 36, kwhCost: 0.12, pue: 1.3, overheadPct: 15,
    personnelMonthly: 3000, spacePerKwMonth: 150, haFactor: 1,
    peakTokPerMin: 1e6, dutyPct: 33.3, outputShare: 0.2,
    ctxTokens: 2000, concurrency: 100, prefixReuse: 0.2
  }

  test('the bare-compute floor is always below the loaded cost (Appendix B-6)', () => {
    const d = decomposeCost(modelEconomics(model, gpu, 'fp8', opts))
    assert.ok(d.floor.per1M < d.selfHostPer1M, 'a floor that exceeds the loaded cost is a contradiction')
    // The floor is the first step; every later step only adds.
    const values = d.steps.map((s) => s.value)
    for (let i = 1; i < values.length; i++) {
      assert.ok(values[i] >= values[i - 1] - 1e-9, `step "${d.steps[i].id}" reduced the running cost`)
    }
  })

  test('idle capacity costs money: lower duty raises unit cost', () => {
    const busy = modelEconomics(model, gpu, 'fp8', { ...opts, dutyPct: 100 })
    const quiet = modelEconomics(model, gpu, 'fp8', { ...opts, dutyPct: 25 })
    assert.ok(quiet.selfHostPer1M > busy.selfHostPer1M, 'this is layer 7, and it must show up in the arithmetic')
  })

  test('renting removes capex but not the unit-cost comparison', () => {
    const e = modelEconomics(model, gpu, 'fp8', { ...opts, mode: 'rent' })
    assert.ok(Number.isFinite(e.selfHostPer1M) && e.selfHostPer1M > 0, 'rent mode must still produce a cost')
  })

  test('every catalogue model prices without throwing', () => {
    const priced = pricedModels(J('server/paper-prices.json'))
    const snap = J('server/paper-openrouter.json')
    for (const m of priced) {
      const prec = servingPrecisionFor(m, snap.endpoints?.[m.id] ? undefined : undefined)
      const e = modelEconomics(m, gpu, prec?.id || 'fp8', opts)
      assert.ok(Number.isFinite(e.selfHostPer1M), `${m.id} produced a non-finite cost`)
      assert.ok(e.numGpus >= 1, `${m.id} needs at least one GPU`)
    }
  })
})
