import React from 'react'

// LAYOUT PRIMITIVES — the cloud-calculator workspace pattern.
//
// The shape every serious cost calculator converges on, and the thing this app
// was missing: a scrolling CONFIGURATION column beside a STICKY ESTIMATE RAIL.
// The old layout stacked inputs and results down one page, so changing an input
// scrolled the answer off screen — you could never see a number move as you
// moved the thing that causes it. That is the whole job of a calculator.
//
// Everything here is presentational. No economics live in this file.

// Height of the sticky top nav, so a revealed section lands below it rather than
// underneath it.
const HEADER_OFFSET = 72

export function Workspace({ children }) {
  return <div className="ws">{children}</div>
}

// Left column: grouped configuration. Scrolls with the page.
export function Config({ children }) {
  return <div className="ws-config">{children}</div>
}

// Right rail: the running answer. Sticks while the config scrolls.
export function Rail({ children }) {
  return (
    <aside className="ws-rail">
      <div className="ws-rail-inner">{children}</div>
    </aside>
  )
}

// A titled block of related inputs. `note` carries the "why this matters" line
// that would otherwise become a tooltip nobody opens.
export function Section({ title, note, children, actions }) {
  return (
    <section className="ws-section">
      <div className="ws-section-head">
        <h2>{title}</h2>
        {actions}
      </div>
      {note && <p className="ws-section-note">{note}</p>}
      <div className="ws-section-body">{children}</div>
    </section>
  )
}

// One labelled control. `unit` renders inside the input as a suffix, `hint`
// below it — the pattern cloud calculators use so a number is never unitless.
export function Field({ label, unit, hint, children, wide }) {
  return (
    <label className={'ws-field' + (wide ? ' wide' : '')}>
      <span className="ws-label">{label}</span>
      <span className="ws-control">
        {children}
        {unit && <span className="ws-unit">{unit}</span>}
      </span>
      {hint && <span className="ws-hint">{hint}</span>}
    </label>
  )
}

// A slider that always shows its current value in the label, so the control is
// readable without interacting with it.
export function Slider({ label, value, min, max, step = 1, onChange, format, hint, wide }) {
  return (
    <label className={'ws-field' + (wide ? ' wide' : '')}>
      <span className="ws-label">
        {label}
        <b className="ws-value">{format ? format(value) : value}</b>
      </span>
      <input
        className="ws-range" type="range" min={min} max={max} step={step}
        value={value} onChange={(e) => onChange(+e.target.value)}
      />
      {hint && <span className="ws-hint">{hint}</span>}
    </label>
  )
}

// Segmented control for a small set of mutually exclusive choices.
export function Segmented({ options, value, onChange, label, hint }) {
  return (
    <div className="ws-field wide">
      {label && <span className="ws-label">{label}</span>}
      <div className="ws-seg" role="tablist">
        {options.map((o) => (
          <button
            key={o.id} role="tab" aria-selected={value === o.id}
            className={value === o.id ? 'on' : ''}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <span className="ws-hint">{hint}</span>}
    </div>
  )
}

/* ---------- rail contents ---------- */

// The headline answer. `tone` drives the accent stripe: self / api / warn.
export function Verdict({ tone = 'api', label, headline, children }) {
  return (
    <div className={'rail-verdict ' + tone}>
      <div className="rail-eyebrow">{label}</div>
      <div className="rail-headline">{headline}</div>
      {children && <div className="rail-reason">{children}</div>}
    </div>
  )
}

// One row of the estimate breakdown. `strong` marks the row that decides it.
export function LineItem({ label, value, sub, strong, tone }) {
  return (
    <div className={'rail-line' + (strong ? ' strong' : '') + (tone ? ' ' + tone : '')}>
      <div className="rail-line-label">
        {label}
        {sub && <span>{sub}</span>}
      </div>
      <div className="rail-line-value">{value}</div>
    </div>
  )
}

export function RailGroup({ title, children }) {
  return (
    <div className="rail-group">
      {title && <div className="rail-group-title">{title}</div>}
      {children}
    </div>
  )
}

// Pinned bottom block: the number you came for, plus what you can do with it.
export function BottomLine({ label, value, sub, actions }) {
  return (
    <div className="rail-bottom">
      <div className="rail-bottom-row">
        <span className="rail-bottom-label">{label}</span>
        <span className="rail-bottom-value">{value}</span>
      </div>
      {sub && <div className="rail-bottom-sub">{sub}</div>}
      {actions && <div className="rail-actions">{actions}</div>}
    </div>
  )
}

export function Note({ children, tone }) {
  return <div className={'rail-note' + (tone ? ' ' + tone : '')}>{children}</div>
}

/* ---------- progressive disclosure ---------- */

// A section that is closed until wanted. Depth without pages: the same object,
// opened further. Nobody is walked through detail they did not ask for, and
// nobody hits a wall when they do.
// `openSignal` lets a CTA elsewhere on the page reveal this section: any change to
// the value opens the disclosure and scrolls to it. It is a counter rather than a
// boolean so that asking twice works — a reader who scrolls away and clicks the
// same link again should be taken back, not silently ignored.
export function Disclosure({ id, title, note, badge, children, defaultOpen = false, openSignal = 0 }) {
  const [open, setOpen] = React.useState(defaultOpen)
  const ref = React.useRef(null)
  React.useEffect(() => {
    if (!openSignal) return
    setOpen(true)
    // Scroll AFTER the expanded body is committed and laid out, or the target
    // position is measured against the collapsed height and lands short.
    //
    // Deliberately NOT `behavior: 'smooth'`. Smooth scrolling silently no-ops in
    // some environments (reduced-motion settings, certain embedded views), and a
    // no-op here is indistinguishable from a dead link — the exact failure this
    // prop exists to fix. An instant jump is what an anchor link does anyway, and
    // it is the behaviour that always works. Offset past the sticky header so the
    // section title is visible on arrival rather than hidden under the nav.
    const id = setTimeout(() => {
      const el = ref.current
      if (!el) return
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET)
    }, 120)
    return () => clearTimeout(id)
  }, [openSignal])
  return (
    <section id={id} ref={ref} className={'disc' + (open ? ' open' : '')}>
      <button className="disc-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="disc-chev" aria-hidden="true">{open ? '−' : '+'}</span>
        <span className="disc-main">
          <span className="disc-title">{title}</span>
          {note && <span className="disc-note">{note}</span>}
        </span>
        {badge && <span className="disc-badge">{badge}</span>}
      </button>
      {open && <div className="disc-body">{children}</div>}
    </section>
  )
}

// A number inside running prose that can be edited in place. The landing page
// must answer before it asks — a form is homework, a sentence is not.
export function InlineNum({ value, onChange, step = 1, min = 0, suffix, width }) {
  return (
    <span className="inum">
      <input
        type="number" value={value} step={step} min={min}
        style={width ? { width } : undefined}
        onChange={(e) => onChange(Math.max(min, +e.target.value || 0))}
      />
      {suffix && <span className="inum-suffix">{suffix}</span>}
    </span>
  )
}

export function InlineSelect({ value, onChange, options }) {
  return (
    <span className="isel">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </span>
  )
}
