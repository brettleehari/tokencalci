# Consolidated review actions

Four independent reviews, run against the live app, the source, and the paper:
a CTO buyer, a methodological reviewer, an open-weights lab, and the general
LinkedIn audience. This is the merged list. Every item marked **[verified]** was
confirmed by direct inspection or by re-running the numbers, not taken on the
reviewer's word.

`Nx` = how many of the four raised it independently. Convergence is the ranking
signal: two reviewers hitting the same line from different motives is a stronger
buy than one reviewer shouting.

---

## P0 — ship blockers. Do not post a launch link until these are done.

Each is minutes of work and each is the kind of defect that ends a first visit.

**1. Three dead CTAs blank the page.** `[verified] 2x — CTO, LinkedIn`
`Decide.jsx:286,330,331` call `onNavigate('sovereign' | 'hardware' | 'sources')`.
`App.jsx:75-77` renders only `decide | chain | paper`. Clicking any of the three
unmounts the main pane. One of them — *"See all five rungs, priced →"* — is the
compliance path, which is the first thing the buyer persona clicks. The target
content still exists as `<Disclosure>` blocks further down the same page, so the
fix is scroll-to-anchor, not a route.

**2. `breakEvenTokensPerDay` is emitted unguarded next to "never".** `[verified] 2x — CTO, academic`
`hwcalc.js:237` holds `selfHostMonthly` fixed while scaling volume, i.e. assumes
a fixed fleet serves unlimited tokens. Live `/api/decide` returns
`breakEvenTokensPerDay: 15,457,160,880` beside `breakEvenDuty: null` (never) on a
workload of 500M tokens/day. `breakEvenDuty` is already nulled when > 1
(`api.js:115`); apply the identical guard to the tokens/day figure, or clamp it
to fleet capacity. **`SKILL.md:60` ships the contradiction as its public example.**
This one is dangerous precisely because it looks fine — it flows into "Copy
summary" and the downloadable JSON, i.e. straight into a CFO's inbox.

**3. Copy points at a Sources tab that no longer exists.** `[verified] 1x — CTO`
`App.jsx:130` and `DataControl.jsx:143`. Retire the references or restore the
destination.

