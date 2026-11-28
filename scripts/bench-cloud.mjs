// RENT THE CHEAPEST SUITABLE BOX, RUN THE BENCHMARK, GIVE IT BACK.
//
// The measured-throughput sweep is the one thing in this project that cannot be
// contributed by reading a model card: it needs a multi-GPU machine for an hour.
// This removes the excuse. Given one API key it finds the cheapest machine meeting
// the requirements, runs scripts/benchmark-tp.mjs on it, retrieves the result and
// destroys the instance.
//
// It is written so that a sponsor, a CI schedule or a stranger with $20 can all run
// the same experiment and produce a comparable, attributable result.
//
//   node scripts/bench-cloud.mjs --dry-run        # price it, rent nothing. No key needed.
//   VAST_API_KEY=... node scripts/bench-cloud.mjs --yes
//
// COST SAFETY, because this spends real money without a human watching:
//   --max-price    hard ceiling in $/hr for the whole machine. Never exceeded.
//   --max-minutes  wall-clock budget; the instance is destroyed when it expires.
//   --yes          required to rent anything at all.
// The instance is destroyed in a finally block, again on SIGINT, and the id is
// printed before anything else so a human can always kill it by hand.

import { execFileSync, execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VAST = 'https://console.vast.ai/api/v0'

const argv = process.argv.slice(2)
const flag = (n, d = null) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
}
const has = (n) => argv.includes(`--${n}`)

const CFG = {
  // Not a fixed GPU: the cheapest box that can hold the model at tp=1 wins, because
  // the experiment needs eight identical cards, not a particular badge. A survey of
  // the live market showed 8x A100 40GB at $4.27/hr while 8x H100 SXM had no offers
  // at all, so hardcoding H100 made the whole thing unrunnable.
  gpuName: flag('gpu', null),                   // optional exact filter, e.g. 'A100 SXM4'
  minVramGb: Number(flag('min-vram', 40)),      // per GPU; must fit the model at tp=1
  gpus: Number(flag('gpus', 8)),
  maxPrice: Number(flag('max-price', 12)),      // $/hr for the whole machine
  maxMinutes: Number(flag('max-minutes', 90)),
  model: flag('model', 'Qwen/Qwen3-30B-A3B'),
  precision: flag('precision', 'fp8'),
  tp: flag('tp', '1,2,4,8'),
  conc: flag('conc', '1,8,32,64,128,256'),
  ref: flag('ref', 'main'),
  repo: flag('repo', 'https://github.com/brettleehari/tokencalci'),
  image: flag('image', 'vllm/vllm-openai:latest'),
  diskGb: Number(flag('disk', 120)),
  dryRun: has('dry-run'),
  survey: has('survey'),
  yes: has('yes')
}

