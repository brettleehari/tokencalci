# opentoken — Landing & Product Design Specification

**Version** 1.0 · buildable
**Scope** Full redesign of the public page: shell, hero, demo trap, the ten blocks, the workspace, the reference sections.
**Replaces** `client/src/styles.css` `:root` + hero, and most of `client/src/shell.css`.

---

## 1. Design thesis

The page should feel like a **measuring instrument that happens to have an opinion** — quiet, dimensionally precise, and completely unembarrassed about showing you a large number. Every claim on it is a word; every proof is a figure; and the whole typographic identity is that contrast: **prose is set in a humanist sans, every number on the page is set in a monospace with tabular figures.** Nothing else is decorated. The colour is a cool graphite with exactly one accent (ultramarine), and that accent means one thing only — *this is the open part*. The page is an argument delivered as a descent: you are told the claim, shown its receipt, shown why your intuition about it is wrong, and then walked — one viewport at a time — through the ten things that stand between a downloaded checkpoint and a token you can bill for, until the accumulation is something you have physically scrolled through rather than something you were told about. Only after that does it hand you the calculator.

**One idea per viewport:**

| # | Section | The single idea it owns |
|---|---|---|
| 1 | Hero | Open weights are not open inference — and here are the three prices that prove it. |
| 2 | Demo trap | The demo measured the one property that does not scale. |
| 3 | Hand-off | The demo did not touch the ten blocks. *(seeds the ten-mark artefact, unlit)* |
| 4 | The counter | 1 of 10 blocks is open. |
| 5–14 | Blocks 01–10 | One block each: what it is, what happens if you skip it, who pays for it. |
| 15 | The close | Nine of these are yours to build, buy, staff or rent. |
| 16 | Workspace | Your workload, your number, live. |
| 17 | Findings | Three things the field repeats that the data does not support. |
| 18 | Residency | If your data cannot leave, here is what that costs — and the cheaper rung that probably satisfies you. |
| 19 | Method notes | Who pays for this, and what we got wrong. |
| 20 | Provenance / footer | Every number traces to an input or a dated feed. |

---

## 2. Token system

All tokens live in a new file `client/src/tokens.css`, imported **first** in `main.jsx`.

### 2.1 Typefaces

Two families, three roles. Both are SIL OFL 1.1, self-hosted as variable WOFF2 in `client/public/fonts/` (Vite serves `client/public` at `/`). No CDN, no `@import`, CSP-safe.

| Family | File | Role |
|---|---|---|
| **Inter** v4 (variable, `wght` + `opsz`) | `/fonts/InterVariable.woff2` | All prose, headlines, labels, UI |
| **Geist Mono** (variable, `wght`) | `/fonts/GeistMono-Variable.woff2` | **Every number on the page**: receipts, evidence figures, rail values, inputs, units, block indices, meters, tables |

Inter v4's `opsz` axis gives us the display/text optical relationship legitimately (`font-optical-sizing: auto`), which is what makes 84px headlines and 13px captions come from one family without either looking wrong.

```css
@font-face {
  font-family: "Inter Variable";
  src: url("/fonts/InterVariable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Geist Mono Variable";
  src: url("/fonts/GeistMono-Variable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

:root {
  --font-sans: "Inter Variable", "Inter", system-ui, -apple-system,
               "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "Geist Mono Variable", "Geist Mono", ui-monospace, "SF Mono",
               "JetBrains Mono", "Roboto Mono", Menlo, Consolas, monospace;
}

html { font-family: var(--font-sans); font-optical-sizing: auto; }
.mono, [class*="-data"], input[type="number"], .tabular {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums slashed-zero;
}
```

> Build note: subset both files to `latin` + the arrow/×/→/− glyphs used on the page. Target ≤ 90 KB each. If the arrow glyphs do not survive subsetting, draw them as inline SVG (they are decorative and `aria-hidden` anyway).

### 2.2 Type scale

Three scales, deliberately separate. Mixing them is the bug that made the current page feel like two products.

**Narrative scale** — the scroll sequence (hero, demo, blocks, findings, residency).

```css
:root {
  /* size | weight | line-height | tracking */
  --t-display-1-size: clamp(2.75rem, 6.2vw, 5.25rem); /* 44 → 84 */
  --t-display-1-weight: 680;
  --t-display-1-lh: 1.02;
  --t-display-1-ls: -0.035em;

  --t-display-2-size: clamp(2.125rem, 4.2vw, 3.5rem);  /* 34 → 56 */
  --t-display-2-weight: 660;
  --t-display-2-lh: 1.06;
  --t-display-2-ls: -0.030em;

  --t-headline-size: clamp(1.5rem, 2.4vw, 2rem);       /* 24 → 32 */
  --t-headline-weight: 640;
  --t-headline-lh: 1.16;
  --t-headline-ls: -0.022em;

  --t-subhead-size: clamp(1.125rem, 1.6vw, 1.375rem);  /* 18 → 22 */
  --t-subhead-weight: 420;
  --t-subhead-lh: 1.50;
  --t-subhead-ls: -0.012em;

  --t-body-size: 1.0625rem;   /* 17 */
  --t-body-weight: 400;
  --t-body-lh: 1.62;
  --t-body-ls: -0.008em;

  --t-body-sm-size: 0.9375rem; /* 15 */
  --t-body-sm-lh: 1.60;

  --t-caption-size: 0.8125rem; /* 13 */
  --t-caption-weight: 420;
  --t-caption-lh: 1.50;
  --t-caption-ls: 0;

  --t-eyebrow-size: 0.6875rem; /* 11 */
  --t-eyebrow-weight: 620;
  --t-eyebrow-lh: 1.2;
  --t-eyebrow-ls: 0.10em;      /* + text-transform: uppercase */
}
```

**Data scale** — mono, tabular, used for every figure.

```css
:root {
  --t-data-xl-size: clamp(3rem, 7vw, 6rem);    /* 48 → 96 — receipt stops, the "1" */
  --t-data-xl-weight: 600; --t-data-xl-lh: 0.95; --t-data-xl-ls: -0.040em;

  --t-data-l-size: clamp(2rem, 3.6vw, 3rem);   /* 32 → 48 — block evidence, answer cards */
  --t-data-l-weight: 600; --t-data-l-lh: 1.00; --t-data-l-ls: -0.030em;

  --t-data-m-size: 1.5rem;    /* 24 — rail bottom line, promoted specs */
  --t-data-m-weight: 600; --t-data-m-lh: 1.10; --t-data-m-ls: -0.020em;

  --t-data-s-size: 0.875rem;  /* 14 — table cells, rail values */
  --t-data-s-weight: 550; --t-data-s-lh: 1.30; --t-data-s-ls: 0;

  --t-data-xs-size: 0.75rem;  /* 12 — units, meter counts, chips */
  --t-data-xs-weight: 500; --t-data-xs-lh: 1.30; --t-data-xs-ls: 0.010em;
}
```

**Instrument scale** — the workspace only. Compact on purpose; do not raise it.

```css
:root {
  --t-i-title-size: 0.9375rem;  --t-i-title-weight: 600; --t-i-title-ls: -0.008em;
  --t-i-label-size: 0.78125rem; --t-i-label-weight: 550; /* 12.5 */
  --t-i-value-size: 0.875rem;   --t-i-value-weight: 600; /* mono */
  --t-i-hint-size:  0.71875rem; --t-i-hint-lh: 1.5;      /* 11.5 */
}
```

**Two typographic laws.**

