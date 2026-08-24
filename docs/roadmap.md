# opentoken — roadmap

*What it is:* the open inference economics project. A measured answer to what it
actually costs to serve open weights, and the data behind it.

*Where it stands:* live, three destinations, thesis-led, 14 confidence-graded data
layers — 4 measured, 3 derived, 6 published, 1 estimate.

---

## Phase 0 — Launch blockers

Things that will actively cost you if the first big audience arrives without them.

**0.1 Shareable estimates.** There is currently *no URL state at all*. Someone who
builds an estimate cannot send it to their CTO, paste it in a thread, or link it in
a comment. For a tool whose growth depends on being passed around, this is the
single largest miss on the list. Encode the workload and model in the query string;
every screenshot on Reddit becomes a link back.

**0.2 Survive a front page.** Render's free tier spins down after ~15 minutes idle
and takes 30–50 seconds to wake. An HN or r/LocalLLaMA spike hits a cold instance
and most visitors leave before it responds. Either move to a paid tier for launch
week or put a static prerender in front.

**0.3 Measured throughput.** The one claim a determined reader can dismiss, because
the anchors are third-party benchmarks we did not run. Two hours on a rented H100
costs roughly $5 at the live marketplace rate we already pull. It moves the layer
the whole thesis rests on from `published` to `measured` — the grade nothing in the
tool currently claims.

---

## Phase 1 — Credibility

Makes it citable rather than merely useful.

**1.1 Publish the price history as a dataset.** 72KB, 19 monthly points, 49 models,
recovered from git and not published anywhere else that we could find. On
HuggingFace Datasets with the rebuild script beside it, it becomes forkable and
citable. Datasets get cited; calculators do not.

**1.2 Accumulate, don't only excavate.** Today the series is rebuilt from LiteLLM's
git history each run, so it can never be richer than what that repository happens
to hold. Appending our own daily observation costs nothing and compounds: in a year
it is a first-party series nobody can reconstruct after the fact.

**1.3 Close the last `estimate`.** The capability tier is editorial, and it is the
input the model shortlist rests on. Either source it against a public benchmark, or
narrow the tool so nothing depends on it.

---

## Phase 2 — Distribution

Makes it spread without you in the room.

**2.1 A page per model.** Fifty-five models, fifty-five landing pages, each
answering "can I run this, and what does it cost" for one specific checkpoint.
This is how people arrive from search, and it costs one template.

**2.2 The reverse question.** Today the tool asks which model and tells you the
hardware. The question the community actually types is the opposite: *"I have two
3090s — what can I run?"* Same engine, inverted. Probably the highest-traffic
feature on this list.

**2.3 An embeddable figure.** A badge or small card someone can drop in a README or
a blog post showing live cost for a given model. Every embed is a live backlink.

---

## Phase 3 — The moat

Makes it durable, and makes it a project rather than a tool.

**3.1 Community-submitted benchmarks.** The weakest layer becomes the strongest
asset if other people fill it. A simple submission format — model, GPU, engine,
precision, batch size, tokens/sec — turns throughput into something that improves
while you sleep, and gives contributors a reason to return. Nobody else is
assembling this, and it compounds in exactly the way a hand-maintained table
does not.

**3.2 Import real usage.** Every workload number is currently typed in. Reading
actual traffic from LiteLLM, Helicone or Langfuse grounds the whole calculation in
observed demand instead of a guess. Still unbuilt by anyone in this space.

**3.3 Price-history as a public series.** Once 1.2 has run for a few months, the
decline rate stops being a finding and becomes a live indicator others reference.

---

## The strategic fork worth deciding early

The hardware catalogue is H100, A100, H200, B200 — datacentre silicon, aimed at a
team with a budget. The community most likely to adopt this runs **3090s, 4090s and
Mac Studios**.

Those are different products. Same engine, different catalogue, different defaults,
different question ("what can I run on what I own" rather than "should we buy a
cluster"). The paper and the thesis serve the enterprise decider; the adoption goal
points at the local operator.

Serving both is possible and is probably right — but it is a decision to make
deliberately, because it changes the default GPU, the default workload, and which
of Phase 2 matters most.

---

## Sequencing logic

Phase 0 before any launch — a shared link and a warm server are what convert
attention into use. Phase 1 before the paper is pushed hard, because a citable
dataset is what makes a working paper stick. Phase 2 once there is something worth
arriving at. Phase 3 is the only part that compounds, and it only works if Phase 2
brought people who want to contribute.
