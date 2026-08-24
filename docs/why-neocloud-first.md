# Open weights are not open inference.

### Why hosting an open model takes longer than anyone budgets for, and why neocloud is the honest intermediate step.

Hariprasad Sudharshan · August 2026

---

We celebrate the checkpoint and ignore the chain.

Every time a lab drops weights, my timeline fills up with the same sentence. "Now we don't need the frontier labs." I have written variants of that sentence myself. Then I actually went and priced the thing end to end, model by model, GPU by GPU, and the numbers did not agree with my enthusiasm.

This piece is what I found. Some of it argues against a position I held six months ago.

**Problem Statement :**

An open weight is a file. A served token is a system. Between the two sits a discipline that does not yet have a name, an org chart or a salary band, and because it has none of those things we keep pretending it is not there.

We have done this before. In 2008 we had the source code and we thought we had the product. Building it reproducibly was someone's job. Shipping it safely was someone's job. Knowing it broke at 2am was someone's job. None of it was in the repository. It took us the better part of a decade to name that work DevOps, and only after we named it did we start budgeting for it.

Model serving is at exactly that stage. We have the weights. Making them fast is someone's job. Making them fit is someone's job. Keeping them hot is someone's job. None of it is in the checkpoint.

---

## The chain, and where the weights actually sit :

Ten blocks stand between a safetensors file and a token you can bill for.

Weights. Precision. KV cache. Batching. Kernels. Parallelism. Fleet. Reliability. Economics. Surface.

The open part is block one.

Block three is where I would start if I wanted to scare someone honestly. The KV cache is every token every user has ever sent, still resident in memory, growing with concurrency. The vLLM paper's central observation is that naive allocation wastes it badly, real requests use only 20-30% of what gets reserved, so 70-80% of your expensive HBM sits doing nothing [1]. PagedAttention fixed that by borrowing virtual memory paging from operating systems and got 2-4x throughput at the same latency [1]. That is one idea, from one paper, that you now get for free by typing `pip install vllm`.

Free to install. Not free to operate. That is the whole confusion in one line.

Block four is batching, and it is where the money actually hides. On identical hardware, same model, same GPUs, a published benchmark run swept batch size from 1 to 256 and cost per million tokens moved from roughly $258 to $2.30 [2]. A hundred fold. Nothing changed except how many requests were in flight together.

Read that again, because it decides everything downstream. Your cost per token is not a property of your hardware. It is a property of **how many people are talking to you at once**.

**I believe you do not have issues with this so far.** Now the uncomfortable part.

---

## What I got wrong, and what the benchmarks corrected :

I built a calculator for this. Its first version had a throughput model I invented, a step function on parameter count, and it told me that running a dense model yourself costs 4 to 6 times what a neocloud charges. Good story. I liked it.

Then I fitted the model against published vLLM and SGLang serving benchmarks and it fell apart.

The real figure for dense models is closer to 1.6 to 1.8x. Not 4 to 6. My model had overstated the hardware bill by about 2.4x, because I had assumed something that is simply not true.

**Tensor parallelism buys capacity, not speed.**

Look at the measurements. Qwen3 30B-A3B on one H100 serves 3,900 tokens a second. Gemma 4 31B on one H100 serves 3,100. Mistral Small 24B on two H100s serves 3,400. Llama 3.3 70B on eight H100s serves 2,800 [2].

Eight GPUs. 2,800 tokens a second. One GPU. 3,900 tokens a second.

Adding GPUs did not add throughput. It added the ability to fit. Tensor parallel decode pays collective communication on every single layer and that cost eats the bandwidth you just bought. You split a model across cards to make it fit, not to make it fast. To actually serve more tokens you deploy another full replica, and pay for it again.

I had this backwards for months and my number was wrong because of it. Shall correct it publicly rather than quietly.

**Whats the use of this correction :**

It gives you a single number that predicts your fate, and I am going to name it because unnamed things do not get budgeted.

**TPT — Tensor Parallel Tax.**

TPT = number of GPUs one replica needs, just to hold the model.

TPT = ceil( ( total params x bytes per param x 1.3 ) / GPU VRAM )