1. **Every number is mono.** Prices, counts, percentages, tok/s, GB, ×-multiples, dates, block indices. No exceptions, including inside prose (`<b>0.98×</b>` becomes `<span class="mono">0.98×</span>`).
2. **A number that changes the decision is never smaller than `--t-data-m` (24px).** This is the rule that fixes *"110× H100 · fixed, 24×7"* being the smallest type on the page. If a figure is load-bearing it gets the `<Figure>` component; if it is not load-bearing, delete it.

**Measures.** Headline ≤ 18ch · deck ≤ 44ch · body ≤ 68ch · caption ≤ 76ch · evidence note ≤ 30ch. Apply with `max-width` in `ch`, plus `text-wrap: balance` on every headline and `text-wrap: pretty` on decks.

### 2.3 Colour

A cool graphite ramp (hue ≈ 232°, chroma ≤ 0.018 — never pure grey), one accent, three semantics, and a warm cost ramp for the decomposition bars.

```css
/* ---------- ramp ---------- */
:root {
  --g-0:    #FFFFFF;
  --g-25:   #FAFBFD;
  --g-50:   #F4F6F9;
  --g-100:  #ECEEF4;
  --g-150:  #E2E5ED;
  --g-200:  #D5D9E4;
  --g-300:  #BEC3D2;
  --g-400:  #8B92A6;
  --g-500:  #646B7E;
  --g-600:  #4E5465;
  --g-700:  #3D4353;
  --g-800:  #2B3040;
  --g-900:  #1F2330;
  --g-950:  #141721;
  --g-1000: #0B0D14;
}
```

```css
/* ---------- LIGHT (default) ---------- */
:root {
  color-scheme: light dark;

  --bg:              #F4F6F9;
  --bg-sunken:       #ECEEF4;
  --surface:         #FFFFFF;
  --surface-2:       #F4F6F9;
  --surface-inverse: #141721;

  --fg-1:       #141721;   /* primary text          16.0:1 on --bg */
  --fg-2:       #3D4353;   /* secondary text         9.6:1 */
  --fg-3:       #646B7E;   /* captions, units        4.8:1 */
  --fg-inverse: #FAFBFD;

  --line:        #D5D9E4;
  --line-soft:   #E9ECF2;
  --line-strong: #BEC3D2;

  --accent:       #3A34D8;  /* ultramarine — means "this is the open part"  7.1:1 */
  --accent-hover: #2E29B8;
  --accent-fg:    #FFFFFF;
  --accent-weak:  #EDECFC;
  --accent-line:  #C3C0F4;

  --good:          #0B7A53;  /* 5.4:1 */
  --good-weak:     #E1F4EC;
  --good-line:     #A7DCC6;
  --warn:          #A35F00;  /* 5.0:1 */
  --warn-weak:     #FDF0DC;
  --warn-line:     #EFC98A;
  --critical:      #C4362A;  /* 5.4:1 */
  --critical-weak: #FCE9E7;
  --critical-line: #F0B6AF;

  /* cost decomposition — warm sequential, with idle deliberately breaking the ramp */
  --cost-compute:  #8A5200;
  --cost-facility: #B87A17;
  --cost-people:   #D9A550;
  --cost-idle:     #C4362A;
}
```

```css
/* ---------- DARK ---------- */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg:              #0B0D14;
    --bg-sunken:       #07080D;
    --surface:         #141721;
    --surface-2:       #1F2330;
    --surface-inverse: #F4F6F9;

    --fg-1:       #ECEEF4;   /* 16.5:1 */
    --fg-2:       #AEB4C4;   /*  9.7:1 */
    --fg-3:       #8A92A8;   /*  6.3:1 */
    --fg-inverse: #141721;

    --line:        #2B3040;
    --line-soft:   #212532;
    --line-strong: #3B4154;

    --accent:       #8F8AFF;  /* 6.7:1 */
    --accent-hover: #A5A1FF;
    --accent-fg:    #0B0D14;
    --accent-weak:  #1B1B3A;
    --accent-line:  #3B379E;

    --good:          #3CD9A0;
    --good-weak:     #0E2A22;
    --good-line:     #1D5C46;
    --warn:          #F5B942;
    --warn-weak:     #2E2211;
    --warn-line:     #6B4E14;
    --critical:      #FF7565;
    --critical-weak: #331614;
    --critical-line: #7A2E26;

    --cost-compute:  #C98A2E;
    --cost-facility: #E0A855;
    --cost-people:   #F0CB93;
    --cost-idle:     #FF7565;
  }
}
/* explicit toggle must win in BOTH directions — duplicate the dark block verbatim here */
:root[data-theme="dark"] { /* …identical declarations to the @media block above… */ }
```

Implementation of the toggle: write the dark declarations once into a CSS custom-property block and apply it via `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` **and** `:root[data-theme="dark"]` (duplicate the block; it is ~35 lines and duplication is cheaper than a runtime class dance). Store the choice on `document.documentElement.dataset.theme` from a small `<script>` in `index.html` head reading `localStorage` — this page has no privacy constraint against it. Toggle control lives in `.app-bar-right`.

**Colour discipline.** Accent is reserved for: interactive text/controls, focus rings, and the single lit mark in the ten-mark artefact. It is never used for a cost figure. `--critical` is only used for the figure that is the bad news (the self-host price, the ~100× gap, `SKIP IT AND` rules). `--good` is only used for `Free` and for the winning option. Nothing else on the page is coloured.

### 2.4 Spacing & vertical rhythm

4px base. Only these values exist.

```css
:root {
  --s-1:  0.25rem;  /*  4 */
  --s-2:  0.5rem;   /*  8 */
  --s-3:  0.75rem;  /* 12 */
  --s-4:  1rem;     /* 16 */
  --s-5:  1.5rem;   /* 24 */
  --s-6:  2rem;     /* 32 */
  --s-7:  3rem;     /* 48 */
  --s-8:  4rem;     /* 64 */
  --s-9:  6rem;     /* 96 */
  --s-10: 8rem;     /* 128 */
  --s-11: 10rem;    /* 160 */

  --bar-h: 56px;
  --w-narrative: 1120px;
  --w-artefact:   960px;
  --w-prose:      720px;
  --w-workspace: 1360px;
  --gutter: var(--s-5);
}
@media (max-width: 900px) { :root { --gutter: 1.25rem; } }
@media (max-width: 600px) { :root { --gutter: var(--s-4); --bar-h: 52px; } }
```

**The vertical-rhythm rule, stated once:**

> Every vertical dimension is a multiple of **8px**. 4px is permitted only *inside* a control (label→input gap, chip padding). Narrative sections express their spacing as `padding-block` only — never `margin-block` — so adjacent sections compose without collapse and the rhythm is auditable by reading one property.

```css
.section        { padding-block: var(--s-10); }   /* ≥901px  → 128 */
@media (max-width: 900px) { .section { padding-block: var(--s-8); } }  /* 64 */
@media (max-width: 600px) { .section { padding-block: var(--s-7); } }  /* 48 */
```

Within a section, fixed intervals:

| From → To | Gap |
|---|---|
| eyebrow → headline | `--s-4` (16) |
| headline → deck | `--s-5` (24) |
| deck → artefact/figure | `--s-7` (48) |
| artefact → caption/footnote | `--s-5` (24) |
| block sub-slot → next sub-slot | `--s-5` (24) |
| section → next section | 0 (each pays its own `padding-block`) |

### 2.5 Radii, borders, elevation

