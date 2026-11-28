// Generates METHODOLOGY.md from the running model.
//
// Written rather than hand-maintained for the same reason the paper's tables are:
// a methodology document that drifts from the code is worse than none, because it
// is believed. Everything here is read from the same modules the calculator uses,
// so a constant cannot change without this file changing with it.
//
// Run: npm run docs:methodology

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'

import { MODELS, KV_ARCH } from '../client/src/hwdata.js'
import { VRAM_ASSUMPTIONS, PREFILL_SPEEDUP, PER_STREAM_DECODE, WORKLOAD_SHAPES } from '../client/src/hwcalc.js'
import { PRECISION_SPEEDUP, THROUGHPUT_META, BENCHMARKS, BENCHMARK_SOURCES } from '../client/src/throughput.js'
import { sources } from '../server/api.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))

const s = sources()
const layers = s.layers || []
const prices = J('server/paper-prices.json')
const gpus = J('server/paper-gpu-prices.json')
const orSnap = J('server/paper-openrouter.json')
const history = J('server/price-history.json')

const counts = layers.reduce((a, l) => { const g = l.grade || l.confidence; a[g] = (a[g] || 0) + 1; return a }, {})
const pct = (n, d) => Math.round((n / d) * 100)
const esc = (x) => String(x ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ')

const doc = `# Methodology

How every number in tokencalci is produced, where it comes from, and how far it can
be trusted. This is generated from the running model by \`npm run docs:methodology\`,
so it cannot drift from the code it describes.

Companion to the paper, [*From Free Weights to Reliable Tokens*](https://doi.org/10.5281/zenodo.24516238),
whose appendices A and B cover the same ground in argument form.

---

## 1. The confidence scale

Every input carries one of four grades. The grade is not decoration: it is the
difference between a figure you can cite and one you can only consider.

| Grade | Meaning | Count |
|---|---|---|
| \`measured\` | Retrieved from a dated feed; the exact record can be cited | ${counts.measured ?? 0} |
| \`derived\` | Computed from a dated feed; the method is published here | ${counts.derived ?? 0} |
| \`published\` | A figure from a named third party, not machine-retrieved | ${counts.published ?? 0} |
| \`estimate\` | Author's judgement; the weakest class, flagged wherever it appears | ${counts.estimate ?? 0} |

${s.rule ? `**The rule enforced throughout.** ${esc(s.rule)}\n` : ''}
**${counts.estimate ?? 0} of ${layers.length} layers is an \`estimate\`.** Anything resting on it should be
read as directional. The live machine-readable form of this table is at
[\`GET /api/sources\`](https://tokencalci.onrender.com/api/sources).

---

## 2. The fourteen data layers

| # | Layer | Source | Grade | Refresh | Principal limitation |
|---|---|---|---|---|---|
${layers.map((l, i) => `| ${i + 1} | ${esc(l.layer)} | ${esc(l.source)} | \`${l.grade || l.confidence}\` | ${esc(l.refresh)} | ${esc(l.limitation)} |`).join('\n')}

### Declared gaps

Things the tool does **not** know, stated so nobody infers them:

${(s.knownGaps || []).map((g) => `- ${esc(g)}`).join('\n')}

---

## 3. Pinned feed state