Because throughput is flat in GPU count, your cost multiple against a provider tracks TPT almost directly. TPT of 1 and you are competitive. TPT of 4 and you are paying four times for the same tokens before anyone is hired.

Run the catalogue through it :

Qwen3 30B-A3B, TPT 1, lands at about 0.5x the neocloud price. You win.
Gemma 4 31B, TPT 2, about 0.5x. You still win, and I will come back to this one.
Llama 3.3 70B, TPT 3, about 1.6x. You lose.
gpt-oss-120b, TPT 4, about 1.8x. You lose.
DeepSeek V3, TPT 22, about 7.2x. You lose badly.

Not sparsity. Not parameter count. **VRAM fit.** That is the line, and it is a line you can compute in one afternoon before you commit a quarter.

**Now the Gemma case, because it is the most instructive number in the table :**

31 billion parameters at fp16 is 62GB of weights. Add the usual 30% headroom for KV cache and activations and you need 81GB. An H100 has 80.

One gigabyte. That single gigabyte doubles your TPT from 1 to 2, and doubles the hardware bill for exactly the same tokens.

Serve the same model at fp8 and it needs 41GB. TPT drops back to 1. Same weights, same card, half the cluster.

This is why I said earlier that quantisation is not a config flag. It is not only a throughput lever(2.0x at fp8, measured [2]), it moves you across the VRAM boundary that decides your whole cost structure. And the skill in it was never the speedup, it is calibrating so the model does not get dumber on the way. That skill is block two of ten and we have not even reached the KV cache yet.

Gemma also shows TPT is a strong predictor and not a complete one. It sits at TPT 2 and still wins, because the provider price for that particular model happens to be high. Compute your TPT, then check the actual price you would pay. Both, not either.

---

## The part nobody prices : the people :

Hardware is the cheap half and it is the half everyone models.

A single MLOps or inference engineer runs roughly $160,000 a year in salary alone, against a few thousand dollars for the hardware underneath them [3]. Loaded cost for a senior LLM infrastructure hire in a major US market lands at $250-360K, $140-220K in EU and UK [3]. And you are hiring into a market with a 63% talent shortage and 500,000+ open roles [4], for the specific person who can move a model from demo to durable production, which is precisely the scarcest profile in the field [3].

Now put those two facts next to each other.

Your GPUs are a line item. Your ability to keep them busy is a hiring problem in the tightest talent market in the industry.

One independent analysis puts honest break-even for pure self-hosting on rented H100s at $50-80K a month of premium API spend, once you count idle GPUs, P95 over-provisioning and a senior infra hire [5]. Fifty thousand a month. That is not a startup number. That is a company that has already succeeded.

**I believe the arithmetic is acceptable so far.** Here is the accelerant.

---

## The moving target :

The stack you would build against is not standing still.

vLLM v0.6.0 alone delivered 2.7x throughput and 5x latency reduction over v0.5.3 [6]. Not over a competitor. Over itself, one minor version earlier. Quantisation moved the same way, a controlled same-hardware run measures fp8 at 2.0x and fp4 at 3.0x against fp16 [2], and getting there without wrecking model quality is calibration work, not a config flag.

So the target you are chasing moves roughly twice a year, in a direction that requires the engineer you cannot hire.

A neocloud absorbs every one of those upgrades on your behalf and passes you the number. You did nothing. You got 2.7x.

This is the part of the argument I find genuinely hard to counter, and I have tried.

---

## Then why does anyone self host :

Because of a claim that has quietly stopped being true, and one that has not.

The one that stopped : "our data cannot leave". Zero Data Retention is now widely available and usually carries no per token premium. Groq made ZDR self serve for every customer, and it is available through DeepInfra, Google Vertex and Amazon Bedrock [7][8]. Prompts not stored, not logged beyond metadata, never trained on, contractually.

So price the ladder before you climb to the top of it. Standard API. ZDR. In region provider. Dedicated single tenant endpoint. Your own hardware.

Most conversations jump from rung one to rung five and skip three cheap options in between. In our own runs that last rung costs 16 to 21 times the API price. **ZDR is a contract, a walled garden is physics** and the premium is exactly the price of upgrading from a promise to a physical property. Sometimes a regulator demands precisely that and then you pay it gladly. Often nobody has written down which requirement is actually binding, and that is the most expensive unexamined default in this decision.