```css
:root {
  --r-1: 6px;    /* chips, tags, small inputs */
  --r-2: 10px;   /* inputs, buttons, segmented */
  --r-3: 14px;   /* cards, config surface, rail */
  --r-4: 20px;   /* the receipt, the artefact card, mobile sheet */
  --r-full: 999px;

  --e-1: 0 1px 2px rgba(11,13,20,.05);
  --e-2: 0 1px 2px rgba(11,13,20,.05), 0 4px 12px rgba(11,13,20,.06);
  --e-3: 0 2px 4px rgba(11,13,20,.05), 0 12px 32px rgba(11,13,20,.08);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --e-1: 0 0 0 1px rgba(255,255,255,.04);
    --e-2: 0 0 0 1px rgba(255,255,255,.05), 0 8px 24px rgba(0,0,0,.50);
    --e-3: 0 0 0 1px rgba(255,255,255,.06), 0 20px 48px rgba(0,0,0,.60);
  }
}
```

**Border and elevation discipline.** Hairlines are `1px solid var(--line)`. Elevation is reserved for things that *float over* content: the sticky rail, the sticky meter, popovers, the mobile dock. **Page sections are separated by whitespace and hairlines, never by shadows and never by nested cards.** This single rule removes most of the current visual noise.

**Focus.** One treatment everywhere:

```css
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: inherit; }
```

---

## 3. Page architecture

One page. Two remaining routes (`Estimate` — the page — and `Paper`). `The chain` stops being a tab and becomes the centre of the page.

```
┌ app bar (sticky, 56px) ─ opentoken · beta │ Estimate  Paper │ price stamp · theme · credit
│
├ 01  HERO                      100svh   thesis sentence + THE RECEIPT + CTA pair
├ 02  DEMO TRAP — the split      88svh   39 vs 3,900, ≈100×
├ 03  DEMO TRAP — the physics    auto    bandwidth bars + one Notes disclosure
├ 04  HAND-OFF band              auto    inverse surface; ten marks, all unlit
│
├ 05  THE COUNTER               100svh   "1 of 10" — the artefact
│     ┌ sticky meter appears ───────────────────────────────────────────┐
├ 06  BLOCK 01  Weights          88svh   the only lit one                │
├ 07  BLOCK 02  Precision        88svh                                   │
├ 08  BLOCK 03  KV cache         88svh                                   │
├ 09  BLOCK 04  Batching         88svh                                   │
├ 10  BLOCK 05  Kernels          88svh                                   │
├ 11  BLOCK 06  Parallelism      88svh   + live TPT table                │
├ 12  BLOCK 07  Fleet            88svh                                   │
├ 13  BLOCK 08  Reliability      88svh                                   │
├ 14  BLOCK 09  Economics        88svh                                   │
├ 15  BLOCK 10  Surface          88svh                                   │
│     └ sticky meter dismisses ──────────────────────────────────────────┘
├ 16  THE CLOSE                 100svh   inverse; 9 filled + 1 lit; "→ Tokens" bridge
│
├ 17  WORKSPACE                  auto    Answer sentence + config card + sticky rail
├ 18  FINDINGS                   auto    three measured claims
├ 19  RESIDENCY                  auto    the five priced rungs  (promoted from L4)
├ 20  METHOD NOTES               auto    funding + self-correction (promoted from L4)
├ 21  PROVENANCE                 auto    data layers table
└     footer
```

### What is being REMOVED

| Removed | Why / where it goes |
|---|---|
| `Thesis.jsx` — the two body paragraphs (`.thesis-body`) | Four jargon terms above the receipt. Para 1 collapses to a single 22-word deck **below** the receipt. Para 2 is deleted; the product is self-evident from the receipt. |
| `.thesis-second` (walled-garden paragraph) | Moves to §19 Residency as its opening deck. It was a second argument stapled to the hero. |
| The `chain` nav tab | Becomes `#chain`. `App.jsx` keeps the route id as a redirect to the anchor so old links work. |
| `.cblock` / `.cblock-head` / `.cblock-body` accordion | Replaced entirely by the block-section sequence. Ten click-to-expand rows cannot be a centrepiece. |
| `.chain-intro` panel + its two explanatory paragraphs | The "source code was never the product" analogy moves into the Paper. The counter needs no preamble. |
| `DemoMyth` CPU prose (`.myth-cpu`, two paragraphs) | One `Disclosure` titled *"And on CPU?"* under the bandwidth bars. |
| `DemoMyth` `.myth-close` block | Becomes §04, the hand-off band — same words, promoted to display type on an inverse surface. |
| `Findings` "See the chain" CTA | The chain is now on the same page; becomes an anchor scroll. |
| `<Disclosure id="data-residency">` and `<Disclosure id="provenance">` wrappers | Their contents become §19 and §21, real sections. |
| Legacy `styles.css`: `header`, `h1`, `.tag`, `.tabs`, `.stamp`, `.beta` | Dead once the shell is rebuilt. Delete, do not port. |
| `Caveats` list in `App.jsx` (7 long bullets) | Compressed to 3 bullets + a link to §21 Provenance, which now says the same thing in a table. |
| Every nested card (`.panel` inside `.disc-body` inside `.ws-section`) | Flattened per §2.5. |

---

## 4. The hero

`min-height: calc(100svh - var(--bar-h))`, `display: grid; align-content: center`, `padding-block: var(--s-9)`, container `--w-narrative`, **left-aligned**. (A measuring instrument that centres its headline reads like a brochure; left alignment gives the receipt a ledger edge and lets the three stops share a rule.)

### At 0 seconds, in this order

```
OPEN-WEIGHT INFERENCE · PRICED LIVE · 2026-08-21          ← eyebrow, --t-eyebrow, --fg-3
                                                            16px
Open weights are not                                      ← H1, --t-display-1, --fg-1
open inference.                                             max-width 15ch, balance
                                                            48px
┌──────────────────────────────────────────────────────┐
│ RIGHT NOW · QWEN3 30B-A3B · PER 1M TOKENS   ● 2026-08-21
│                                                       │
│   Free       →      $0.404      →      $10.45         │  ← THE RECEIPT
│   to download        to rent the same    to run those │
│   the weights        weights from a      same weights │
│                      neocloud            yourself     │
│  ─────────────────────────────────────────────────── │
│  Even with nothing idle and nobody paid, your own     │
│  GPUs cost $6.12/1M — still 15× the neocloud price.   │
│  That residue is the serving work the weights don't   │
│  include.                                    [Copy]   │
└──────────────────────────────────────────────────────┘
                                                            24px
The weights are free. Serving them is a discipline —      ← deck, --t-subhead, --fg-2
and a neocloud (a GPU-first cloud that rents inference      max-width 52ch
by the token) has already done it.
                                                            32px
See the ten blocks ↓        Price my workload ↓            ← CTA pair
```

**Height budget** at 1280×800: 16 + 16 + 168 + 48 + 264 + 24 + 60 + 32 + 26 = **654px** against 744px of available viewport. Fits with air. Below 700px viewport height the H1 steps down to `--t-display-2` via `@media (max-height: 700px)`.

### Receipt typesetting — exact

