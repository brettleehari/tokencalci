// Generates the paper's explanatory figures (everything except Figure 1, which is
// drawn, and the staircase, which make-figure2.mjs computes from the model).
//
// The three data charts read their numbers from the tables in the paper's own
// markdown, so a figure can never disagree with the table printed beside it.
// Update a table, re-run this, and the chart follows.
//
// Run: node scripts/make-paper-charts.mjs

import { writeFileSync, readFileSync } from 'node:fs'

const MD = readFileSync(new URL('../docs/from-free-weights-to-reliable-tokens.md', import.meta.url), 'utf8')

// ---- palette: the house colours of Figures 1 and the staircase. Blue and orange carry
// identity; grey is reserved for context (assumed quantities, reference marks).
const BLUE = '#0071e3', ORANGE = '#eb6834', GREY = '#a1a1a6'
const INK = '#1d1d1f', INK2 = '#6e6e73', INK3 = '#86868b', RULE = '#d2d2d7', GRID = '#ededf0', PANEL = '#f5f5f7'
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`
const W = 860

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const f1 = (n) => n.toFixed(1)

// Rows of the first markdown table whose header starts with `headerStart`.
function table(headerStart) {
  const lines = MD.split('\n')
  const at = lines.findIndex((l) => l.startsWith(headerStart))
  if (at < 0) throw new Error(`table not found: ${headerStart}`)
  const rows = []
  for (let i = at + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    rows.push(lines[i].split('|').slice(1, -1).map((c) => c.replace(/[*`]/g, '').trim()))
  }
  return rows
}
const num = (s) => parseFloat(s.replace(/[^0-9.]/g, ''))