**4. A stated fact contradicted by the number directly under it.** `[verified] 1x — CTO`
`Decide.jsx:325`: *"The real self-host cost is not the GPU. Personnel and idle
dominate; the rental is the small part."* At the page's own defaults personnel is
~2% and compute ~72%. (`Sovereign.jsx:150` says the same thing and is defensible
there, because that preset's staffing is 16.7× higher.) Either fix the sentence
or fix the constant that makes it false — see P1.1.

---

## P1 — numbers that are wrong, or right for undisclosed reasons.

These change what the tool says. Several change what the *paper* says.

**1. fp16 is hardcoded on the decision page, and it is doing all the work.** `[verified] 1x — lab. Highest-impact item on the list.`
`Decide.jsx:60` — `const PRECISION = 'fp16'`. A module constant, no control.
Every headline number descends from it. Same engine, same workload, via the
public API:

| model | fp16 (shipped default) | int4 |
|---|---|---|
| deepseek-v3 | 132 GPUs · $12.49/1M · **31.2x** | 12 GPUs · $1.34/1M · **3.4x** |
| gpt-oss-120b | 20 GPUs · $2.09/1M · **8.7x** | 2 GPUs · $0.42/1M · **1.8x** |
| qwen3-next-80b | 15 GPUs · $1.62/1M · **4.0x** | 2 GPUs · $0.42/1M · **1.0x** |

The models are scored at a precision they were not shipped in. DeepSeek V3 was
released FP8; gpt-oss ships MXFP4 and was designed to fit one 80GB card; Llama 4
Scout was marketed on single-H100 int4; Gemma ships QAT checkpoints. The pattern
inverts intent: **every model deliberately engineered to fit one card is scored
at the one precision that guarantees it will not.**

Fix: add `nativePrecision` to `hwdata.js`, default `Decide` to it, expose a
selector, and label fp16 honestly as a reference precision almost nobody serves.

The thesis survives — 1.8x–3.4x still proves open weights are not open inference.
It survives at a number a lab cannot dismiss and a comms team cannot weaponise.

**2. The flat-price headline is an artifact of the index formula.** `[verified] 1x — academic. Changes a published number.`
`history.js:56` uses an unweighted arithmetic mean of price relatives — the Carli
index, which has documented upward bias and fails time reversal. On the identical
committed data:

```
Carli (as shipped)   0.976x/yr    "essentially flat"
Jevons / geometric   0.840x/yr    ~16%/yr decline
Median relative      1.000x/yr
```

The distribution is the shape that maximises Carli bias: two models fell 8-11x
(floored at 0 in an arithmetic mean), two doubled (unbounded above). The paper
never names the formula. Publish the index choice and report Jevons alongside.
The *qualitative* point — nothing like 10x/yr for a model you commit to —
survives every estimator. "Essentially flat" survives only Carli.

**3. The basket is not fixed in its sampling frame.** `[verified] 1x — academic`
`resolvePrice` takes a median over whoever serves the model *on that date*.
Provider observations inside the "fixed" basket went **46 → 141**
(`deepseek-v3` 3→39, `llama-70b` 2→13, `mistral-small-3` 2→8). A median over 3
providers and a median over 39 are different statistics, and `deepseek-v3`
"doubling" — one of the two largest upward contributors — is substantially a
change in who is in the sample. Restrict to the provider intersection, or report
provider fixed effects, and disclose the drift.

**4. Staffing differs by 16.7x between two panels of the same tool.** `[verified] 3x — CTO, LinkedIn, academic`
`Decide.jsx:58` `personnelMonthly: 3000` (flat, whether the fleet is 4 GPUs or
132) vs `Sovereign.jsx:12` `50000`. The paper says an inference engineer costs
more per year than the hardware under them; the front page prices that person at
~2% of the bill. The CFO's first question kills this. Also: the sovereign figure
sources to two recruiting firms' marketing pages — replace with a source that
isn't selling the answer, or report a range. Consider scaling with fleet size.

**5. Two live, contradictory quantisation multiplier sets.** `[verified] 2x — academic, lab`
`hwdata.js:302-304` `PRECISIONS[].tputMul = {fp16:1.0, fp8:1.3, int4:1.6}` vs
`throughput.js:97` `PRECISION_SPEEDUP = {fp16:1.0, fp8:2.0, int4:3.0}`. ~1.9x
apart. Also dead: `GPUS[].tputMul`, `baseAggTokPerSec()` (`hwdata.js:312-318`).
Tree-shaken out of `dist/`, so hygiene rather than a live bug — but §8 of the
paper tells reviewers to read these files.

**6. Your own provenance grading contradicts your own paper.** `[verified] 2x — academic, lab`
`README.md:65` still grades throughput **"not measured"**; `hwdata.js:7-8` still
says "NOT measured benchmarks"; `Decide.jsx:32,47` exports "Throughput is
heuristic, not measured" into every copied summary and downloaded JSON — months
after you re-derived it against benchmarks and `/api/sources` graded it
`published`. For a project whose distinguishing feature is confidence grading,
this is the bug that gets quoted back at you.

**7. The marquee findings are string literals.** `[verified] 2x — CTO, academic`
`Findings.jsx:40-43` hardcodes `'22%'`, `'37 models'`, `'8 differ'`, `'5.7x'`
under a heading reading **"What we measured"**. The live cross-check reproduces
(8/37 = 21.6%, worst `mistral-nemo` 5.7143x) — so it is correct *by coincidence*,
and the OpenRouter snapshot refreshes weekly while the card does not. Compute it
at runtime. Gate on n ≥ 3 per side: 5 of the 8 disagreements have n ≤ 2 on one
side (`gemma4-31b` is n=1 vs n=18), which is a sampling artifact, not feed
disagreement — and `openrouter.js:243-244` already says so in a comment.

**8. `asOf` is the fetch date, not the price vintage.** `1x — academic`
`prices.js:60` stamps `new Date()`. A Command R+ price unchanged since 2024
displays as today's date. This defeats the paper's own stated requirement that no
price appears without its as-of date. Carry the price file's commit date; ideally
track last-change per key so stale rows can be badged.

**9. Check the MiniMax licence flag before anything else.** `[verified] 1x — lab. Only item with legal texture.`
`hwdata.js:93` marks `minimax-m3` `commercial: false`. `SKILL.md` instructs agents
to warn users that self-hosting needs a paid licence on that flag. If it is wrong,
the API is telling machines a permissively-licensed model needs a licence.

---

## P2 — the argument is right and lands wrong.

**1. The default is the pathological case.** `[verified] 2x — CTO, LinkedIn`
Landing state is DeepSeek V3.2 — 671B MoE, 132 GPUs, the one model the paper
flags as a known blind spot (over-predicted ~5x), at a precision it does not ship
in, producing the tool's most extreme number as its first impression. At defaults
**no catalogue model wins**, including Qwen3 30B-A3B which the README names as a
win at 0.5x. Your actual finding — *VRAM fit decides it* — is invisible when
every row says neocloud.

Fix: a two-row strip under the receipt. *"Fits on one card: you win. Needs 22
cards: you lose 26x. Same argument, opposite answer."* Right now the reader has
to reproduce your best finding by hand.

**2. "1.6-1.8x or 26x?" reads as a caught inconsistency.** `2x — academic, LinkedIn`
They are different quantities (bare compute vs full TCO at 40% duty on the
worst-fitting model) and the site never says so side by side. The reconciliation
exists in `Decomposition.jsx` but is labelled by cost term, not as *"this is where
the paper's number becomes this page's number."* One sentence next to the receipt
fixes it. Without it, honest disambiguation looks like getting caught.

**3. The funding disclosure is on tab three.** `2x — LinkedIn, CTO`
The paper's disclosure paragraph is one of the best in this category and ~4% of
visitors will see it. The landing footer says "not financial advice", which reads
evasive rather than careful. The tool's conclusion is "rent, don't own"; the
people who benefit are neoclouds; a sceptic assumes affiliation because assuming
is free.

**The self-correction is the answer and it is buried.** "I published 4-6x. I
measured it properly. It was 1.6-1.8x. The number moved *against* my own
argument." Nobody funds a study that shrinks its own headline by 2.4x. Put both
on the landing page.

**4. "neocloud" is never defined.** `1x — LinkedIn`
It is in the h1 area, the nav, the verdict, and every card label. Single biggest
vocabulary problem. Also undefined where first used: duty cycle, tok/s, batch
size, fp16/fp8/fp4, KV cache, TPT, MoE active-vs-total, PUE, colo. The Chain tab
defines several beautifully — one tab away from where the words first appear.

**5. The receipt should be above the prose.** `1x — LinkedIn`
`Free → $0.404 → $10.45` is the screenshot that travels. It currently sits below
two dense paragraphs containing four pieces of jargon before the first number.
Also: render it as a 1200×627 image for the post — the post image gets reshared,
not the site.

**6. "1 of 10 blocks is open" should be on the landing page.** `1x — LinkedIn`
It is a better argument than the price receipt because it is the thesis rather
than a symptom, and it prevents the "so open models are useless" misreading. Ten
dots, one lit.

**7. Report a range, not a point estimate.** `2x — CTO, academic`
You know the provider spread is 21x, staffing moves everything, spot ≠ enterprise,
and throughput swings 100x with batch. You report each as a *caveat under a
confident number* — which is backwards: a caveat is what a CFO uses to destroy
the headline, a range *is* the headline and survives him. Your own paper says
"when two feeds differ by 5x, the honest output is 'this price is uncertain', not
a confident point estimate." Apply it to your own output.

**8. Disclose the supply asymmetry.** `2x — CTO, academic`
Self-host is priced on the Vast.ai community/spot median ($2.139/hr, spread
$1.336-$4.996); the API side is 24 commercial providers. Spot hobbyist supply vs
contracted commercial supply. No regulated buyer can purchase the former. This
**flatters self-hosting**, so the gaps are lower bounds — worth saying plainly,
and it costs the argument nothing.

---

## P3 — real work. Needs money, time, or a decision.

**1. Spend the $5 on H100 time.** `2x — academic, lab. The load-bearing gap.`
The claim "TP buys capacity, not speed" is not inferred from data — it is
hardcoded as the functional form (`throughput.js:117,147`) and reported as a
finding. The four anchors are `(activeB, gpus)` = (3,1), (31,1), (24,2), (70,8):
**model size and GPU count are confounded by construction**, r(log active, log
gpus) = 0.70 on n=4. A flat active-parameter term plus a TP penalty fits the same
points equally well. The lab reviewer normalised by work done and got the opposite
sign.

The settling experiment is small: **one model at TP 1/2/4/8, identical hardware
and batch**, plus batch ∈ {1,8,32,64,128,256} at ≥2 context lengths. Report NVLink
vs PCIe topology — that is *the* variable in a claim about collective communication
cost and it appears nowhere. Until it exists, `README.md:16` should not say
"measured", and the abstract should not say "then I measured it properly."

Also: 4 of the 9 "validated" points are training points with zero residual freedom,
so 44% of the reported 1.054x geometric-mean error is structurally 1.000. On
genuinely held-out points it is n=2. Declare the held-out set before fitting,
report per-point residuals and the A100 miss (1.378x), and publish the fitting
script — the constants exist as literals with no code that derives them.

**2. Put KV cache into TPT, or restrict its stated domain.** `2x — academic, lab`
`TPT = ceil(params × bytes × 1.3 / VRAM)`. The `1.3` is flat — no term for context
length, batch, or concurrency; `ctx` (4K to 10M in the catalogue) is never read by
the VRAM path. For Llama 70B the required headroom is 1.61x at your own benchmark
config (1K × 256) and ~80x at the 128K context you advertise. **The named
contribution is wrong at its own anchor configuration.**

Consequence for the Gemma example: 31B × 2 bytes = 62GB on an 80GB card. The
"one gigabyte doubles the bill" story comes entirely from multiplying by 1.3 to
get 80.6. In practice vLLM loads 62GB and pages the remaining ~18GB as KV cache.
Your most-quoted anecdote may be an artifact of an unsourced constant — check this
before it is quoted back at you.

The flat 1.3 also means the tool **cannot represent any KV-efficiency innovation**:
MLA cuts KV ~10x, GQA ~8x vs MHA, and hybrid/Mamba designs exist specifically to
attack your block three. The architectures that solved the problem you are
describing get no credit for solving it.

**3. Publish the price history as a dataset.** `2x — academic, lab. Highest leverage on the list.`
`price-history.json` + `backfill-history.js` on HuggingFace. Both reviewers called
it the genuine contribution and neither had seen it done. Datasets get cited;
calculators get screenshotted. 72KB of work you have already finished. Fix the
index first (P1.2) — it is a fixable analysis error on top of sound collection,
which is the good kind of error.

**4. Commit a frozen reproduction scenario.** `1x — academic`
The paper's §4 table (0.5/0.5/1.6/1.8/7.2) **does not reproduce under any
published configuration** — no recorded rent basis, precision, mode, duty,
outputShare, and the self-host side depends on a live Vast feed that moves daily.
At fp16 the shipped code says you *win* on Llama 3.3 70B (0.98x), the paper's own
central example of losing. Add `npm run reproduce:paper` with the Vast snapshot
pinned by date and hash. Also: `server/snapshot.json` is a 12-key stub from
2025-06-01, so an offline `git clone && npm start` yields 60% feed disagreement,
not 22%.

**5. Reframe the sovereign multiple as sensitivity, not measurement.** `1x — academic`
`shareOfGap` at the Sovereign defaults: idle **73-80%**, ops 12-25%, compute ~0%
or negative. The multiple is a near-pure function of `dutyPct: 30` (a 3.33x
divisor) and `personnelMonthly: 50000`. The throughput work this paper is *about*
is nearly irrelevant to the number. "No single lever closes it" is then guaranteed
by arithmetic, not discovered. Publish the shareOfGap table and say so — it is
still a useful result, just not an empirical one. The stated "25-37x" is also an
unstated slice of a 21-66x range.

**6. Model what only self-hosting can do.** `2x — CTO, lab`
The discount ledger is one-sided: the API side gets prompt caching and batch
discounts; the self-host side gets neither prefix caching (a vLLM flag, and your
hit rate is not diluted across tenants), nor offline batch work (which is what
takes duty toward 100% — your single largest gap term), nor speculative decoding.
The buy side is modelled at best-case negotiated economics, the build side at
naive configuration.

Bigger: **multi-LoRA serving does not exist on a per-token API at any price**, and
it is the most common reason serious teams self-host — the fixed cost amortises
across fifty fine-tuned variants. `TieLine.jsx` gestures at this and only divides
the personnel line. Fine-tuning has no cost or value term anywhere in the model.

**7. Missing inputs the buyer cannot express.** `1x — CTO`
Enterprise/committed-use discounts; hardware already owned (greenfield capex is
assumed); latency SLOs (no p95, no TTFT — every throughput figure assumes the
throughput-optimised config that blows a latency SLA); fine-tuning; multi-region
DR beyond a 2x HA factor; compliance cost itself (SOC2 scope, pen-test, MRM
sign-off — a real six-figure line that lands entirely on the self-host side);
regional cost basis (one global salary, $0.12/kWh).

**8. Shareable URL state.** `1x — CTO, and your own roadmap`
No URL state exists. A buyer who builds an estimate cannot send it to their CFO
without a screenshot. For a tool whose entire theory of distribution is being
passed around, this is the difference between a bookmark and a citation.

**9. Country of origin is in the data and not in the verdict.** `1x — CTO`
`hwdata.js` carries `country`; the default recommendation is a CN-origin model
with a Jul 2024 cutoff and neither fact surfaces in the verdict path. For a
regulated buyer that ends the conversation — not because the answer is wrong, but
because the tool did not mention it.

**10. Catalogue hygiene.** `1x — lab`
No `nativePrecision` field, no KV-architecture field — the two omissions behind
most of P1.1. `deepseek-v3` is labelled V3.2 but parameterised as V3, and V3.2's
headline change is sparse attention, which the tool has no term for.
`llama4-scout` carries `ctx: 10000` (10M) at face value while nothing adjusts KV
for context. `olmo2-13b` — the most genuinely open model in the catalogue — is
the worst-presented (`ctx: 4`, unmatched in the feed, quality 2). Missing as a
*class*: hybrid-attention/Mamba models (Nemotron-H, Falcon-H1, Granite 4, Jamba)
whose entire pitch is the KV economics you spend a Chain block on. Several 2024
entries sit at quality 1-2 dragging the visible average down.

---

## What all four agreed is worth defending

Worth recording, because the list above is long and the work underneath it is good.

- **The thesis.** All four independently called "open weights are not open
  inference" correct, useful, and under-said. The lab reviewer's words: *"someone
  finally priced our missing decade."*
- **The demo myth-buster.** The lab would link to it today, unchanged, and called
  it the best artifact for the conversation it has constantly. Grounding it in
  memory bandwidth rather than vibes is what makes it survive an argument.
- **The price-history series.** Both technical reviewers called it a genuine
  contribution neither had seen. Publish it.
- **Fixed-basket vs cheapest-available.** The academic called it the paper's best
  idea — it survives the index problem and has a real decision consequence.
- **Disagreement-as-information.** Reporting cross-feed divergence rather than
  smoothing it away is methodologically correct and unique in this category.
- **The ZDR ladder.** The CTO called it the most valuable thing on the site and
  it is four levels deep behind a dead button.
- **The self-correction.** Every reviewer flagged it unprompted as the single
  strongest credibility asset in the product. It is in a PS at the bottom of tab
  three.

The recurring shape of the criticism: *the research is better than the calculator
wrapped around it, and the best evidence is the hardest to find.*

---
---

# Round two — consolidated

Same four reviewers, re-run against the fixed build. Their shared verdict: *the
calculator got fixed, the artefacts did not.* Below, `[SHIPPED]` items were fixed
and verified in commit `f65e4f1`; everything else is open. `Nx` = independent
reviewers who raised it.

## SHIPPED this round

| Item | Raised by |
|---|---|
| Sovereign path recommended the forbidden option (label inverted, `Math.min` picked the API, export ignored `sovereign`) | CTO |
| Precision moved from a release-year guess to observed per-provider data | lab, LinkedIn, academic |
| Four artefact surfaces still hardcoding fp16 while the calculator beside them did not | lab, academic, LinkedIn |
| `paybackMonths` 97 months against 36-month amortisation | CTO |
| Stale "throughput is heuristic" on **every page**, in Sources, HardwareDB, and every API response | academic, CTO |
| `SKILL.md` documenting a precision default that stopped being true | academic, CTO |
| One quantity printed as 14× and 13.5× on one screen | CTO |
| Residency CTA opened its target and left the viewport 3,500px away | CTO |
| `downloadEstimate` using undestructured `precisionBasis`/`sovereign` | CTO |
| Export carried the precision but not its basis | CTO |
| `nativePrecisionFor(null)` returning a bare string | lab, academic, CTO |

## OPEN — the paper contradicts the tool  `3x — CTO, academic, lab`

The highest-convergence open cluster, and the reason the CTO **withdrew the paper**
from what he would forward.

- **"1.6–1.8×" is a floor presented as a cost.** It is `floor.multipleOfNeocloud` —
  bare compute at 100% utilisation, no people, no overhead, no idle. The tool's
  fully-loaded ratio for the same model is 3.7×. The abstract promotes a floor to a
  cost, which is the same category error the PS exists to correct.
- **§4's table does not regenerate.** No pinned LiteLLM snapshot, no recorded basis,
  precision, duty or mode; the self-host side moves daily with a live spot feed. The
  Llama row has flipped sign since publication.
- **§4 still prints fp16 figures** — `gpt-oss-120b · 305 GB · 4×` — which the tool now
  contradicts at 77 GB and 1–2×.
- `server/snapshot.json` is a 12-key stub from 2025-06-01, so an offline clone
  reproduces 60% feed disagreement, not 22%.

## OPEN — statistics that change published numbers  `1-2x — academic`

- **Carli index.** `history.js:56`. Jevons on identical data: **0.840×/yr**, not
  0.976×. Direction survives every estimator; "essentially flat" does not.
- **The median is over feed KEYS, not providers.** 31 of 49 models have more keys
  than distinct providers (`glm-5.2`: 6 keys, 1 provider). Alias-publishing providers
  are silently over-weighted, and `deepseek-v3`'s 3→39 key growth is the largest
  single upward contributor to the index.
- **Provider drift decides the result.** Basket members that gained ≥3× providers:
  geomean 0.404. Stable ones: 1.038. The series sorts on sampling, not price.
- **The two feeds are not independent.** `pricing.js:23` includes `'openrouter'` in
  `NEO_PROVIDERS`; 11 of 49 models have OpenRouter rows inside their LiteLLM median.
  The independence claim must be withdrawn or the rows excluded.
- **The 22% is still four string literals** with no computation behind them anywhere.

## OPEN — the throughput model  `2x — academic, lab`

- **TP confound.** Four anchors where GPU count and model size are perfectly
  collinear. A constant model scores 1.11 geomean against the fitted 1.02 — two free
  parameters buy 8 points on four points spanning 2800–3900.
- **The only same-model GPU-count row contradicts the finding and is excluded.**
  Llama 70B fp8 on **1 GPU at 460 tok/s** (`throughput.js:73`), mispredicted by
  **12.2×**, described as "a cross-check" and reported nowhere.
- **Held-out n = 2.** Five of nine "reproduced" points are algebraic identities.
- **The bandwidth exponent is one pair.** B200/H100. Pairwise exponents span
  0.699–1.396; A100 misses by 38% because it has no FP8 tensor cores — architecture,
  not bandwidth, and there is no term for it.
- **Two justifications are mutually exclusive.** `:126` says weight reads are *not*
  the bottleneck (to justify the shallow active-param exponent); `:93` says they
  *are* (to justify fp8 = 2.0×).
- **`overPredictsLargeMoE` and `basis` are computed and never consumed.** The tool
  calculates its own confidence and throws it away.
- **`TP_BUYS_CAPACITY_NOT_SPEED` is exported and imported by nothing.**

## OPEN — TPT omits the term that dominates it  `2x — academic, lab`

`vramNeed = ceil(params × bytes × 1.3)`. No context, batch, or concurrency term;
`model.ctx` (4K–10M in the catalogue) is read by nothing.

- Required headroom for Llama 70B at the tool's **own benchmark config** is 1.61×,
  not 1.30 — the named contribution is wrong at its own anchor.
- **The headroom scales with weight bytes, which is backwards.** gpt-oss-120b gets
  71 GB of KV headroom at fp16 and **19 GB at int4** — less cache the more you
  quantise, the inverse of why anyone quantises. Every "self-host wins after
  quantisation" verdict is computed on a fleet that cannot hold the concurrency it
  is credited with.
- It cannot represent MLA, GQA, sliding-window or hybrid attention at all — the
  architectures built to attack the block the Chain devotes a panel to.

## OPEN — what the model cannot see  `2x — CTO, lab`

- **The discount ledger is one-sided.** API gets prompt caching and batch discounts;
  self-host gets no prefix caching, no offline batch scheduling (the thing that
  takes duty toward 100%, the largest gap term), no speculative decoding.
- **Multi-LoRA does not exist in the codebase.** Zero hits for LoRA/adapter/
  fine-tuning. It does not exist on a per-token API at any price, and it is the most
  common real reason serious teams self-host.
- **Cost has collapsed into a function of VRAM footprint.** Because the active-param
  exponent is only −0.105, architecturally unrelated models converge on identical
  $/1M whenever they need the same card count.
- No latency SLO / p95 / TTFT anywhere. NVIDIA-only GPU set.

## OPEN — catalogue  `1-2x — lab`

`llama-405b` → fp16 by guess (Meta shipped official FP8 at launch); the three
Gemma 3 entries → fp8 where Google published QAT **int4**; `deepseek-v3` labelled
V3.2 but parameterised as V3; `llama4-scout` carries `ctx: 10000` that nothing
reads; `olmo2-13b` — the only fully-open model — is the shabbiest row. No
`kvArch` field. `NATIVE_PRECISION` has no `sources.js` layer, no as-of date, no
citations.

## OPEN — positioning and comprehension  `1-2x — LinkedIn, CTO`

- **Lead with the floor, not the multiple.** 7.2× is arguable and 76% of it is idle
  capacity — headlining it argues *against* the thesis. `$0.425 vs $0.264 with
  nobody paid and nothing idle` is unarguable and the smaller gap makes it stronger.
- **The independence line belongs on the landing page.** The funding disclosure and
  the self-correction are the strongest credibility assets in the product and both
  are on tab three. ~20 words converts the sceptic.
- **"neocloud" is still undefined** on the page that uses it 40+ times.
- **"Advanced assumptions" is a second calculator** — its own workload defaults
  (100K/min, 30% duty), printing a 45× a screen below the 7.2×.
- Findings card shows "3×" then "eight GPUs serve roughly what one does" — two
  numbers, no stated relationship. Uptime renders as `64.1607%`. Green means
  "winner" in one chart and "self-host" (the loser) in another.
- **No URL state.** Still the largest single barrier to being cited.
- The ZDR rung needs a dated per-provider evidence table — the jurisdiction data is
  already in `/api/openrouter` and never reaches the rung that argues residency.

## Design spec — delivered, not yet built

`docs/design-spec.md`. Ten blocks become the centrepiece as a scroll sequence;
"1 of 10 is open" specified as a 1200×630 OG card legible at 200px; receipt above
the prose; residency ladder, funding line and self-correction promoted to zero
clicks; a `<Term>` primitive with first-use glosses for 14 jargon terms; and a law
that no decision-bearing number renders below 24px. Stage 0 restyles the whole app
through token aliasing with no JSX edits.