```css
.receipt {
  max-width: var(--w-artefact);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-4);
  box-shadow: var(--e-2);
  padding: var(--s-6) var(--s-7) var(--s-5);   /* 32 48 24 */
}
.receipt-head {
  display: flex; align-items: center; justify-content: space-between; gap: var(--s-4);
  font: var(--t-eyebrow-weight) var(--t-eyebrow-size)/var(--t-eyebrow-lh) var(--font-sans);
  letter-spacing: var(--t-eyebrow-ls); text-transform: uppercase; color: var(--fg-3);
  padding-bottom: var(--s-5);
}
.receipt-row {
  display: grid;
  grid-template-columns: 1fr 56px 1fr 56px 1fr;
  align-items: baseline;
  gap: 0;
}
.receipt-stop { display: flex; flex-direction: column; gap: var(--s-3); min-width: 0; }
.receipt-fig {
  font-family: var(--font-mono);
  font-size: var(--t-data-xl-size);
  font-weight: var(--t-data-xl-weight);
  line-height: var(--t-data-xl-lh);
  letter-spacing: var(--t-data-xl-ls);
  font-variant-numeric: tabular-nums slashed-zero;
  color: var(--fg-1);
}
.receipt-fig .cur {              /* the Apple price treatment */
  font-size: 0.56em; font-weight: 500; color: var(--fg-3);
  vertical-align: 0.28em; margin-right: 0.06em;
}
.receipt-stop:nth-child(1) .receipt-fig { color: var(--good); }
.receipt-stop:nth-child(5) .receipt-fig { color: var(--critical); }
.receipt-label {
  font: var(--t-caption-weight) var(--t-caption-size)/var(--t-caption-lh) var(--font-sans);
  color: var(--fg-3); max-width: 20ch;
}
.receipt-arrow {                 /* hairline + chevron, not a text glyph */
  align-self: center; position: relative; height: 1px; background: var(--line);
  margin-top: -1.4em;            /* optically centres on the figures' x-height */
}
.receipt-arrow::after {
  content: ""; position: absolute; right: 0; top: -3px;
  width: 7px; height: 7px; border-top: 1px solid var(--line-strong);
  border-right: 1px solid var(--line-strong); transform: rotate(45deg);
}
.receipt-note {
  margin-top: var(--s-5); padding-top: var(--s-5);
  border-top: 1px solid var(--line-soft);
  font: var(--t-caption-weight) var(--t-caption-size)/var(--t-caption-lh) var(--font-sans);
  color: var(--fg-2); max-width: 76ch;
}
.receipt-note .mono { color: var(--fg-1); font-weight: 600; }
.receipt-actions { /* ghost buttons, opacity 0 → 1 on :hover/:focus-within; always 1 on coarse pointers */ }
```

**Copy rules for the hero.**
- The H1 is the thesis sentence, unchanged, uncoloured, unhighlighted. Nothing is bolded inside it.
- **"neocloud" is defined in plain words on first use, in the deck, in parentheses.** Not a tooltip. The `<Term>` popover exists as a *reminder* for later occurrences, never as the only definition.
- The receipt note is the only place in the hero where a second number appears, and both of its numbers are mono.
- Total word count above the fold, excluding the receipt: **≤ 45 words.**

### CTA pair

Apple-style text links, not buttons. `--t-body-size`, weight 500, `color: var(--accent)`, `gap: var(--s-7)` between them, each with a `↓` that translates 3px down on hover. Primary is *See the ten blocks ↓* (`#chain`) — the ten blocks are the product demo, so they get the primary slot. Secondary is *Price my workload ↓* (`#workspace`).

---

## 5. The data moments

One component does all of them.

```jsx
// client/src/ui/Figure.jsx
<Figure
  size="xl|l|m|s"        // maps to --t-data-*
  value="10.45"          // string, pre-formatted
  currency="$"           // optional, gets .cur treatment
  unit="per 1M tokens"   // optional, --t-data-xs, --fg-3
  label="to run those same weights yourself"  // optional, --t-caption, --fg-3, ≤20ch
  tone="neutral|good|warn|critical|accent"
  source="vLLM paper"    // optional footnote line
/>
```

**Rules that apply to every figure on the page:**

1. Mono, `tabular-nums slashed-zero`. Values never reflow when they change.
2. The currency symbol is 0.56em, weight 500, `--fg-3`, raised `0.28em`.
3. The unit is a separate element in `--t-data-xs` `--fg-3`, on the same baseline, `margin-left: 0.25em`. Never italic. Never part of the number's string.
4. The label sits *below* the figure, never beside it, max 20ch, `--t-caption` `--fg-3`.
5. Sibling figures share a baseline via `align-items: baseline` on the parent grid — never `center`.
6. Tone is applied to the figure only, never to the label.
7. A figure that is sourced carries `SOURCE · <name>` in `--t-data-xs` `--fg-3` under a `--line-soft` hairline.

### 5.1 The receipt — §4 above. `size="xl"`, three stops, one shared baseline.

### 5.2 The demo split (§02)

Two figures on one baseline, with the ratio between them as the third object.

```
   39                    ≈100×                3,900
   tok/s                 apart                tok/s
   for one person,                            for hundreds, one H100
   batch 1                                    at batch 256
```

- Left figure `--t-data-xl`, colour **`--fg-3`** — deliberately weak. It is the number you were shown and it is the wrong one.
- Right figure `--t-data-xl`, colour `--fg-1` — solid.
- Centre: `≈100×` in `--t-data-l`, inside a pill `background: var(--critical-weak); color: var(--critical); border-radius: var(--r-full); padding: var(--s-3) var(--s-5)`, with `apart` beneath in `--t-caption`.
- Grid `1fr auto 1fr`, `align-items: baseline`, gap `--s-7`.
- Caption below, full width, `--t-body`, `--fg-2`, ≤68ch: *"Latency for one and throughput for many are different quantities. Every demo shows the first. Every bill is set by the second."*

### 5.3 The verdict (§17 rail, and the answer cards)

- The verdict word is `--t-headline` (24–32px), not 17px. It is the answer; it gets headline type.
- The two cost cards use `<Figure size="l">` with the `$` treatment and `/mo` as the unit.
- The winning card gets `border-color: var(--good); background: var(--good-weak)` — a tint, never a fill, so the mono figure keeps its contrast.
- **`"110× H100 · fixed, 24×7"` is promoted** from `.ans-sub` caption type to `<Figure size="m" value="110×" unit="H100" label="fixed cost, 24×7, whether you use them or not" tone="warn" />`. This is the most explanatory fact in the answer band and it currently hides at 12px.

### 5.4 The ten-blocks counter (§05) — **the artefact**

This is the single most screenshot-able object on the page. It is built as a fixed-ratio card so that a screenshot of it is already an OG image.

```css
.artefact {
  aspect-ratio: 1200 / 630;
  width: 100%; max-width: var(--w-artefact);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-4);
  box-shadow: var(--e-2);
  padding: clamp(24px, 4.4vw, 56px);
  display: grid; align-content: center; gap: var(--s-6);
  position: relative;
}
.artefact-stamp {              /* bottom-left, baked into any screenshot */
  position: absolute; left: clamp(24px,4.4vw,56px); bottom: clamp(20px,3vw,40px);
  font: var(--t-eyebrow-weight) var(--t-eyebrow-size)/1.2 var(--font-sans);
  letter-spacing: var(--t-eyebrow-ls); text-transform: uppercase; color: var(--fg-3);
}                              /* content: "opentoken · prices as of 2026-08-21" */

/* the ratio, set as one line */
.ratio { display: flex; align-items: baseline; gap: var(--s-4); }
.ratio-num {
  font-family: var(--font-mono); font-size: var(--t-data-xl-size);
  font-weight: 600; line-height: 0.9; letter-spacing: -0.04em; color: var(--accent);
}
.ratio-of {
  font-size: var(--t-display-2-size); font-weight: 600;
  letter-spacing: -0.03em; color: var(--fg-3);
}

/* the ten marks */
.tenmark { display: grid; grid-template-columns: repeat(10, 1fr); gap: 8px;
           width: 100%; max-width: 560px; }
.tenmark i {
  aspect-ratio: 1 / 2;                       /* 48 × 96 at 560px; scales down intact */
  border-radius: 5px;
  background: var(--g-200);
  box-shadow: inset 0 0 0 1px var(--line);
}
.tenmark i.on {
  background: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent), 0 0 0 4px var(--accent-weak);
}
:root[data-theme="dark"] .tenmark i,
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .tenmark i { background: var(--g-800); } }

/* only two of the ten are named — the anonymity of the other eight is the point */
.tenmark-labels { display: grid; grid-template-columns: repeat(10, 1fr); gap: 8px;
                  margin-top: var(--s-3); }
.tenmark-labels span {
  font: 500 var(--t-data-xs-size)/1.2 var(--font-mono);
  letter-spacing: .06em; text-transform: uppercase; color: var(--fg-3);
}
.tenmark-labels span:first-child { color: var(--accent); }
```