function svg(id, H, title, desc, heading, sub, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
     font-family="${FONT}" role="img" aria-labelledby="${id}t ${id}d">
  <title id="${id}t">${esc(title)}</title>
  <desc id="${id}d">${esc(desc)}</desc>
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <text x="24" y="34" font-size="16" font-weight="700" fill="${INK}">${esc(heading)}</text>
  <text x="24" y="56" font-size="13" fill="${INK2}">${esc(sub)}</text>
${body}
</svg>
`
}

function write(name, content) {
  for (const dir of ['../docs/figures/', '../client/public/figures/']) {
    writeFileSync(new URL(dir + name, import.meta.url), content)
  }
  console.log('wrote', name)
}

// A bar with a square baseline end and a rounded data end.
function barRight(x, y, w, h, fill) {
  const r = Math.min(4, w / 2)
  return `<path d="M${f1(x)} ${y} H${f1(x + w - r)} Q${f1(x + w)} ${y} ${f1(x + w)} ${y + r} V${y + h - r} Q${f1(x + w)} ${y + h} ${f1(x + w - r)} ${y + h} H${f1(x)} Z" fill="${fill}"/>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer classes (§2.3)
{
  const names = ['Weights', 'Precision', 'KV cache', 'Batching', 'Execution', 'Parallelism', 'Fleet', 'Reliability', 'Utilisation', 'Surface']
  const cls = ['inh', 'mut', 'arch', 'mut', 'mut', 'arch', 'mut', 'mut', 'str', 'mut']
  const style = {
    inh: { fill: '#e6f0fc', stroke: BLUE, ink: INK, dash: '' },
    arch: { fill: '#e6f0fc', stroke: BLUE, ink: INK, dash: 'stroke-dasharray="5 4"' },
    mut: { fill: '#fdece4', stroke: ORANGE, ink: INK, dash: '' },
    str: { fill: INK, stroke: INK, ink: '#ffffff', dash: '' },
  }
  const bw = 74, gap = 8, x0 = 24, y0 = 84, bh = 66
  let b = ''
  names.forEach((n, i) => {
    const s = style[cls[i]], x = x0 + i * (bw + gap)
    b += `  <rect x="${x}" y="${y0}" width="${bw}" height="${bh}" rx="9" fill="${s.fill}" stroke="${s.stroke}" stroke-width="1.6" ${s.dash}/>
  <text x="${x + bw / 2}" y="${y0 + 27}" text-anchor="middle" font-size="17" font-weight="700" fill="${s.ink}">${i + 1}</text>
  <text x="${x + bw / 2}" y="${y0 + 49}" text-anchor="middle" font-size="12" fill="${s.ink}">${n}</text>\n`
  })
  const cards = [
    { k: 'inh', name: 'Inherited', layers: 'Layer 1, and the architecture inside 3 and 6', cost: 'Costs a decision, made once', note: 'Fixed by the checkpoint. You cannot change it; you can only choose a different model.' },
    { k: 'mut', name: 'Mutable', layers: 'Layers 2, 4, 5, 7, 8 and 10', cost: 'Costs a person — continuously', note: 'Degrades unless maintained: engines ship monthly, traffic shifts, every checkpoint is re-validated.' },
    { k: 'str', name: 'Structural', layers: 'Layer 9', cost: 'Costs a multiple you cannot remove', note: 'A property of whose demand you serve. Cannot be changed by anyone, at any budget.' },
  ]
  const cw = 264, cg = 10, cy = 176, ch = 150
  const wrap = (s, n) => { const out = []; let cur = ''; for (const w of s.split(' ')) { if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w } else cur = (cur + ' ' + w).trim() } out.push(cur); return out }
  cards.forEach((c, i) => {
    const x = x0 + i * (cw + cg), s = style[c.k]
    b += `  <rect x="${x}" y="${cy}" width="${cw}" height="${ch}" rx="10" fill="${PANEL}" stroke="${RULE}"/>
  <rect x="${x + 16}" y="${cy + 17}" width="16" height="16" rx="4" fill="${s.fill}" stroke="${s.stroke}" stroke-width="1.6"/>
  <text x="${x + 42}" y="${cy + 31}" font-size="15" font-weight="700" fill="${INK}">${c.name}</text>
  <text x="${x + 16}" y="${cy + 56}" font-size="12" fill="${INK2}">${esc(c.layers)}</text>
  <text x="${x + 16}" y="${cy + 80}" font-size="12.5" font-weight="650" fill="${INK}">${esc(c.cost)}</text>
${wrap(c.note, 39).map((l, j) => `  <text x="${x + 16}" y="${cy + 102 + j * 16}" font-size="12" fill="${INK2}">${esc(l)}</text>`).join('\n')}\n`
  })
  b += `  <text x="${x0}" y="${cy + ch + 24}" font-size="12" fill="${INK3}">Dashed outline: only the architecture constraints within layers 3 and 6 are inherited — attention design and parameter count.</text>`
  write('figure-layer-classes.svg', svg('lc', 366, 'What each layer commits an organisation to',
    'The ten layers in a row, coloured by class. Layer 1 is inherited, as are the architecture constraints inside layers 3 and 6. Layers 2, 4, 5, 7, 8 and 10 are mutable and cost a person continuously. Layer 9 is structural and cannot be changed.',
    'What each layer commits you to', 'The same ten layers, classified by what holding them costs rather than by whether they can be acquired', b))
}