const KEY = process.env.VAST_API_KEY
const api = async (path, opts = {}) => {
  const res = await fetch(`${VAST}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'tokencalci-bench',
      ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
      ...(opts.headers || {})
    }
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`vast ${path} -> ${res.status}: ${text.slice(0, 300)}`)
  try { return JSON.parse(text) } catch { return text }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const money = (n) => '$' + n.toFixed(2)

// ---- 1. find the cheapest machine that can actually do the job ---------------
// Searching needs no credentials, which is why --dry-run works for anyone.
async function findOffers() {
  // Query on GPU count alone and filter in here: Vast's gpu_name values are
  // inconsistent across families ('H100 SXM', 'H100 NVL', 'A100 SXM4'), and an
  // exact match silently returns nothing rather than telling you why.
  const q = { limit: 500, rentable: { eq: true }, num_gpus: { eq: CFG.gpus } }
  const data = await api(`/bundles/?q=${encodeURIComponent(JSON.stringify(q))}`)

  return (data?.offers || [])
    .map((o) => ({
      id: o.id,
      dph: o.dph_total,
      perGpu: o.dph_total / (o.num_gpus || 1),
      gpus: o.num_gpus,
      gpuName: o.gpu_name,
      vramGb: Math.round((o.gpu_ram || 0) / 1024),
      diskGb: Math.round(o.disk_space || 0),
      reliability: o.reliability2 ?? 0,
      inet: Math.round(o.inet_down || 0),
      datacenter: o.datacenter?.geolocation || o.geolocation || 'unknown'
    }))
    .filter((o) =>
      o.dph > 0 &&
      o.dph <= CFG.maxPrice &&
      // The model must fit on ONE card, or the tp=1 row is missing and the
      // scaling question cannot be answered at all.
      o.vramGb >= CFG.minVramGb &&
      o.diskGb >= CFG.diskGb &&
      // A box that dies mid-sweep wastes the whole rental; a slow link makes the
      // image pull longer than the benchmark.
      o.reliability >= 0.97 &&
      o.inet >= 200 &&
      (!CFG.gpuName || o.gpuName === CFG.gpuName))
    .sort((a, b) => a.dph - b.dph)
}

// What is on the market right now, cheapest box per GPU family. Needs no
// credentials, and is the honest way to choose --min-vram against a budget.
async function survey() {
  const q = { limit: 500, rentable: { eq: true }, num_gpus: { eq: CFG.gpus } }
  const data = await api(`/bundles/?q=${encodeURIComponent(JSON.stringify(q))}`)
  const best = {}
  for (const o of data?.offers || []) {
    if (!(o.dph_total > 0)) continue
    const cur = best[o.gpu_name]
    if (!cur || o.dph_total < cur.dph_total) best[o.gpu_name] = o
  }
  console.log(`Cheapest ${CFG.gpus}-GPU machine per family, live:\n`)
  console.log('      $/hr   VRAM  GPU')
  for (const o of Object.values(best).sort((a, b) => a.dph_total - b.dph_total)) {
    const vram = Math.round(o.gpu_ram / 1024)
    const fits = vram >= CFG.minVramGb ? ' <- fits at --min-vram ' + CFG.minVramGb : ''
    console.log(`  ${money(o.dph_total).padStart(8)}  ${(vram + 'GB').padStart(5)}  ${o.gpu_name}${fits}`)
  }
  console.log(`\nAn hour is enough for a full sweep. Pick a row, set --min-vram to its VRAM,`)
  console.log(`and the model must fit on one of those cards at your chosen precision.`)
}

// ---- 2. the script the rented box runs ---------------------------------------
function bootstrap() {
  // Node is not in the vLLM image. Everything else already is.
  return `set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
echo "=== installing node ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
apt-get install -y -qq nodejs git >/dev/null 2>&1
echo "node $(node --version), vllm $(vllm --version 2>/dev/null || echo unknown)"
echo "=== cloning ==="
rm -rf /work && git clone --depth 1 --branch ${CFG.ref} ${CFG.repo} /work
cd /work && npm ci --omit=dev --silent 2>/dev/null || npm install --silent
echo "=== sweeping ==="
node scripts/benchmark-tp.mjs \\
  --model ${CFG.model} --precision ${CFG.precision} \\
  --tp ${CFG.tp} --conc ${CFG.conc}
echo "=== result ==="
echo "---BEGIN-RESULT---"
cat /work/data/benchmarks/*.json | tail -c 200000
echo "---END-RESULT---"
`
}

// ---- 3. lifecycle ------------------------------------------------------------
let instanceId = null
let destroyed = false

async function destroy(reason) {
  if (!instanceId || destroyed) return
  destroyed = true
  process.stdout.write(`\nDestroying instance ${instanceId} (${reason}) ... `)
  for (let i = 0; i < 5; i++) {
    try {
      await api(`/instances/${instanceId}/`, { method: 'DELETE', body: JSON.stringify({}) })
      console.log('done.')
      return
    } catch (e) {
      if (i === 4) {
        console.log('FAILED.')
        console.error(`\n!! COULD NOT DESTROY INSTANCE ${instanceId} — IT IS STILL BILLING.`)
        console.error(`!! Destroy it by hand: https://cloud.vast.ai/instances/  or`)
        console.error(`!! curl -X DELETE -H "Authorization: Bearer $VAST_API_KEY" ${VAST}/instances/${instanceId}/`)
        return
      }
      await sleep(3000)
    }
  }
}

async function waitForRunning(deadline) {
  let lastStatus = ''
  while (Date.now() < deadline) {
    const { instances } = await api('/instances/')
    const inst = (instances || []).find((i) => i.id === instanceId)
    if (inst) {
      const status = `${inst.actual_status || inst.cur_state} ${inst.status_msg || ''}`.trim()
      if (status !== lastStatus) { console.log(`  ${status}`); lastStatus = status }
      if (inst.actual_status === 'running' && inst.ssh_host) return inst
      if (['exited', 'error'].includes(inst.actual_status)) throw new Error(`instance ${inst.actual_status}: ${inst.status_msg}`)
    }
    await sleep(10000)
  }
  throw new Error('instance never reached running state within the budget')
}

async function main() {
  if (CFG.survey) return survey()

  console.log('CLOUD BENCHMARK')
  console.log(`  looking for: ${CFG.gpus} identical GPUs, >= ${CFG.minVramGb}GB each` +
    `${CFG.gpuName ? ` (${CFG.gpuName})` : ''}, <= ${money(CFG.maxPrice)}/hr total`)
  console.log(`  will run:    ${CFG.model} at ${CFG.precision}, tp=${CFG.tp}, concurrency=${CFG.conc}\n`)

  const offers = await findOffers()
  if (!offers.length) {
    console.error(`Nothing on the market matches: ${CFG.gpus} GPUs, >= ${CFG.minVramGb}GB each, <= ${money(CFG.maxPrice)}/hr.`)
    console.error('Run with --survey to see what is actually available and at what price.')
    process.exit(1)
  }

  console.log(`Cheapest ${Math.min(5, offers.length)} of ${offers.length} matching offers:`)
  for (const o of offers.slice(0, 5)) {
    console.log(`  ${money(o.dph).padStart(7)}/hr  ${o.gpus}x ${o.gpuName} ${o.vramGb}GB  ` +
      `reliability ${(o.reliability * 100).toFixed(1)}%  ${o.inet}Mbps  ${o.datacenter}`)
  }

  const pick = offers[0]
  const estimate = pick.dph * (CFG.maxMinutes / 60)
  console.log(`\nChosen: offer ${pick.id} — ${pick.gpus}x ${pick.gpuName} ${pick.vramGb}GB at ${money(pick.dph)}/hr`)
  console.log(`Budget: ${CFG.maxMinutes} minutes -> at most ${money(estimate)}`)
  console.log(`A full sweep usually finishes well inside that.`)

  if (CFG.dryRun) {
    console.log('\n--dry-run: nothing rented.')
    return
  }
  if (!KEY) { console.error('\nVAST_API_KEY is not set.'); process.exit(1) }
  if (!CFG.yes) {
    console.error('\nRefusing to rent without --yes. Re-run with --yes to spend money.')
    process.exit(1)
  }

  // Ephemeral key, so a shared CI secret never has to hold a long-lived one.
  const tmp = mkdtempSync(join(tmpdir(), 'bench-'))
  const keyPath = join(tmp, 'id_ed25519')
  execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', keyPath, '-q'])
  const pubKey = readFileSync(`${keyPath}.pub`, 'utf8').trim()

  const deadline = Date.now() + CFG.maxMinutes * 60 * 1000
  const onSignal = () => { destroy('interrupted').finally(() => process.exit(130)) }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  try {
    const created = await api(`/asks/${pick.id}/`, {
      method: 'PUT',
      body: JSON.stringify({
        client_id: 'me',
        image: CFG.image,
        disk: CFG.diskGb,
        runtype: 'ssh',
        ssh_keys: [pubKey],
        onstart: 'touch /root/.ready'
      })
    })
    instanceId = created.new_contract || created.id
    if (!instanceId) throw new Error(`could not read instance id from ${JSON.stringify(created).slice(0, 200)}`)

    console.log(`\n>>> INSTANCE ${instanceId} IS NOW BILLING AT ${money(pick.dph)}/hr <<<`)
    console.log(`>>> If this process dies, destroy it: https://cloud.vast.ai/instances/ <<<\n`)

    const inst = await waitForRunning(deadline)
    console.log(`  ssh ready at ${inst.ssh_host}:${inst.ssh_port}`)

    const ssh = ['-i', keyPath, '-p', String(inst.ssh_port),
      '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=30',
      `root@${inst.ssh_host}`]

    // sshd inside the container can lag the 'running' flag by a few seconds.
    for (let i = 0; i < 20; i++) {
      try { execFileSync('ssh', [...ssh, 'true'], { stdio: 'ignore' }); break } catch { await sleep(10000) }
    }

    console.log('\n  running the sweep — this is the part you are paying for\n')
    const remaining = Math.max(60, Math.floor((deadline - Date.now()) / 1000))
    const out = execFileSync('ssh', [...ssh, 'bash -s'], {
      input: bootstrap(),
      encoding: 'utf8',
      timeout: remaining * 1000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'inherit']
    })

    const m = out.match(/---BEGIN-RESULT---\n([\s\S]*?)\n---END-RESULT---/)
    if (!m) throw new Error('the sweep produced no result block')
    const result = JSON.parse(m[1].trim())

    // Record what it cost and where it ran: a benchmark nobody can price is a
    // benchmark nobody can repeat.
    result.rental = {
      provider: 'vast.ai',
      offerId: pick.id,
      instanceId,
      dollarsPerHour: pick.dph,
      datacenter: pick.datacenter,
      estimatedCost: Number((pick.dph * ((Date.now() - (deadline - CFG.maxMinutes * 60000)) / 3.6e6)).toFixed(2))
    }

    mkdirSync(join(ROOT, 'data', 'benchmarks'), { recursive: true })
    const name = `${result.measuredAt}-${(result.environment.gpuName || 'gpu').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${CFG.model.split('/').pop().toLowerCase()}.json`
    const path = join(ROOT, 'data', 'benchmarks', name)
    writeFileSync(path, JSON.stringify(result, null, 2) + '\n')

    console.log(`\nWrote data/benchmarks/${name}`)
    console.log(`Rental cost: about ${money(result.rental.estimatedCost)}`)
    console.log(`\nNext: node scripts/ingest-benchmarks.mjs data/benchmarks/${name}`)
  } finally {
    await destroy('finished')
    rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch(async (e) => {
  console.error(`\nFailed: ${e.message}`)
  await destroy('failed')
  process.exit(1)
})