Composition inside the artefact, top to bottom:

```
1  of 10                                   ← .ratio  (mono 96px accent + sans 56px fg-3)
blocks between a downloadable checkpoint   ← --t-headline, --fg-1, max 26ch
and a token you can bill for is open.
                                              48px
▮ ▯ ▯ ▯ ▯ ▯ ▯ ▯ ▯ ▯                        ← .tenmark, one lit
WEIGHTS · · · · · · · · SURFACE            ← .tenmark-labels
                                              (positions 2–9 empty by design)
opentoken · prices as of 2026-08-21        ← .artefact-stamp
```

**Thumbnail test.** At 200px card width the marks are ~9.6 × 19px with 1.6px gaps. One saturated ultramarine among nine graphite reads instantly. Because the marks use `aspect-ratio` rather than a fixed height, this degrades proportionally with no breakpoint.

**Sharing affordances**, immediately below the artefact, `--t-caption`, ghost buttons:
- **Copy as text** → `1 of 10 · Only the weights are open. The other nine blocks — precision, KV cache, batching, kernels, parallelism, fleet, reliability, economics, surface — are yours to build, buy, staff or rent. opentoken`
- **Copy link** → `…/#chain`
- *(Stage 6, optional)* **Download card** → 60-line `<canvas>` routine that redraws the artefact at 1200×630 and `toBlob()`s it. No dependency.

### 5.5 The cost decomposition (§17)

Keep the walk-up structure — it is genuinely good — and restyle:

- Rows on the 8px grid, `grid-template-columns: minmax(160px, 240px) 1fr 104px`.
- Bar track `height: 12px; border-radius: var(--r-full); background: var(--bg-sunken)`.
- Fills use the `--cost-*` ramp. `idle` is `--critical` on purpose: it breaks the sequential ramp because it is waste, not a cost.
- Values right-aligned mono `--t-data-s`; the delta (`+$2.40`) beneath in `--t-data-xs` `--fg-3`.
- The `dec-marquee` (self-host vs neocloud, ×) becomes two `<Figure size="l">` sharing a baseline with the multiple as a pill between them — **identical treatment to the demo split**, so the reader recognises the pattern. Reusing the comparison form is how the page teaches itself.

---

## 6. The ten blocks

### 6.1 Section shell

```css
.block {
  min-height: 88svh;
  padding-block: var(--s-9);
  scroll-margin-top: calc(var(--bar-h) + var(--s-4));
  display: grid; align-content: center;
}
.block-grid {
  width: 100%; max-width: var(--w-narrative); margin-inline: auto;
  padding-inline: var(--gutter);
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 400px;
  column-gap: var(--s-7); row-gap: var(--s-6);
  align-items: start;
}
```

The grid is **rigid and identical for all ten**. No alternating, no variation. Consistency is what converts ten sections into one accumulating sequence — variation would make them feel like ten unrelated pages.

### 6.2 Per-block content pattern

Every block fills the same eight slots. Copy is written to the slots; the slots are not adjusted to the copy.

| Slot | Column | Type | Rule |
|---|---|---|---|
| **① Index** | 1 | mono `--t-data-l`, `--fg-3` (block 01: `--accent`) | `01`–`10`, zero-padded. `position: sticky; top: calc(var(--bar-h) + var(--s-6))` within the section. |
| **② Status chip** | 2 | `--t-data-xs` mono, uppercase, `--r-full`, tinted | One of `OPEN` / `HARDEST` / `UNCOPYABLE` / `COUNTER-INTUITIVE`, or absent. Tints: accent-weak / critical-weak / warn-weak / surface-2. |
| **③ Name** | 2 | `--t-display-2`, `--fg-1` | 1–3 words. |
| **④ Line** | 2 | `--t-subhead`, `--fg-2`, ≤40ch | The plain-English *what it is*, no jargon, no numbers. |
| **⑤ What the work is** | 2 | eyebrow `WHAT THE WORK IS` + `--t-body` `--fg-2` ≤60ch | Existing `what` copy. |
| **⑥ Skip it and** | 2 | eyebrow `SKIP IT AND` + `--t-body` `--fg-1`, 2px `--critical` left rule, `padding-left: var(--s-4)` | **NEW copy, one sentence per block.** Rule: *present tense, names the observable business consequence, contains no engineering jargon, ≤ 22 words.* e.g. block 03 → "Your service serves a quarter of the users the same GPUs could have served, and you buy four times the hardware to hide it." |
| **⑦ Who pays for it** | 2 | eyebrow + 2-row micro-table, hairline between, `--t-body-sm` | Row A: chip `VENDOR` (accent-weak) + existing `inherit` copy. Row B: chip `YOUR TEAM` / `YOUR BUDGET` / `YOUR PAGER` (warn-weak) + existing `own` copy. |
| **⑧ Budget line** | 2 | 3 chips max, `--t-data-xs` mono, `--surface-2`, `--r-full`, `--fg-3` | **NEW.** This is what makes the block enterprise-legible. Fixed slots: `Owner: <function>` · `Recurs: <cadence>` · `Typical: <magnitude>`. e.g. `Owner: Inference eng.` `Recurs: every engine upgrade` `Typical: 1–2 FTE`. |
| **⑨ Evidence panel** | 3 | card | See below. |

**Evidence panel** — column 3, `position: sticky; top: calc(var(--bar-h) + var(--s-6))`:

```css
.evidence {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-3); padding: var(--s-6); box-shadow: var(--e-1);
  display: grid; gap: var(--s-4);
}
```
Contents: eyebrow `EVIDENCE` → `<Figure size="l" tone=…>` → `evidenceNote` in `--t-caption` `--fg-3` ≤30ch → hairline → `SOURCE · <citation>` in `--t-data-xs`.

Tone mapping: block 01 `Free` → `good`. Blocks 03, 04, 06 (`70–80% wasted`, `~100× swing`, `8 GPUs ≈ 1 GPU`) → `critical`. Block 09 `Structural` → `warn`. Rest → `neutral`.

Block **06 Parallelism** replaces the figure with the live TPT table *inside the same frame* — same border, same padding, same eyebrow. Rows: `name | VRAM | N× H100 | at fp8`, all mono `--t-data-s`, values right-aligned, `1×` in `--good`, `≥8×` in `--critical`.

### 6.3 The sticky meter — how accumulation is felt

A pinned meter, mounted only while `#chain` is in view. It is the same artefact as §5.4, shrunk, so the hero of the section follows you down.

