// MEASURED THROUGHPUT ANCHORS.
//
// This is the experiment §6 of the paper specifies and does not run. It exists
// because the tool's throughput model rests on ten of eleven anchors from a single
// third-party benchmark run, has no batch-size term at all, and asserts — as a
// modelling assumption, not a measurement — that tensor parallelism buys capacity
// rather than speed. An independent costing disagrees with the resulting level by
// about four times.
//
// The sweep closes both stated gaps at once:
//
//   tensor parallelism  1, 2, 4, 8   does adding GPUs add throughput?
//   concurrency         1 ... 256    the ~100x axis the model has no term for
//
// Every confounder the paper complains is missing from published numbers is
// recorded here: batch size, context, input and output lengths, interconnect
// topology, engine version, driver, precision and date. A row without them is
// another anecdote.
//
// Run on a rented multi-GPU box:
//
//   node scripts/benchmark-tp.mjs --model Qwen/Qwen3-30B-A3B --precision fp8
//   node scripts/benchmark-tp.mjs --dry-run            # validate the plan, no GPUs
//   node scripts/benchmark-tp.mjs --tp 1,2 --conc 1,64 # a cheaper subset
//
// Results land in data/benchmarks/ as JSON. Fold them into the model with:
//
//   node scripts/ingest-benchmarks.mjs data/benchmarks/<file>.json

import { execFileSync, spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'data', 'benchmarks')

// ---- arguments ---------------------------------------------------------------
const argv = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
const has = (name) => argv.includes(`--${name}`)

const CFG = {
  model: flag('model', 'Qwen/Qwen3-30B-A3B'),
  precision: flag('precision', 'fp8'),
  tp: (flag('tp', '1,2,4,8')).split(',').map(Number),
  concurrency: (flag('conc', '1,8,32,64,128,256')).split(',').map(Number),
  inputLen: Number(flag('input', 512)),
  outputLen: Number(flag('output', 512)),
  prompts: Number(flag('prompts', 200)),
  port: Number(flag('port', 8765)),
  warmup: Number(flag('warmup', 20)),
  dryRun: has('dry-run'),
  // The paper's anchors are "throughput-optimised at high concurrency". Keeping
  // one fixed context length makes the TP rows comparable to each other.
  maxLen: Number(flag('max-len', 4096))
}

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim()

// ---- environment capture -----------------------------------------------------
// A throughput number whose interconnect is unknown cannot test the tensor-parallel
// claim, because NVLink and PCIe are the whole question.
function captureEnvironment() {
  const env = { capturedAt: new Date().toISOString() }
  try {
    const q = sh('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader'])
    const rows = q.split('\n').map((r) => r.split(',').map((s) => s.trim()))
    env.gpuName = rows[0][0]
    env.gpuMemoryMiB = parseInt(rows[0][1], 10)
    env.driver = rows[0][2]
    env.gpuCount = rows.length
    env.gpusHomogeneous = new Set(rows.map((r) => r[0])).size === 1
  } catch {
    env.gpuName = null
    env.gpuCount = 0
  }
  try {
    // The topology matrix is the evidence for or against the §6 claim.
    env.topology = sh('nvidia-smi', ['topo', '-m'])
    env.interconnect = /NV\d/.test(env.topology) ? 'NVLink' : /PIX|PHB|SYS/.test(env.topology) ? 'PCIe' : 'unknown'
  } catch {
    env.topology = null
    env.interconnect = 'unknown'
  }
  for (const [key, args] of [['vllm', ['--version']], ['python', ['--version']]]) {
    try { env[`${key}Version`] = sh(key, args).replace(/^\S+\s+/, '') } catch { env[`${key}Version`] = null }
  }
  return env
}

// ---- vLLM server lifecycle ---------------------------------------------------
function quantFlag(precision) {
  // fp16 is the unquantised baseline: pass nothing and let the checkpoint decide.
  if (precision === 'fp16' || precision === 'bf16') return []
  if (precision === 'fp8') return ['--quantization', 'fp8']
  if (precision === 'int4' || precision === 'awq') return ['--quantization', 'awq']
  return ['--quantization', precision]
}