// ─────────────────────────────────────────────────────────────────────────────
// Layers exercised: demonstration, evaluation, deployment (§3)
{
  const rows = [
    { name: 'Demonstration', full: 1, part: 0, q: 'Does it run?', meta: '1 user · hours · negligible cost' },
    { name: 'Evaluation', full: 2, part: 1, q: 'Is it sufficient for our task?', meta: '1–8 users · weeks · tens to hundreds of dollars' },
    { name: 'Deployment', full: 10, part: 0, q: 'Can we serve it at our load?', meta: 'hundreds of users · quarters · 6–7 figures a year' },
  ]
  const lx = 24, cx0 = 176, cw = 30, cg = 5, y0 = 100, pitch = 62, tx = cx0 + 10 * (cw + cg) + 22
  let b = `  <text x="${cx0}" y="84" font-size="11.5" fill="${INK3}" letter-spacing="0.06em">LAYERS EXERCISED, OF TEN</text>\n`
  rows.forEach((r, i) => {
    const y = y0 + i * pitch
    b += `  <text x="${lx}" y="${y + 21}" font-size="14.5" font-weight="700" fill="${INK}">${r.name}</text>\n`
    for (let k = 0; k < 10; k++) {
      const x = cx0 + k * (cw + cg)
      const fill = k < r.full ? BLUE : k < r.full + r.part ? '#a9cdf5' : '#ffffff'
      const stroke = k < r.full + r.part ? 'none' : RULE
      b += `  <rect x="${x}" y="${y}" width="${cw}" height="${cw}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>\n`
    }
    const label = r.part ? `${r.full}–${r.full + r.part} of 10` : `${r.full} of 10`
    b += `  <text x="${tx}" y="${y + 13}" font-size="13.5" fill="${INK}"><tspan font-weight="700">${label}</tspan> — ${esc(r.q)}</text>
  <text x="${tx}" y="${y + 31}" font-size="12" fill="${INK2}">${esc(r.meta)}</text>\n`
  })
  b += `  <text x="${lx}" y="${y0 + 3 * pitch + 10}" font-size="12" fill="${INK3}">Cells count how many layers an activity exercises. A demonstration measures latency for one user; the bill is set by throughput for many.</text>`
  write('figure-layers-exercised.svg', svg('le', 312, 'A demonstration exercises one layer of ten',
    'Three rows of ten cells. Demonstration fills one cell, evaluation two to three, deployment all ten.',
    'A demonstration exercises one layer of ten', 'Three activities a model release triggers, and how much of the serving chain each one tests', b))
}

// ─────────────────────────────────────────────────────────────────────────────
// Bare compute against fully loaded cost (§5)
{
  const rows = table('| Model | Served at | Replica GPUs').map((c) => ({ name: c[0], prec: c[1], bare: num(c[4]), loaded: num(c[5]) }))
  const L = 200, R = 800, y0 = 124, pitch = 44, max = Math.ceil(Math.max(...rows.map((r) => r.loaded)) * 2) / 2
  const X = (v) => L + (v / max) * (R - L)
  const B = y0 + rows.length * pitch - 10
  let b = ''
  for (let v = 0; v <= max; v += 0.5) {
    b += `  <line x1="${f1(X(v))}" y1="${y0 - 22}" x2="${f1(X(v))}" y2="${B}" stroke="${GRID}"/>
  <text x="${f1(X(v))}" y="${B + 18}" text-anchor="middle" font-size="11.5" fill="${INK3}">${v.toFixed(1)}×</text>\n`
  }
  b += `  <line x1="${f1(X(1))}" y1="${y0 - 30}" x2="${f1(X(1))}" y2="${B}" stroke="${INK}" stroke-width="1.4" stroke-dasharray="4 4"/>
  <text x="${f1(X(1) - 8)}" y="${y0 - 34}" text-anchor="end" font-size="12" fill="${INK2}">← cheaper than renting</text>
  <text x="${f1(X(1) + 8)}" y="${y0 - 34}" font-size="12" fill="${INK2}">dearer than renting →</text>\n`
  rows.forEach((r, i) => {
    const y = y0 + i * pitch
    b += `  <text x="${L - 16}" y="${y + 1}" text-anchor="end" font-size="13.5" font-weight="650" fill="${INK}">${esc(r.name)}</text>
  <text x="${L - 16}" y="${y + 17}" text-anchor="end" font-size="11.5" fill="${INK3}">served at ${esc(r.prec)}</text>
  <line x1="${f1(X(r.bare))}" y1="${y}" x2="${f1(X(r.loaded))}" y2="${y}" stroke="${RULE}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="${f1(X(r.bare))}" cy="${y}" r="7" fill="${BLUE}" stroke="#fff" stroke-width="2"/>
  <circle cx="${f1(X(r.loaded))}" cy="${y}" r="7" fill="${ORANGE}" stroke="#fff" stroke-width="2"/>
  <text x="${f1(X(r.bare))}" y="${y + 23}" text-anchor="middle" font-size="12" font-weight="650" fill="${INK}">${r.bare.toFixed(2)}×</text>
  <text x="${f1(X(r.loaded) + 13)}" y="${y + 4.5}" font-size="12" font-weight="650" fill="${INK}">${r.loaded.toFixed(1)}×</text>\n`
  })
  const ly = B + 46
  b += `  <circle cx="${L + 7}" cy="${ly}" r="6" fill="${BLUE}"/><text x="${L + 20}" y="${ly + 4.5}" font-size="12.5" fill="${INK}">Bare compute — the GPU line alone, at full utilisation</text>
  <circle cx="${L + 7}" cy="${ly + 22}" r="6" fill="${ORANGE}"/><text x="${L + 20}" y="${ly + 26.5}" font-size="12.5" fill="${INK}">Fully loaded — the same fleet with idle capacity, people and overhead</text>`
  write('figure-bare-vs-loaded.svg', svg('bl', ly + 44, 'The silicon is cheap; the gap is operational',
    `For each of five models, bare compute cost and fully loaded cost as multiples of the API price. Bare compute is below 1.0 in every case; fully loaded is above it in every case. ${rows.map((r) => `${r.name}: ${r.bare} and ${r.loaded}`).join('; ')}.`,
    'The silicon is cheap; the gap is operational', 'Self-host cost as a multiple of the neocloud API price (1.0× = parity). The distance between the dots is layers 7 and 9.', b))
}

