import React, { useEffect, useState, useMemo } from 'react'

// THE PAPER, ON THE SITE.
//
// Rendered from the same markdown file that lives in docs/ and gets read on
// GitHub. One source of truth — a hand-maintained JSX copy would drift from the
// citable version within a week, which for a document whose whole argument is
// "check my numbers" would be the worst possible failure.
//
// The renderer handles only the subset the paper actually uses. That is
// deliberate: a full markdown library is 40KB to render one document.

const inline = (t) =>
  t
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')

// Stable anchor per heading so sections can be linked and cited directly.
const slug = (t) =>
  t.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60)

function parse(md) {
  const lines = md.split('\n')
  const out = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const l = lines[i]

    if (!l.trim()) { i++; continue }

    // A line that is only an image becomes a figure. Markdown paths are repo-relative
    // (docs/figures/...) but the app serves them from /figures/, so they are rewritten
    // rather than left to 404 silently.
    const img = l.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/)
    if (img) {
      const src = img[2].replace(/^(\.\/)?figures\//, '/figures/')
      out.push(
        <figure key={key++} className="pp-fig">
          <img src={src} alt={img[1]} loading="lazy" />
        </figure>
      )
      i++
      continue
    }

    if (l.startsWith('```')) {
      const buf = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      i++
      out.push(<pre key={key++} className="pp-code"><code>{buf.join('\n')}</code></pre>)
      continue
    }

    if (/^---+$/.test(l.trim())) { out.push(<hr key={key++} />); i++; continue }

    const h = l.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const lvl = h[1].length
      const text = h[2]
      const id = slug(text.replace(/[*`]/g, ''))
      const Tag = `h${Math.min(lvl + 1, 5)}`
      out.push(
        <Tag key={key++} id={id} className="pp-h">
          <span dangerouslySetInnerHTML={{ __html: inline(text) }} />
          <a className="pp-anchor" href={`#${id}`} aria-label="Link to this section">#</a>
        </Tag>
      )
      i++
      continue
    }

    // table
    if (l.includes('|') && lines[i + 1] && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1])) {
      const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim())
      const head = cells(l)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].includes('|')) rows.push(cells(lines[i++]))
      out.push(
        <div key={key++} className="pp-tablewrap">
          <table className="pp-table">
            <thead><tr>{head.map((c, n) => <th key={n} dangerouslySetInnerHTML={{ __html: inline(c) }} />)}</tr></thead>
            <tbody>{rows.map((r, n) => <tr key={n}>{r.map((c, m) => <td key={m} dangerouslySetInnerHTML={{ __html: inline(c) }} />)}</tr>)}</tbody>
          </table>
        </div>
      )
      continue
    }

    if (/^>\s?/.test(l)) {
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''))
      out.push(<blockquote key={key++} dangerouslySetInnerHTML={{ __html: inline(buf.join(' ')) }} />)
      continue
    }

    if (/^(\d+\.|[-*])\s+/.test(l)) {
      const ordered = /^\d+\./.test(l)
      const items = []
      while (i < lines.length && /^(\d+\.|[-*])\s+/.test(lines[i])) {
        items.push(lines[i++].replace(/^(\d+\.|[-*])\s+/, ''))
      }
      const L = ordered ? 'ol' : 'ul'
      out.push(<L key={key++} className="pp-list">{items.map((t, n) => <li key={n} dangerouslySetInnerHTML={{ __html: inline(t) }} />)}</L>)
      continue
    }

    const buf = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\d+\.\s|[-*]\s|---)/.test(lines[i]) && !lines[i].includes('|')) {
      buf.push(lines[i++])
    }
    if (buf.length) out.push(<p key={key++} dangerouslySetInnerHTML={{ __html: inline(buf.join(' ')) }} />)
    else i++
  }
  return out
}


