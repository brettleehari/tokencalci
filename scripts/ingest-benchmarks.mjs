// Folds a measured sweep into the throughput model, and reports what it does to
// the paper.
//
// It does not edit client/src/throughput.js for you. It tells you exactly what the
// measurements say, how far the current model is from them, and which published
// figures would move — then you decide, and record the decision. A script that
// silently rewrites the constants behind a published argument is the opposite of
// what this project is for.
//
// Run: node scripts/ingest-benchmarks.mjs data/benchmarks/<file>.json

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { BENCHMARKS, throughputFor, THROUGHPUT_META } from '../client/src/throughput.js'
import { MODELS } from '../client/src/hwdata.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/ingest-benchmarks.mjs data/benchmarks/<file>.json')
  process.exit(1)
}

const run = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'))
const ok = run.rows.filter((r) => !r.failed)
if (!ok.length) { console.error('no successful rows in that file'); process.exit(1) }

const gpuId = (name) => {
  const n = (name || '').toLowerCase()
  for (const id of ['b200', 'h200', 'h100', 'a100', 'l40s', 'rtx4090']) if (n.includes(id.replace('rtx', ''))) return id
  return null
}
const gpu = gpuId(run.environment.gpuName)
const tps = [...new Set(ok.map((r) => r.tp))].sort((a, b) => a - b)
const peak = Object.fromEntries(tps.map((tp) => [tp, Math.max(...ok.filter((r) => r.tp === tp).map((r) => r.totalTokPerSec))]))

console.log(`MEASURED SWEEP — ${run.model} at ${run.precision}`)
console.log(`  ${run.environment.gpuName} x${run.environment.gpuCount} · ${run.environment.interconnect} · ${run.engine.name} ${run.engine.version} · ${run.measuredAt}`)
console.log(`  catalogue gpu id: ${gpu ?? 'UNMAPPED — add it to GPU_BANDWIDTH before ingesting'}`)

// ---- 1. the tensor-parallel claim -------------------------------------------
console.log('\n1. DOES PARALLELISM BUY CAPACITY RATHER THAN SPEED? (§6)')
const base = peak[tps[0]]
let verdict = 'supported'
for (const tp of tps) {
  const scale = peak[tp] / base
  const linear = tp / tps[0]
  if (scale > 1.25) verdict = 'CONTRADICTED'
  console.log(`   tp=${String(tp).padStart(2)}  ${Math.round(peak[tp]).toLocaleString().padStart(9)} tok/s   measured ${scale.toFixed(2)}x   linear would be ${linear.toFixed(1)}x`)
}
console.log(`   -> the paper's assumption (flat, 1.00x) is ${verdict}`)
if (verdict === 'CONTRADICTED') {
  console.log('      §6 must be rewritten, and TP_BUYS_CAPACITY_NOT_SPEED set false.')
  console.log('      This is a bigger result than the cost tables; lead with it.')
}

// ---- 2. the batch-size term the model does not have -------------------------
console.log('\n2. THE BATCH-SIZE SPAN THE MODEL IGNORES (§10)')
for (const tp of tps) {
  const at = ok.filter((r) => r.tp === tp).sort((a, b) => a.concurrency - b.concurrency)
  const lo = at[0], hi = at[at.length - 1]
  console.log(`   tp=${String(tp).padStart(2)}  concurrency ${lo.concurrency} -> ${hi.concurrency}: ` +
    `${Math.round(lo.totalTokPerSec).toLocaleString()} -> ${Math.round(hi.totalTokPerSec).toLocaleString()} tok/s ` +
    `(${(hi.totalTokPerSec / lo.totalTokPerSec).toFixed(1)}x)`)
}
console.log('   -> the model has no concurrency term; every figure assumes the high end.')

// ---- 3. how wrong is the current fit? ---------------------------------------
console.log('\n3. CURRENT MODEL vs MEASUREMENT')
const model = MODELS.find((m) =>
  run.model.toLowerCase().includes(m.id.replace(/-/g, '')) ||
  m.label.toLowerCase().replace(/[^a-z0-9]/g, '').includes(run.model.split('/').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)))

if (!model || !gpu) {
  console.log('   could not map this run onto a catalogue model/GPU — map it, then re-run.')
} else {
  console.log(`   catalogue model: ${model.label} (${model.active}B active of ${model.params}B)`)
  const ratios = []
  for (const tp of tps) {
    const predicted = throughputFor({ activeB: model.active, totalB: model.params, gpuId: gpu, precision: run.precision, numGpus: tp }).totalTokPerSec
    const ratio = predicted / peak[tp]
    ratios.push(ratio)
    console.log(`   tp=${String(tp).padStart(2)}  predicted ${Math.round(predicted).toLocaleString().padStart(9)}  measured ${Math.round(peak[tp]).toLocaleString().padStart(9)}  model is ${ratio.toFixed(2)}x ${ratio > 1 ? 'OPTIMISTIC' : 'conservative'}`)
  }
  const geo = Math.exp(ratios.reduce((s, r) => s + Math.log(r), 0) / ratios.length)
  console.log(`   geometric mean: model is ${geo.toFixed(2)}x ${geo > 1 ? 'optimistic' : 'conservative'}`)
  console.log(`   (Ornn Data [17] implies roughly 4x optimistic on gpt-oss-120b — compare.)`)

  if (geo > 1.3 || geo < 0.77) {
    console.log('\n   -> This is a material correction. Every cost figure in the paper scales')
    console.log('      inversely with throughput, so §5, §5.1, §6 and the abstract all move.')
  }
}

// ---- 4. the row to commit ----------------------------------------------------
console.log('\n4. ANCHOR ROWS FOR client/src/throughput.js')
console.log('   Add to BENCHMARKS, and add the source to BENCHMARK_SOURCES:\n')
const srcId = `measured-${run.measuredAt.slice(0, 7)}`
for (const tp of tps) {
  const best = ok.filter((r) => r.tp === tp).sort((a, b) => b.totalTokPerSec - a.totalTokPerSec)[0]
  console.log(`   { model: '${model?.label ?? run.model}', activeB: ${model?.active ?? '?'}, gpu: '${gpu ?? '?'}', gpus: ${tp}, precision: '${run.precision}', ` +
    `totalTokPerSec: ${Math.round(best.totalTokPerSec)}, batch: ${best.concurrency}, engine: 'vLLM', src: '${srcId}' },`)
}
console.log(`\n   '${srcId}': {`)
console.log(`     label: 'Measured in-house — ${run.environment.gpuName} x${run.environment.gpuCount}, ${run.environment.interconnect}',`)
console.log(`     url: 'data/benchmarks/${file.split('/').pop()}',`)
console.log(`     config: 'vLLM ${run.engine.version}, ${run.shape.inputLen} in / ${run.shape.outputLen} out, concurrency swept ${Math.min(...ok.map(r=>r.concurrency))}-${Math.max(...ok.map(r=>r.concurrency))}'`)
console.log(`   }`)

console.log('\n5. AFTERWARDS')
console.log(`   THROUGHPUT_META.confidence is currently '${THROUGHPUT_META.confidence}'. With in-house`)
console.log(`   anchors it becomes 'measured', which changes Appendix A-9's grade and the`)
console.log(`   count in §4's provenance table.`)
console.log(`   Then: npm test  (the golden transcript will fail, and tell you what moved)`)
console.log(`         npm run test:update && npm run paper:charts && npm run paper:pdf`)
console.log(`   Currently ${BENCHMARKS.length} anchors, ${BENCHMARKS.filter((b) => b.src?.startsWith('measured')).length} of them measured.`)