// ─────────────────────────────────────────────────────────────────────────────
// Workload shape (§5.1)
{
  const rows = table('| Workload | Context | Prefix reuse').map((c) => ({ name: c[0], ctx: c[1], conc: c[3], fleet: num(c[5]), x: num(c[7]) }))
  const L = 214, R = 760, y0 = 96, pitch = 40, bh = 22, max = Math.ceil(Math.max(...rows.map((r) => r.x)))
  const X = (v) => L + (v / max) * (R - L)
  const B = y0 + rows.length * pitch
  let b = ''
  for (let v = 0; v <= max; v++) {
    b += `  <line x1="${f1(X(v))}" y1="${y0 - 8}" x2="${f1(X(v))}" y2="${B}" stroke="${v === 0 ? RULE : GRID}"/>
  <text x="${f1(X(v))}" y="${B + 18}" text-anchor="middle" font-size="11.5" fill="${INK3}">${v}×</text>\n`
  }
  rows.forEach((r, i) => {
    const y = y0 + i * pitch
    b += `  <text x="${L - 14}" y="${y + 10}" text-anchor="end" font-size="13" font-weight="650" fill="${INK}">${esc(r.name)}</text>
  <text x="${L - 14}" y="${y + 25}" text-anchor="end" font-size="11" fill="${INK3}">${esc(r.conc)} in flight · ${esc(r.ctx)} ctx</text>
  ${barRight(L, y + 2, X(r.x) - L, bh, BLUE)}
  <text x="${f1(X(r.x) + 9)}" y="${y + 18}" font-size="12.5" fill="${INK}"><tspan font-weight="700">${r.x.toFixed(1)}×</tspan><tspan fill="${INK2}"> · ${r.fleet} GPUs</tspan></text>\n`
  })
  b += `  <line x1="${f1(X(1))}" y1="${y0 - 16}" x2="${f1(X(1))}" y2="${B}" stroke="${INK}" stroke-width="1.4" stroke-dasharray="4 4"/>
  <text x="${f1(X(1) + 7)}" y="${y0 - 12}" font-size="11.5" fill="${INK2}">API parity</text>
  <text x="${L}" y="${B + 44}" font-size="12" fill="${INK3}">Same model (Llama 3.3 70B, fp8), same hardware, same 500 million billable tokens a day in every row.</text>
  <text x="${L}" y="${B + 61}" font-size="12" fill="${INK3}">Only the shape of the request changes.</text>`
  write('figure-workload-shape.svg', svg('ws', B + 78, 'Workload shape moves the answer more than model choice',
    `Self-host cost as a multiple of the API price for six workload shapes at identical volume. ${rows.map((r) => `${r.name} ${r.x}`).join('; ')}.`,
    'There is no universal break-even', 'Self-host cost as a multiple of the API price, by workload shape', b))
}