```css
.chain-meter {
  position: sticky; top: calc(var(--bar-h) + var(--s-3)); z-index: 20;
  width: fit-content; margin-inline: auto;
  height: 44px; padding-inline: var(--s-4);
  display: flex; align-items: center; gap: var(--s-4);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: saturate(180%) blur(14px);
  border: 1px solid var(--line); border-radius: var(--r-full);
  box-shadow: var(--e-2);
  transition: opacity 240ms ease-out, transform 240ms ease-out;
}
.chain-meter .count { font: 500 var(--t-data-xs-size)/1 var(--font-mono); color: var(--fg-2); }
.chain-meter .marks { display: flex; gap: 4px; }
.chain-meter .marks i { width: 8px; height: 20px; border-radius: 2px; background: var(--g-200);
                        transition: background-color 240ms ease-out, box-shadow 240ms ease-out; }
.chain-meter .marks i.lit     { background: var(--accent); }       /* block 01, always */
.chain-meter .marks i.passed  { background: var(--fg-2); }         /* graphite — accumulation */
.chain-meter .marks i.current { background: var(--fg-1); box-shadow: 0 0 0 2px var(--accent-weak); }
.chain-meter .now { width: 14ch; font: 500 var(--t-data-xs-size)/1 var(--font-mono);
                    letter-spacing: .06em; text-transform: uppercase; color: var(--fg-3); }
```

**The choreography, precisely:** as the reader descends, marks fill with **graphite, not accent**. Only mark 1 is ever accent. By block 10 the meter is a nearly solid graphite bar with a single blue notch — the reader has *watched* the nine unlit things accumulate. The `14ch` fixed width on the current-block name prevents the meter from jittering as names change length.

Driver: one `IntersectionObserver` over the ten `.block` sections with `rootMargin: "-45% 0px -45% 0px"` (fires when a section crosses the viewport midline), setting `current` in React state. The meter's own mount/unmount is a second observer on the `#chain` wrapper.

### 6.4 The hand-off from the demo trap (§04)

This is where the ten-mark artefact is *seeded*, unexplained, so the counter in §05 lands as a resolution rather than an introduction.

```css
.handoff { background: var(--surface-inverse); color: var(--fg-inverse);
           padding-block: var(--s-9); }
.handoff .tenmark i { background: color-mix(in srgb, var(--fg-inverse) 14%, transparent);
                      box-shadow: none; }
```

Contents, centred in `--w-narrative`, left-aligned:
1. `--t-display-2`, `--fg-inverse`, max 24ch:
   > **The demo proved the weights work.
   > It did not touch the ten blocks that turn weights into a service.**
2. 48px.
3. `.tenmark` — **all ten unlit**, at 14% opacity of the inverse foreground. No labels, no caption, no explanation.
4. 32px.
5. A single down-chevron, `--fg-inverse` at 50%, `aria-hidden`.

The reader scrolls out of an inverse band holding ten grey marks and into a light band where exactly one of them turns blue. That transition is the whole argument in one gesture.

### 6.5 The close (§16)

`background: var(--surface-inverse)`, `min-height: 100svh`, `align-content: center`.

1. `.tenmark` at full artefact scale: nine marks filled `--fg-inverse` at 26%, mark 1 `--accent` at full saturation with its ring.
2. `--t-display-1`, `--fg-inverse`, max 18ch: **"Nine of these are yours to build, buy, staff or rent."**
3. `--t-subhead`, `--fg-inverse` at 70%, max 44ch: *"Only the first one arrived in the download."*
4. 48px, then the bridge — the existing terminal node, promoted:
   `→ Tokens, at a price per million.` in `--t-headline`, followed by the CTA **`Price your workload ↓`** (`#workspace`), styled as an inverse-surface text link (`--accent` lightened to `--accent-hover` for contrast on `--surface-inverse`; verify ≥ 4.5:1 and substitute `#B0ACFF` if not).

---

## 7. The workspace

Density is preserved. The frame changes.

### 7.1 One card, eight bands

The current failure is eight bordered white cards stacked in a column, reading as a wall. Fix without touching a single field:

```css
.ws { display: grid; grid-template-columns: minmax(0,1fr) 380px;
      gap: var(--s-6); align-items: start;
      max-width: var(--w-workspace); margin-inline: auto; padding-inline: var(--gutter); }

.ws-config {                                    /* was: flex column of gap:16 cards */
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-3); overflow: hidden;
}
.ws-section {                                   /* was: its own card */
  border: 0; border-radius: 0; background: none;
  padding: var(--s-5) var(--s-6) var(--s-6);
  border-top: 1px solid var(--line-soft);
}
.ws-section:first-child { border-top: 0; }
```

### 7.2 Field and control restyle

Unchanged geometry (`minmax(196px, 1fr)` grid, 12.5px labels, 14px controls). Changes only:

```css
.ws-control input, .ws-control select {
  background: var(--surface-2);                /* wells inside a white card */
  border: 1px solid var(--line); border-radius: var(--r-2);
  font-family: var(--font-mono);               /* every numeric input is mono */
  font-variant-numeric: tabular-nums slashed-zero;
}
.ws-control select { font-family: var(--font-sans); }   /* text choices stay sans */
.ws-control input:focus, .ws-control select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-weak);
  background: var(--surface);
}
.ws-value, .rail-line-value, .ws-derived b, .tpt-val, .cval { font-family: var(--font-mono); }
```

### 7.3 The rail

```css
.ws-rail { position: sticky; top: calc(var(--bar-h) + var(--s-5)); }
.ws-rail-inner {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-3); box-shadow: var(--e-2);
  max-height: calc(100svh - var(--bar-h) - var(--s-8));
  display: flex; flex-direction: column; overflow: hidden;
}
.rail-verdict { padding: var(--s-5); border-bottom: 1px solid var(--line-soft);
                border-top: 3px solid var(--fg-3); }   /* top bar, not left */
.rail-verdict.self { border-top-color: var(--good); }
.rail-verdict.api  { border-top-color: var(--accent); }
.rail-verdict.warn { border-top-color: var(--warn); }
.rail-headline {                                        /* was 17px */
  font-size: var(--t-headline-size); font-weight: var(--t-headline-weight);
  line-height: 1.2; letter-spacing: var(--t-headline-ls);
}
.rail-line-label { font: var(--t-i-label-weight) var(--t-i-label-size)/1.35 var(--font-sans);
                   color: var(--fg-2); }
.rail-line-value { font: var(--t-i-value-weight) var(--t-i-value-size)/1.3 var(--font-mono);
                   font-variant-numeric: tabular-nums slashed-zero; color: var(--fg-1); }
.rail-bottom { background: var(--surface-inverse); color: var(--fg-inverse); padding: var(--s-4) var(--s-5); }
.rail-bottom-value { font: 600 var(--t-data-m-size)/1.1 var(--font-mono);
                     letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
```

Hairlines only between `RailGroup`s, not between `LineItem`s. That alone removes ~14 rules from the rail and makes it readable.

### 7.4 Progressive disclosure — the depth law

> **A fact that changes a decision is never more than one click away, and the three best facts on the page are never behind a click at all.**

**Promoted out of disclosures into real page sections:**

| Was | Becomes |
|---|---|
| `<Disclosure id="data-residency">` → `Sovereign` → `DataControl` → 5 rungs *(4 levels)* | **§19 Residency** — a full narrative section. Headline "If your data cannot leave." Deck = the ex-`.thesis-second` paragraph. Then the five rungs as a full-width priced ladder: each rung a row with `name + kind chip (CONTRACT / PHYSICS)` left, the `gives` prose centre, and `<Figure size="s">` for cost right. The ZDR rung gets `--good-weak` tint; the own-hardware rung gets `--critical-weak` and its cost figure at `size="m"`. |
| Funding disclosure + the author's self-correction, buried in `Paper`/`Sources` | **§20 Method notes** — two cards, `grid-template-columns: repeat(auto-fit, minmax(340px,1fr))`. Card A `WHO PAYS FOR THIS`. Card B `WHAT WE GOT WRONG` — gets the full evidence treatment: `<Figure size="l" value="0.98×" unit="per year" tone="warn" />` plus the plain sentence, because a public self-correction is the strongest credibility artefact on the site and it is currently invisible. |
| `<Disclosure id="provenance">` → `Sources` | **§21 Provenance** — a section with a data-layer table. One permitted second level: each row expands to its limitations. |