// ACADEMIC FRONT MATTER.
//
// A working paper is judged partly on whether it looks like one. This renders a
// conventional first page — title block, affiliation, Figure 1 above the fold with
// a numbered caption, then a two-column abstract — so the argument is visible
// before any scrolling and the artifact reads as citable rather than as a blog post.
//
// The markdown keeps its own title and abstract for the standalone file; the parser
// drops them here so they are not printed twice.
function PaperFront() {
  return (
    <header className="pf">
      <h1 className="pf-title">From Free Weights to Reliable Tokens</h1>
      <p className="pf-sub">
        The ten layers of open-model inference,<br />and the discipline forming around them
      </p>

      <div className="pf-authors">
        <div>
          <div className="pf-name">Hariprasad Sudharshan</div>
          <div className="pf-affil">Independent</div>
          <div className="pf-affil">opentoken · tokencalci.onrender.com</div>
        </div>
      </div>

      <figure className="pf-fig">
        <img src="/figures/figure1-serving-chain.svg"
             alt="A weight checkpoint enters at the left. Nine further layers stand between it and a billable token: precision, KV cache, batching, execution, parallelism, fleet, reliability, utilisation and surface. Only the first arrives in the download. Layers seven and nine are highlighted as where cost concentrates." />
        <a className="pf-figlink" href="/figures/figure1-serving-chain.svg"
           target="_blank" rel="noopener noreferrer">Open Figure 1 full size (SVG) →</a>
        <figcaption>
          <b>Figure 1: The serving chain.</b> A checkpoint is one of ten cost-bearing
          responsibilities between a published weight file and a token you can bill for.
          Layers 2–8 and 10 are engineering and can be hired, bought or adopted from
          open source. Layer 9, utilisation, is a property of serving many uncorrelated
          tenants rather than of competence, and cannot be fully replicated inside one
          workload boundary. Priced across five models, bare compute is cheaper than
          renting in every case; the premium is created by layers 7 and 9. Varying only
          the shape of the workload — chat, RAG, agentic, coding, reasoning, batch —
          moves the answer further than changing the model does.
        </figcaption>
      </figure>
    </header>
  )
}

export default function Paper() {
  const [md, setMd] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    fetch('/paper.md')
      .then((r) => { if (!r.ok) throw new Error('not found'); return r.text() })
      .then(setMd)
      .catch((e) => setErr(e.message))
  }, [])

  // Drop the markdown's own title, subtitle and byline — PaperFront renders those
  // as a proper front page, and printing them twice reads as a templating error.
  const body = useMemo(() => {
    if (!md) return null
    const i = md.indexOf('\n## Abstract')
    return parse(i > -1 ? md.slice(i) : md)
  }, [md])

  // Section headings become a contents rail — a paper you want cited should be
  // navigable to the specific claim, not scrolled from the top.
  const toc = useMemo(() => {
    if (!md) return []
    return md.split('\n')
      .filter((l) => /^##\s+/.test(l))
      .map((l) => {
        const t = l.replace(/^##\s+/, '')
        return { id: slug(t.replace(/[*`]/g, '')), text: t }
      })
  }, [md])

  if (err) {
    return (
      <section className="panel">
        <p className="muted">
          Paper unavailable ({err}). It is also in the repository at{' '}
          <code>docs/from-free-weights-to-reliable-tokens.md</code>.
        </p>
      </section>
    )
  }
  if (!md) return <section className="panel"><p className="muted">Loading…</p></section>

  return (
    <div className="pp-wrap">
      <nav className="pp-toc" aria-label="Contents">
        <div className="pp-toc-title">Contents</div>
        {toc.map((s) => <a key={s.id} href={`#${s.id}`}>{s.text}</a>)}
        <div className="pp-cite">
          <div className="pp-toc-title">Cite</div>
          <p>
            Sudharshan, H. (2026). <i>From Free Weights to Reliable Tokens: the ten layers
            of open-model inference.</i> Working paper.
          </p>
          <a href="/paper.md" download="from-free-weights-to-reliable-tokens.md">Download markdown</a>
          <a href="https://github.com/brettleehari/tokencalci/blob/main/docs/from-free-weights-to-reliable-tokens.md" target="_blank" rel="noopener noreferrer">View on GitHub</a>
        </div>
      </nav>
      <article className="pp">
        <PaperFront />
        {body}
      </article>
    </div>
  )
}