// ─────────────────────────────────────────────────────────────────────────────
// VRAM decomposition (§6)
{
  const rows = table('| Model | Weights | KV | Other').map((c) => ({ name: c[0], w: num(c[1]), kv: num(c[2]), o: num(c[3]), total: num(c[4]) }))
  const L = 170, R = 730, y0 = 118, pitch = 42, bh = 24, gap = 2
  const B = y0 + rows.length * pitch
  let b = ''
  const legend = [[BLUE, 'Weights'], [ORANGE, 'KV cache'], [GREY, 'Workspace, buffers, fragmentation (assumed)']]
  let lx = L
  legend.forEach(([c, n]) => {
    b += `  <rect x="${lx}" y="78" width="13" height="13" rx="3" fill="${c}"/><text x="${lx + 19}" y="89" font-size="12.5" fill="${INK}">${esc(n)}</text>\n`
    lx += 38 + n.length * 7
  })
  const shares = rows.map((r) => Math.round((r.kv / r.total) * 100))
  const kvShare = { min: Math.min(...shares), max: Math.max(...shares) }
  rows.forEach((r, i) => {
    const y = y0 + i * pitch, sum = r.w + r.kv + r.o
    b += `  <text x="${L - 14}" y="${y + 17}" text-anchor="end" font-size="13" font-weight="650" fill="${INK}">${esc(r.name)}</text>\n`
    let x = L
    ;[[r.w, BLUE, '#fff'], [r.kv, ORANGE, '#fff'], [r.o, GREY, INK]].forEach(([v, c, ink], k) => {
      const w = (v / sum) * (R - L) - (k < 2 ? gap : 0)
      b += k === 2 ? `  ${barRight(x, y, w, bh, c)}\n` : `  <rect x="${f1(x)}" y="${y}" width="${f1(w)}" height="${bh}" fill="${c}"/>\n`
      if (w > 44) b += `  <text x="${f1(x + w / 2)}" y="${y + 16.5}" text-anchor="middle" font-size="12" font-weight="650" fill="${ink}">${v} GB</text>\n`
      x += w + gap
    })
    b += `  <text x="${R + 12}" y="${y + 17}" font-size="12.5" fill="${INK}"><tspan font-weight="700">${r.total} GB</tspan><tspan fill="${INK2}"> · KV ${Math.round((r.kv / r.total) * 100)}%</tspan></text>\n`
  })
  b += `  <text x="${L}" y="${B + 14}" font-size="12" fill="${INK3}">Each bar is one replica's memory, scaled to 100%. At 1,024-token context and 256 concurrent requests.</text>
  <text x="${L}" y="${B + 32}" font-size="12" fill="${INK3}">A flat allowance on top of weights cannot represent this: KV is ${kvShare.min}% of one footprint and ${kvShare.max}% of another.</text>`
  write('figure-vram-decomposition.svg', svg('vd', B + 50, 'Where a replica\'s memory goes',
    `Stacked bars of replica VRAM split into weights, KV cache and other allowances, for five models. ${rows.map((r) => `${r.name}: weights ${r.w}, KV ${r.kv}, other ${r.o}, total ${r.total} GB`).join('; ')}.`,
    'Where a replica\'s memory goes', 'Share of replica VRAM by component. KV cache is set by attention architecture, not by parameter count.', b))
}