**Remain as disclosures** (genuinely optional depth, one level only): `Advanced assumptions` (HardwareDB), `Every model in the catalogue`, `And on CPU?` (in §03).

Disclosure restyle — no card, a hairline row:

```css
.disc { border: 0; border-top: 1px solid var(--line-soft); background: none; border-radius: 0; }
.disc-head { padding: var(--s-4) 0; gap: var(--s-4); }
.disc-title { font: var(--t-i-title-weight) var(--t-i-title-size)/1.3 var(--font-sans); }
.disc-note  { font: var(--t-caption-weight) var(--t-caption-size)/var(--t-caption-lh) var(--font-sans);
              color: var(--fg-3); }
.disc-body-wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 260ms ease; }
.disc.open .disc-body-wrap { grid-template-rows: 1fr; }
.disc-body { overflow: hidden; }
.disc-chev { transition: transform 200ms ease; }
.disc.open .disc-chev { transform: rotate(45deg); }
```

Also drop the `badge="was Hardware & TCO"` labels — they describe the app's history, not the user's need.

### 7.5 Jargon — the `<Term>` primitive

```jsx
// client/src/ui/Term.jsx + client/src/glossary.js
<Term id="duty-cycle">duty cycle</Term>
```

```css
.term { border-bottom: 1px dotted var(--fg-3); cursor: help; text-decoration: none; }
.term-pop {
  position: absolute; z-index: 60; width: 260px;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-2); box-shadow: var(--e-3); padding: var(--s-4);
  font: var(--t-caption-weight) var(--t-caption-size)/var(--t-caption-lh) var(--font-sans);
  color: var(--fg-2);
}
```
Opens on `hover`, `focus`, and `click` (touch). Dismisses on `Escape` and outside-click. `aria-describedby` wired to the popover id.

**Terms to define** (all currently unexplained): `neocloud`, `duty cycle`, `tok/s`, `fp16 / fp8 / int4`, `KV cache`, `TPT (tensor parallel tax)`, `MoE`, `PUE`, `colo`, `continuous batching`, `prefill / decode`, `ZDR`, `break-even duty`, `capex / amortisation`.

**And the rule that matters more than the popover:** every term is *also* glossed in plain words at its first appearance in prose. `neocloud` is glossed in the hero deck. `duty cycle` is glossed in the Workload section note. The popover is a reminder, never the only definition.

---

## 8. Motion

Short list. Everything else is static.

| # | What | Trigger | Change | Duration / easing |
|---|---|---|---|---|
| 1 | Receipt stops | mount, once | `opacity 0→1`, `translateY 10px→0`, stagger 60ms | 520ms `cubic-bezier(.22,1,.36,1)` |
| 2 | Section reveal | `IntersectionObserver` threshold 0.15, once then `unobserve` | `opacity 0→1`, `translateY 16px→0`; grouped children stagger 60ms via `transition-delay: calc(var(--i) * 60ms)` | 640ms `cubic-bezier(.22,1,.36,1)` |
| 3 | Meter marks | current block changes | `background-color`, `box-shadow` | 240ms `ease-out` |
| 4 | Meter dock in/out | `#chain` enters/leaves | `opacity`, `translateY(-8px)` | 240ms `ease-out` |
| 5 | Counter mark 01 lights | `#chain` counter enters, 300ms delay, once | `--g-200 → --accent`, plus a one-shot ring `box-shadow 0 → 0 0 0 8px var(--accent-weak) → 0 0 0 4px` | 420ms fill / 600ms ring, `ease-out` |
| 6 | Live value change | any input change | changed value flashes `color: var(--accent)` then returns | 260ms `ease-out`, no layout animation (tabular figures prevent jitter) |
| 7 | Disclosure | click | `grid-template-rows: 0fr → 1fr`; chevron `rotate(45deg)` | 260ms / 200ms `ease` |
| 8 | Interactive rows, cards, chips | hover/focus | `border-color`, `background-color` only | 120ms `linear` |
| 9 | Down-CTA chevron | hover | `translateY(0 → 3px)` | 180ms `ease-out` |
| 10 | Mobile rail dock → sheet | tap / swipe-up | `translateY`, `max-height` | 300ms `cubic-bezier(.32,.72,0,1)` |

**Forbidden:** parallax, scroll-jacking, pinned heroes, continuous scroll-linked transforms, number count-ups, any `scale()` on hover, anything that moves while the user is reading.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```
Plus, in JS: when `matchMedia('(prefers-reduced-motion: reduce)').matches`, the reveal observer sets `.in` immediately on mount for all sections, and the counter's mark 01 renders lit from the first frame. The meter still tracks state — it is information, not decoration.

---

## 9. Responsive

Breakpoints: **1280 / 1080 / 900 / 600**. Use `100svh` everywhere; never `100vh`. All anchor targets carry `scroll-margin-top: calc(var(--bar-h) + var(--s-4))`. Touch targets ≥ 44px.

### ≥ 1080px
Full layout. Workspace `minmax(0,1fr) 380px`. Block grid `72px minmax(0,1fr) 400px`.

### 900–1079px
- Workspace collapses to one column. **The rail becomes a sticky top summary bar**, not the current static reordered block:
  ```css
  .ws-rail { position: sticky; top: var(--bar-h); z-index: 30; order: -1; }
  .ws-rail-inner { max-height: none; }
  .ws-rail[data-collapsed] .rail-scroll { display: none; }
  ```
  Collapsed height 64px, showing `VERDICT WORD · $X/mo · $Y/1M` on one line plus a `Details` toggle. Expanded: `max-height: 60svh; overflow-y: auto`.
- Block grid → `minmax(0,1fr)`. The index moves from the sticky rail to an inline chip above the name. The evidence panel drops below the text column, full width, `position: static`.
- Narrative `padding-block: var(--s-8)`.

### 600–899px
- Receipt stops go 2-up then 1; the hairline arrows rotate 90° (`.receipt-arrow { transform: rotate(90deg) }`, height/width swapped).
- `.tenmark i { aspect-ratio: 1 / 2.6; }`, gap 5px — taller and thinner so ten still fit.
- Display-1 clamps toward 44px; `.block { min-height: auto; }`.
- Method-notes and findings grids go 1-up.

### < 600px
- **Hero receipt becomes a vertical ledger.** Three rows, each `figure | label` on one line: figure right-aligned mono `--t-data-l`, label left `--t-caption` `--fg-3`, `1px solid var(--line-soft)` between rows, a small `↓` in the left gutter replacing the chevron. Total height ≈ 230px, so eyebrow (16) + H1 at 40px × 3 lines (132) + 32 + receipt (230) = 410px sits comfortably above the fold on a 667px screen.
- **The rail becomes a bottom dock.**
  ```css
  .rail-dock {
    position: fixed; inset: auto 0 0 0; z-index: 50;
    height: 64px; padding: 0 var(--s-4) env(safe-area-inset-bottom);
    background: var(--surface); border-top: 1px solid var(--line); box-shadow: var(--e-3);
    display: flex; align-items: center; justify-content: space-between;
  }
  .rail-dock[data-open] {
    height: auto; max-height: 82svh; overflow-y: auto;
    border-radius: var(--r-4) var(--r-4) 0 0;
  }
  ```
  Left: verdict word in `--t-i-title`. Right: winning `$X/mo` in mono `--t-data-m`. A 36×4px grab handle centred at the top. Tap or swipe-up expands to the full rail as a sheet with a `rgba(11,13,20,.4)` backdrop.
  **The dock is mounted only while `#workspace` intersects the viewport** — it must never cover the narrative sections. While mounted, `body` gets `padding-bottom: 72px`.
