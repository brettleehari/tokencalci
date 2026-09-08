# Can you serve it? The economics of running open-weight models yourself

*Talk abstract · Hariprasad Sudharshan · based on [From Free Weights to Reliable Tokens](from-free-weights-to-reliable-tokens.md) and the calculator at [tokencalci.onrender.com](https://tokencalci.onrender.com)*

---

Google published PageRank in 1998. The algorithm was the breakthrough, and it is what the company is remembered for.

It is not what made the company durable. Serving that algorithm to the world took years of largely invisible systems work — scheduling computation across enormous fleets, replacing machines as they failed, keeping utilisation high enough that the economics worked at all. That work produced Borg. Borg's lineage produced Kubernetes, which is now the substrate much of the industry runs on.

**The algorithm was the IP. The serving system was the moat.** And the serving system, not the algorithm, is what everyone else eventually had to be handed in order to catch up.

We are inside the same gap again.

Open weights are genuinely useful, and having the weights is not the same as having a system that can put tokens on the table for thousands of people and agents, reliably, on a Monday morning nobody forecast. Continuous batching. KV cache pressure. Routing. Utilisation. Fault tolerance. Capacity planning. Replication. When you call a commercial API you are not only paying for model intelligence — you are paying for a cumulative systems investment that keeps GPUs hot and turns computation into tokens on demand.

The mechanisms here are increasingly well understood. What is still missing is **the arithmetic against your own numbers**, and a clear statement of which of these costs you can engineer away — and which one you cannot.

**Eight of them you can buy.** Precision, KV cache, batching, execution engine, parallelism, fleet, reliability, the API surface. Hire well and you will become good at them.

**One you cannot.** Utilisation is a property of *whose* demand you serve, not how well you serve it. A provider's tenants peak at different hours for unrelated reasons. Your applications peak together, because they serve the same business on the same working day. A perfectly-run single-tenant fleet still loses that layer to an indifferently-run multi-tenant one — and most build-versus-buy cases assume it away entirely.

There is a related trap earlier in the process. The demonstration that convinced the room measured latency for **one** person. Your bill is set by throughput for **many**. Those differ by roughly two orders of magnitude, which is how a working demo produces a budget that is wrong by 100×.

We walk through **opentoken**, an open calculator for this decision. You enter your organisation size, workload shape, concurrency profile and latency assumptions, and it turns them into the infrastructure question: how much hardware, how much of it you will actually use, and what that means per million tokens. We run it live against a 1,000-person organisation and against the hosted API.

**And we do not find a single crossover, because there isn't one.** Holding the model, the hardware and the token volume fixed and changing only the *shape* of the workload — chat, RAG, agentic, coding, reasoning, batch — moves the answer by 2.5×. Reasoning workloads and RAG workloads on identical infrastructure are not the same decision. That result is more useful than a number, and it is the one that can be defended.

You leave with the shape of the problem, the calculator, and **a defensible set of assumptions** for your next build-versus-buy meeting — plus a harder organisational question:

**Does your organisation have the equivalent of an SRE capability for serving tokens at scale?**

---

## Speaker notes

**Audience.** Technical leaders making a build-versus-buy decision: CTOs, heads of platform, architects in regulated or cost-sensitive organisations. Assumes no GPU expertise. Assumes budget responsibility.

**The three moments that have to land.**

1. *The algorithm was the IP, the serving system was the moat.* Everything else hangs off this. If the room does not accept it, nothing later matters.
2. *Eight you can buy, one you cannot.* This is the differentiating claim and the one a board will repeat.
3. *There is no single crossover.* This is where the calculator earns its place — it is a claim you can only make credibly by showing the arithmetic move.

**What to cut if time is short.** The mechanism list (batching, KV, routing) can be reduced to three items. The demo trap can go if the audience is technical rather than executive; it cannot go if they are executive.

**Live demo risk.** The calculator is on a free tier that sleeps, and it fetches live price feeds. Warm it immediately before the session, and carry screenshots of the three states shown on stage — the 1,000-person default, the workload-shape comparison, and the fit cliff. A calculator that spins for forty seconds undoes the credibility the arithmetic buys.

**Anticipated questions, and honest answers.**

- *"What did you assume for staffing?"* The default is deliberately low and it is one of the largest terms in the answer. Show the input; do not defend the number. The point of the tool is that this is visible rather than buried.
- *"Isn't this just capacity planning?"* Largely yes, and that is the argument — it is capacity planning that nobody is doing for inference, on a cost structure where the mistakes are unusually expensive.
- *"Have you measured this yourself?"* No. The throughput layer is fitted to third-party published benchmarks, it is graded as such throughout, and the experiment that would settle the weakest claim costs about five dollars of rented H100 time and has not been run.
- *"Doesn't this all get cheaper?"* Per-model prices moved between 0.976× and 0.840× per year over eighteen months depending on the index used. Nothing resembling the widely-repeated tenfold annual decline. What falls is the price of the cheapest *available* model, which is a different claim and only helps you if you re-platform continuously.