// ─────────────────────────────────────────────────────────────────────────────
// The refresh cycle (§9)
{
  const stages = ['Watch', 'Qualify', 'Re-derive', 'Re-benchmark', 'Re-size', 'Shadow', 'Cut over', 'Retire']
  const cx = 270, cy = 296, rx = 190, ry = 200, nw = 128, nh = 40
  const pos = stages.map((_, i) => { const a = (-90 + i * 45) * Math.PI / 180; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] })
  let b = `  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${RULE}" stroke-width="2"/>\n`
  stages.forEach((_, i) => {   // clockwise arrowheads midway between stages
    const a = (-90 + i * 45 + 22.5) * Math.PI / 180, x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a), rot = Math.atan2(ry * Math.cos(a), -rx * Math.sin(a)) * 180 / Math.PI
    b += `  <path d="M-7 -6 L6 0 L-7 6 Z" fill="${INK3}" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)})"/>\n`
  })
  // rollback: from Cut over back to the incumbent, through the centre
  const [kx, ky] = pos[6]
  b += `  <line x1="${f1(kx + 50)}" y1="${f1(ky + 8)}" x2="${cx - 90}" y2="${cy}" stroke="${ORANGE}" stroke-width="2" stroke-dasharray="6 5"/>
  <rect x="${cx - 90}" y="${cy - 28}" width="180" height="56" rx="10" fill="#fdece4" stroke="${ORANGE}" stroke-width="1.6" stroke-dasharray="5 4"/>
  <text x="${cx}" y="${cy - 5}" text-anchor="middle" font-size="13.5" font-weight="700" fill="${INK}">9 · Roll back</text>
  <text x="${cx}" y="${cy + 13}" text-anchor="middle" font-size="11.5" fill="${INK2}">required, and hoped unused</text>\n`
  stages.forEach((s, i) => {
    const [x, y] = pos[i], load = i >= 5 && i <= 6
    b += `  <rect x="${f1(x - nw / 2)}" y="${f1(y - nh / 2)}" width="${nw}" height="${nh}" rx="10" fill="${load ? '#e6f0fc' : '#ffffff'}" stroke="${load ? BLUE : INK}" stroke-width="1.6"/>
  <text x="${f1(x)}" y="${f1(y + 5)}" text-anchor="middle" font-size="13" font-weight="650" fill="${INK}">${i + 1} · ${s}</text>\n`
  })
  const px = 556
  const notes = [
    ['Paid once per model, per refresh', 'The ten layers are not a one-time build. Every', 'new checkpoint sends the fleet round again.'],
    ['Layers are re-derived, not reused', 'Precision, throughput, replica sizing and engine', 'versions are all invalidated by a new checkpoint.'],
    ['The transition happens under load', 'Shadow and cut-over (blue) run on a fleet already', 'serving users, when VRAM is most contended.'],
    ['Quality is not portable', 'Prompts, parsers and evaluations are tuned to one', "model's behaviour and must be redone."],
  ]
  notes.forEach((n, i) => {
    const y = 130 + i * 96
    b += `  <text x="${px}" y="${y}" font-size="13.5" font-weight="700" fill="${INK}">${esc(n[0])}</text>
  <text x="${px}" y="${y + 20}" font-size="12" fill="${INK2}">${esc(n[1])}</text>
  <text x="${px}" y="${y + 37}" font-size="12" fill="${INK2}">${esc(n[2])}</text>\n`
  })
  write('figure-refresh-cycle.svg', svg('rc', 540, 'The refresh cycle',
    'Eight stages arranged clockwise in a ring: watch, qualify, re-derive, re-benchmark, re-size, shadow, cut over, retire. A ninth, roll back, sits in the centre connected to cut over by a dashed line.',
    'A cycle rather than a chain', 'What an organisation repeats each time it adopts a new open model on hardware that is already serving traffic', b))
}