The one that has not stopped being true : TPT of 1. If your model fits on a single card and your load is genuinely steady, self hosting wins outright, at roughly half the provider price. That is a real answer and I want to be fair to it.

---

## The intermediate position, stated plainly :

Rent the serving, own the decision.

Not forever. Not as surrender. As the honest sequencing of a problem where one variable is unknown and expensive to guess wrong.

The variable is your demand curve. Your cost per token is set by concurrency, concurrency is set by traffic you have not observed yet, and buying hardware is buying peak capacity for a peak you are currently imagining. A neocloud lets you run for two quarters, watch the shape, and then decide with data instead of a spreadsheet.

Three things to actually do while you rent :

**One.** Measure your TPT the day you shortlist a model. It is arithmetic, not a project. If it comes back 1, put self hosting genuinely on the table. If it comes back 8, stop discussing it and spend the meeting on something else.

**Two.** Watch your real duty cycle, not your imagined one. Provision for peak, pay 24x7, and the idle is yours. In our numbers idle capacity is routinely the single largest term in the gap, larger than serving efficiency, larger than people.

**Three.** Write down which compliance requirement is actually binding, in one sentence, before anyone prices a GPU. "Not trained on" is ZDR and free. "Stays in our region" is a provider choice. "Physical custody, no counterparty" is the walled garden and it is expensive and sometimes correct.

**Need of the hour :**

Stop calling it a build versus buy decision. It is a build versus **not yet** decision, and the difference matters because the door does not close. Weights you can download today you can still download in eighteen months, on hardware that is cheaper, with a serving stack that is 2.7x faster, hired into by a market that has had two more years to produce the engineers.

The people who lost money on this in 2026 were not the ones who used an API. They were the ones who bought a cluster for a demand curve they had not measured yet.

---

**Foot Notes :**

1. Kwon et al, Efficient Memory Management for Large Language Model Serving with PagedAttention (vLLM). 70-80% KV cache waste under naive allocation, 2-4x throughput at equal latency.
2. Spheron, GPU Cost Per Token Benchmark 2026. vLLM, continuous batching, 256 concurrent requests, 512 in / 512 out, across A100 / H100 / H200 / B200. https://www.spheron.network/blog/gpu-cost-per-token-benchmark-llm-inference-2026/
3. KORE1, How to Hire LLM Engineers in 2026. Loaded cost bands and the demo-to-production talent gap. https://www.kore1.com/hire-llm-engineers-2026/
4. CalTek Staffing, The AI/ML Talent Shortage 2026. 63% shortage, 500,000+ open roles. https://caltekstaffing.com/ai-ml-talent-shortage-strategies-attracting-retaining-top-engineers-2026/
5. The AI Engineer, Should You Self-Host LLM Inference. Break-even at $50-80K/mo premium API spend, hybrid at ~$25K/mo. https://theaiengineer.substack.com/p/should-you-self-host-inference
6. vLLM Blog, v0.6.0 — 2.7x Throughput Improvement and 5x Latency Reduction. https://vllm.ai/blog/2024-09-05-perf-update
7. GroqDocs, Your Data in GroqCloud. ZDR self serve in Data Controls. https://console.groq.com/docs/your-data
8. Decagon, What is Zero Data Retention AI — vendor guide.
9. Cerebrium, Benchmarking vLLM vs SGLang vs TensorRT-LLM for Llama 3.1. SGLang 460 tok/s at batch 64, single H100, FP8. https://cerebrium.ai/blog/benchmarking-vllm-sglang-tensorrt-for-llama-3-1-api
10. All TPT figures, the 1.6-1.8x dense gap and the idle cliff decomposition are computed live at opentoken, against the LiteLLM price feed and Vast.ai GPU marketplace, with every input graded by confidence.

**PS :** The 4-6x number I published earlier in the year was wrong and this piece corrects it. I would rather ship the smaller defensible figure than keep the one that made the better argument. Do let me know where you think the reasoning still has holes, there is always room for improvement :)