async function waitForHealth(port, timeoutMs = 15 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok) return true
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 3000))
  }
  return false
}

async function withServer(tp, fn) {
  const args = [
    'serve', CFG.model,
    '--tensor-parallel-size', String(tp),
    '--port', String(CFG.port),
    '--max-model-len', String(CFG.maxLen),
    '--disable-log-requests',
    ...quantFlag(CFG.precision)
  ]
  console.log(`\n  starting vLLM: tp=${tp} ...`)
  const proc = spawn('vllm', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderrTail = ''
  proc.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-4000) })
  proc.stdout.on('data', () => {})

  try {
    const healthy = await waitForHealth(CFG.port)
    if (!healthy) throw new Error(`server never became healthy at tp=${tp}.\n${stderrTail}`)
    console.log('  server ready')
    return await fn()
  } finally {
    proc.kill('SIGINT')
    await new Promise((r) => setTimeout(r, 8000))
    if (!proc.killed) proc.kill('SIGKILL')
  }
}

// ---- one measurement ---------------------------------------------------------
function runBenchmark(concurrency) {
  const resultFile = join(OUT_DIR, `.tmp-${concurrency}.json`)
  if (existsSync(resultFile)) unlinkSync(resultFile)

  const args = [
    'bench', 'serve',
    '--model', CFG.model,
    '--host', '127.0.0.1',
    '--port', String(CFG.port),
    '--dataset-name', 'random',
    '--random-input-len', String(CFG.inputLen),
    '--random-output-len', String(CFG.outputLen),
    '--num-prompts', String(Math.max(CFG.prompts, concurrency * 2)),
    '--max-concurrency', String(concurrency),
    '--ignore-eos',                       // so output length is exactly as asked
    '--save-result', '--result-filename', resultFile
  ]
  sh('vllm', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const r = JSON.parse(readFileSync(resultFile, 'utf8'))
  unlinkSync(resultFile)
  return r
}

// ---- the sweep ---------------------------------------------------------------
async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const env = captureEnvironment()

  const maxTp = Math.max(...CFG.tp)
  console.log('MEASURED THROUGHPUT SWEEP')
  console.log(`  model        ${CFG.model} at ${CFG.precision}`)
  console.log(`  tp degrees   ${CFG.tp.join(', ')}`)
  console.log(`  concurrency  ${CFG.concurrency.join(', ')}`)
  console.log(`  shape        ${CFG.inputLen} in / ${CFG.outputLen} out, max_model_len ${CFG.maxLen}`)
  console.log(`  gpu          ${env.gpuName || 'none detected'} x${env.gpuCount} · ${env.interconnect} · driver ${env.driver || '?'}`)
  console.log(`  vllm         ${env.vllmVersion || 'not found'}`)
  console.log(`  runs         ${CFG.tp.length * CFG.concurrency.length}`)

  if (CFG.dryRun) {
    console.log('\n--dry-run: plan validated, nothing executed.')
    if (env.gpuCount && maxTp > env.gpuCount) {
      console.log(`WARNING: tp=${maxTp} requested but only ${env.gpuCount} GPUs present.`)
    }
    return
  }

  if (!env.vllmVersion) throw new Error('vllm not on PATH — install it on the benchmark box first')
  if (maxTp > env.gpuCount) throw new Error(`tp=${maxTp} needs ${maxTp} GPUs, found ${env.gpuCount}`)
  if (!env.gpusHomogeneous) throw new Error('GPUs are not identical — a mixed box cannot test this claim')

  const started = Date.now()
  const rows = []

  for (const tp of CFG.tp) {
    await withServer(tp, async () => {
      // One throwaway pass so the first timed run does not pay for CUDA graph
      // capture and cache warm-up.
      try { runBenchmark(Math.min(CFG.warmup, Math.max(...CFG.concurrency))) } catch { /* warm-up is best-effort */ }

      for (const conc of CFG.concurrency) {
        process.stdout.write(`  tp=${tp} concurrency=${String(conc).padStart(3)} ... `)
        try {
          const r = runBenchmark(conc)
          const row = {
            tp,
            concurrency: conc,
            outputTokPerSec: r.output_throughput,
            totalTokPerSec: r.total_token_throughput,
            requestsPerSec: r.request_throughput,
            ttftMsP50: r.median_ttft_ms,
            ttftMsP99: r.p99_ttft_ms,
            itlMsP50: r.median_itl_ms,
            itlMsP99: r.p99_itl_ms,
            completed: r.completed,
            durationSec: r.duration
          }
          rows.push(row)
          console.log(`${Math.round(row.totalTokPerSec).toLocaleString()} tok/s total, ` +
            `${Math.round(row.outputTokPerSec).toLocaleString()} out, TTFT p50 ${Math.round(row.ttftMsP50)}ms`)
        } catch (e) {
          console.log(`FAILED — ${String(e.message).split('\n')[0]}`)
          rows.push({ tp, concurrency: conc, failed: String(e.message).slice(0, 400) })
        }
      }
    })
  }

  const gpuHours = ((Date.now() - started) / 3.6e6) * maxTp
  const out = {
    schema: 'tokencalci/benchmark@1',
    measuredAt: new Date().toISOString().slice(0, 10),
    model: CFG.model,
    precision: CFG.precision,
    shape: { inputLen: CFG.inputLen, outputLen: CFG.outputLen, maxModelLen: CFG.maxLen },
    environment: env,
    engine: { name: 'vLLM', version: env.vllmVersion },
    gpuHoursApprox: Number(gpuHours.toFixed(2)),
    rows
  }

  const name = `${out.measuredAt}-${(env.gpuName || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${CFG.model.split('/').pop().toLowerCase()}.json`
  const path = join(OUT_DIR, name)
  writeFileSync(path, JSON.stringify(out, null, 2) + '\n')

  // ---- the two findings, printed where you cannot miss them ------------------
  console.log('\n' + '─'.repeat(78))
  const ok = rows.filter((r) => !r.failed)
  const peak = {}
  for (const r of ok) peak[r.tp] = Math.max(peak[r.tp] ?? 0, r.totalTokPerSec)

  console.log('DOES TENSOR PARALLELISM ADD THROUGHPUT? (peak across concurrency)')
  const base = peak[CFG.tp[0]]
  for (const tp of CFG.tp) {
    if (peak[tp] == null) continue
    const scale = peak[tp] / base
    console.log(`  tp=${String(tp).padStart(2)}  ${Math.round(peak[tp]).toLocaleString().padStart(9)} tok/s   ${scale.toFixed(2)}x vs tp=${CFG.tp[0]}  (linear would be ${(tp / CFG.tp[0]).toFixed(1)}x)`)
  }
  console.log(`\n  The paper assumes this column is flat (1.00x). Anything else is the finding.`)

  console.log('\nHOW MUCH DOES BATCH SIZE MOVE IT? (at each tp)')
  for (const tp of CFG.tp) {
    const at = ok.filter((r) => r.tp === tp)
    if (!at.length) continue
    const lo = Math.min(...at.map((r) => r.totalTokPerSec))
    const hi = Math.max(...at.map((r) => r.totalTokPerSec))
    console.log(`  tp=${String(tp).padStart(2)}  ${Math.round(lo).toLocaleString()} -> ${Math.round(hi).toLocaleString()} tok/s   ${(hi / lo).toFixed(1)}x across concurrency`)
  }
  console.log(`\n  The model has no batch term at all. This is the span it ignores.`)

  console.log('\n' + '─'.repeat(78))
  console.log(`Wrote ${path.replace(ROOT + '/', '')}`)
  console.log(`Approx ${out.gpuHoursApprox} GPU-hours used.`)
  console.log(`\nNext: node scripts/ingest-benchmarks.mjs ${path.replace(ROOT + '/', '')}`)
}

main().catch((e) => {
  console.error(`\nFailed: ${e.message}`)
  process.exit(1)
})