The calculator reads live feeds; the **paper** reads pinned snapshots, so its
published figures stay reproducible while the live tool moves. Re-pinned
deliberately with \`npm run refresh:paper\`, never automatically.

| Snapshot | As of | Size |
|---|---|---|
| \`server/paper-prices.json\` | ${prices.asOf} | ${prices.count} price keys |
| \`server/paper-gpu-prices.json\` | ${gpus.asOf} | ${gpus.gpus?.length ?? 0} GPU families |
| \`server/paper-openrouter.json\` | ${orSnap.fetchedAt} | ${orSnap.counts?.models ?? 0} models, ${orSnap.counts?.providers ?? 0} providers |
| \`server/price-history.json\` | ${history.generatedAt} | ${history.points} points, ${history.series?.[0]?.date} → ${history.series?.[history.series.length - 1]?.date} |

---

## 4. Constants that are assumed, not measured

These are the load-bearing assumptions. Each is a number somebody chose, and each
is flagged in the code where it is defined.

### 4.1 Replica memory

\`\`\`
VRAM = weights + KV + workspace + collective buffers + fragmentation
KV   = 2 × layers × kv_heads × head_dim × bytes × context × concurrency
\`\`\`

Weights and KV are arithmetic on published architecture parameters. The remaining
three terms are **assumed fractions of weight size**:

| Term | Value | Basis |
|---|---|---|
| Workspace | ${pct(VRAM_ASSUMPTIONS.workspaceFrac, 1)}% | \`${VRAM_ASSUMPTIONS.basis}\` |
| Collective buffers | ${pct(VRAM_ASSUMPTIONS.commsFrac, 1)}% | \`${VRAM_ASSUMPTIONS.basis}\`, charged only at tensor-parallel degree > 1 |
| Fragmentation | ${pct(VRAM_ASSUMPTIONS.fragmentationFrac, 1)}% | \`${VRAM_ASSUMPTIONS.basis}\`, excludes KV |

${esc(VRAM_ASSUMPTIONS.note)}

These three decide whether a model fits one card, which decides fleet size, which
decides cost. The paper's §8 works through a case — gpt-oss-120b — where they alone
move the answer, and an independent costing served it on a single card where this
tool will not.

### 4.2 KV-cache architecture

Attention parameters are \`published\` for **${Object.keys(KV_ARCH).length} of ${MODELS.length}** catalogue models and
estimated for the rest. Because KV now drives fleet size directly, an error here is
not cosmetic. The list of models still needing them is
[\`docs/kv-architecture-wanted.md\`](docs/kv-architecture-wanted.md) — the cheapest
useful contribution anyone can make.

### 4.3 Workload derivation

| Quantity | Rule | Basis |
|---|---|---|
| Duty cycle | \`duty = 1 / peak-to-average ratio\` | exact identity |
| Per-stream decode | ${PER_STREAM_DECODE.tokPerSec} tokens/second | \`${PER_STREAM_DECODE.basis}\` — concurrency is strictly proportional to its inverse |
| Prefill discount | prefill counted at 1/${PREFILL_SPEEDUP.value} of a decode token | \`${PREFILL_SPEEDUP.basis}\` — a single scalar, not a disaggregation model |

Halving the assumed decode rate moves cost by roughly 22% and replica VRAM by about
a third. It is load-bearing, not robust.

### 4.4 Throughput — the weakest layer

**Confidence: \`${THROUGHPUT_META.confidence}\`.** ${esc(THROUGHPUT_META.note)}

${esc(THROUGHPUT_META.limitation)}

Precision speedups, fitted from one controlled same-hardware series:

| Precision | Multiplier |
|---|---|
${Object.entries(PRECISION_SPEEDUP).map(([k, v]) => `| ${k} | ${v.toFixed(1)}× |`).join('\n')}

**There is no GPU-count term and no batch-size term.** The model assumes tensor
parallelism buys capacity rather than speed — a modelling assumption the paper
defends in §6 rather than demonstrating. ${BENCHMARKS.filter((b) => String(b.src).startsWith('measured')).length} of ${BENCHMARKS.length} anchors are measurements
we ran; the rest are third-party.

Anchor sources:

${Object.entries(BENCHMARK_SOURCES).map(([id, v]) => `- \`${id}\` — ${esc(v.label)}. ${esc(v.config)}`).join('\n')}

**This is the gap to close.** The harness exists: see
[\`docs/benchmark-protocol.md\`](docs/benchmark-protocol.md). A full sweep costs
about four dollars of rented hardware, and anyone can run it.

---

## 5. Workload shapes

Cost depends more on the *shape* of a workload than on the model. The six defaults
span the space; they are illustrative, not measurements of anyone's traffic.

| Shape | Context | Prefix reuse | In / out |
|---|---|---|---|
${WORKLOAD_SHAPES.map((w) => `| ${esc(w.label)} | ${w.ctxTokens.toLocaleString()} | ${Math.round(w.prefixReuse * 100)}% | ${w.avgIn} / ${w.avgOut} |`).join('\n')}

---

## 6. Reproducing any number

\`\`\`bash
npm run paper:figures    # every table in the paper, from the pinned snapshots
npm test                 # 31 tests, including a golden transcript of the above
npm start                # the calculator, with every input graded
\`\`\`

\`npm run paper:figures\` prints its complete configuration before any table:
workload, duty cycle, GPU price and basis, amortisation, staffing and overhead. Any
discrepancy between a published figure and that script's output is an error, and
should be reported as one.

---

## 7. What this methodology cannot tell you

- **Throughput you will actually get.** It varies ~100× with batch size, and the
  model has no batch term.
- **Whether a price is subsidised.** Marketplace GPU rates reflect community and
  spot supply; some neocloud pricing is likely below cost.
- **Latency.** There is no time-to-first-token or inter-token term anywhere, so
  goodput — the measure a modern scheduler optimises — cannot be computed.
- **Your traffic.** Every workload number is typed in, not observed.

Each of these is a stated gap rather than an oversight, and each is an open issue.

---

*Generated by \`npm run docs:methodology\` from the live model. Do not edit by hand.*
`

writeFileSync(join(ROOT, 'METHODOLOGY.md'), doc)
console.log(`Wrote METHODOLOGY.md — ${layers.length} layers, ${counts.estimate ?? 0} estimate, ${Object.keys(KV_ARCH).length}/${MODELS.length} KV published`)