- **The chain meter moves to the bottom**, full-bleed, 36px tall, square corners, `border-top: 1px solid var(--line)`, no backdrop blur (cheap on mobile). It and the rail dock are never on screen simultaneously by construction.
- Block sections: `padding-block: var(--s-7)`, `min-height: auto`.
- App bar: brand + `Estimate` + an overflow `⋯` menu holding Paper, theme and credit. The price stamp moves out of the bar and into the hero eyebrow line, where it belongs anyway.
- Workspace field grid → `1fr`.

---

## 10. Implementation notes

### 10.1 New CSS file layout

`shell.css` (779 lines) and `styles.css` (395 lines) split into five files, imported in this order from `main.jsx`:

| File | Contents |
|---|---|
| `tokens.css` **(new)** | `@font-face`, all custom properties, light + dark, `color-scheme` |
| `base.css` **(new, from `styles.css`)** | reset, `html/body`, link, focus, `.mono`, `.section`, container utilities, reduced-motion block |
| `narrative.css` **(new)** | hero + receipt, demo trap, hand-off, counter/artefact/tenmark, chain meter, block sections, close, findings, residency, method notes |
| `workspace.css` **(from `shell.css`)** | app bar, `.ws-*`, `.rail-*`, `.disc`, `.inum/.isel`, rail dock, decomposition, TPT, charts |
| `document.css` **(from `shell.css` + `styles.css`)** | `.pp-*` paper styles, catalogue/hardware tables, legacy `.panel` for views not yet migrated |

### 10.2 New components

| File | Export | Used by |
|---|---|---|
| `client/src/ui/Figure.jsx` | `<Figure>` | receipt, demo split, evidence panels, answer cards, residency ladder, method notes |
| `client/src/ui/TenMark.jsx` | `<TenMark size lit passed current labels />` | counter artefact, chain meter, hand-off seed, close |
| `client/src/ui/Term.jsx` | `<Term id>` | everywhere prose has jargon |
| `client/src/glossary.js` | `GLOSSARY` map | `Term` |
| `client/src/blocks.js` | `BLOCKS` (moved out of `Chain.jsx`, + `skip`, `owner`, `cadence`, `magnitude`) | `Chain` |
| `client/src/useInView.js` | `useInView`, `useActiveSection` | reveal motion, chain meter, rail dock gating |
| `client/src/ui/RailDock.jsx` | `<RailDock>` | `<600px` workspace |

### 10.3 Staged delivery

Each stage is independently shippable.

**Stage 0 — Foundations** *(no structural change; the whole app changes appearance)*
1. Add `client/public/fonts/InterVariable.woff2`, `GeistMono-Variable.woff2`.
2. Create `tokens.css` with §2 verbatim; import first in `main.jsx`.
3. In `styles.css`, replace the `:root` block with **aliases onto the new tokens**:
   ```css
   :root { --bg: var(--bg); --panel: var(--surface); --panel2: var(--surface-2);
           --line: var(--line); --line-soft: var(--line-soft);
           --text: var(--fg-1); --muted: var(--fg-2); --muted2: var(--fg-3);
           --accent: var(--accent); --good: var(--good); --warn: var(--warn); --bad: var(--critical); }
   ```
   (Rename the legacy names to `--legacy-*` to avoid self-reference, then sweep the two CSS files with a find-and-replace.) Every existing component adopts the new palette, the new fonts and dark mode with **zero JSX edits**.
4. Add the `data-theme` boot script in `index.html` + a toggle button in `.app-bar-right`.
5. Sweep: add `font-family: var(--font-mono)` to `.ws-value`, `.rail-line-value`, `.ans-value`, `.dec-big-value`, `.tr-item b`, `.cb-ev b`, `.myth-card-val`, `.fcard-fig b`, `.tie-val`, `.tpt-val`, `.cval`, `.statval`, `input[type=number]`.

**Stage 1 — Hero + receipt** — `Thesis.jsx`, `narrative.css`
Delete `.thesis-body` and `.thesis-second`. Build `<Figure>`. Build the receipt per §4. Add `<Term>` + glossary with `neocloud` glossed inline. Ship.

**Stage 2 — The ten blocks** *(the centrepiece; the largest stage)* — `blocks.js`, `Chain.jsx`, `ui/TenMark.jsx`, `App.jsx`
Move `BLOCKS` out; write the ten `skip` sentences and thirty budget-line chips. Build `<TenMark>`, the artefact, the meter, the block sections, the close. Remove `chain` from `REFERENCE` in `App.jsx` and render `<Chain>` inline in the `decide` view between the hero and the workspace; keep `view === 'chain'` as a redirect to `#chain`. Delete `.cblock*` and `.chain-intro` from CSS.

**Stage 3 — Demo trap** — `DemoMyth.jsx`
Split into `<DemoSplit>` + `<Bandwidth>` + `<ChainSeed>`; fold the CPU prose into one disclosure; restyle the bandwidth bars.

**Stage 4 — Workspace** — `ui/Workspace.jsx`, `workspace.css`, `Answer.jsx`, `ui/RailDock.jsx`
One-card config; rail top-bar accent; verdict at headline size; the `110× H100` promotion; the 900px sticky summary bar; the <600px dock.

**Stage 5 — Disclosure surgery** — `Decide.jsx`, `Sovereign.jsx`, `Sources.jsx`, `Findings.jsx`
Promote residency, method notes and provenance to sections. Keep only two disclosures. Restyle `Findings` with `<Figure>`. Compress `Caveats` in `App.jsx` to three bullets.

**Stage 6 — Motion & polish** — `useInView.js`, `narrative.css`
Reveal classes, meter transitions, the reduced-motion JS branch, the optional canvas PNG export for the artefact.

### 10.4 Copy still required (not design work, but blocking Stage 2)

- 10 × **`skip`** sentences (slot ⑥) — ≤22 words, present tense, business consequence, no jargon.
- 10 × **`owner` / `cadence` / `magnitude`** chip triples (slot ⑧).
- 14 × glossary definitions — one plain sentence each, ≤20 words.
- 1 × revised hero deck (≤22 words, contains the inline `neocloud` gloss).
- 1 × `Copy as text` string for the artefact.

### 10.5 Acceptance checks

- [ ] The receipt is fully visible above the fold at 1280×800 and 390×844, with no jargon term appearing before it that is not glossed in the same viewport.
- [ ] "neocloud" is defined in plain words on its first appearance.
- [ ] No decision-bearing number is set below 24px.
- [ ] The ten-block sequence is reachable by scrolling from the hero with no click.
- [ ] The "1 of 10" artefact reads correctly at 200px wide, in both themes.
- [ ] Nothing valuable is more than one click deep; residency, funding and the self-correction are all zero clicks.
- [ ] All text passes 4.5:1 in both themes (spot-check `--fg-3` on `--bg`, `--accent` on `--surface`, `--fg-inverse` on `--surface-inverse`).
- [ ] `prefers-reduced-motion: reduce` renders the page complete and static, with the meter still functional.
- [ ] Every page section pays its own `padding-block`; no narrative section uses `margin-block`.
- [ ] No section is separated from another by a shadow.
