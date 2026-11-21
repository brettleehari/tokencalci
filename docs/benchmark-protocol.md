# Measured throughput: the protocol

This is the experiment §6 of the paper specifies and does not run. It exists to
replace the weakest layer in the model with measurement.

## What is wrong today

The throughput model has three declared weaknesses, all in §6 and §10:

1. **The anchors are confounded by construction.** Model size and GPU count vary
   together across the published benchmarks, so no anchor tests GPU count while
   holding model and precision fixed.
2. **There is no batch-size term**, although throughput varies by roughly 100× with
   batch size on identical hardware.
3. **The tensor-parallel claim is a modelling assumption**, not a measurement — the
   model has no GPU-count term at all, and §6 defends that choice rather than
   demonstrating it.

An independent costing (Ornn Data, *The Economics of Open-Weight Inference*,
7 September 2026) implies the resulting level is roughly 4× optimistic.

## The design

One model, one precision, one machine. Sweep the two axes the model cannot see:

| Axis | Values | Question it answers |
|---|---|---|
| Tensor parallelism | 1, 2, 4, 8 | Does adding GPUs add throughput? |
| Concurrency | 1, 8, 32, 64, 128, 256 | How much does batch size move it? |

Everything else is held fixed: model, precision, input and output lengths,
`max_model_len`, engine version, and the physical machine. The GPUs must be
identical — the harness refuses a mixed box, because a heterogeneous node cannot
test the parallelism claim.

**Model choice.** It must fit at tensor parallelism 1, or the first row is missing
and the scaling question is unanswerable. Qwen3 30B-A3B at fp8 is the default: it is
already a catalogue anchor, so the measurement is directly comparable to a published
figure, and at ~30 GB it leaves room for KV on a single 80 GB card.

**Why concurrency rather than a fixed batch size.** vLLM batches continuously, so
the operator-visible control is how many requests are in flight. That is also the
quantity the cost model derives from arrival rate, which makes the measurement
usable without a translation step.

## What is recorded

A throughput number without its configuration is close to meaningless, which is the
paper's own complaint about published figures. Every run records:

- GPU model, count, memory and driver version
- **Interconnect topology** (`nvidia-smi topo -m`), and whether it is NVLink or PCIe
  — this is the crux of the parallelism claim, and published numbers almost never
  state it
- Engine and version, precision, `max_model_len`
- Input and output lengths, prompt count, concurrency, tensor-parallel degree
- Throughput (total and output), request rate, TTFT p50/p99, ITL p50/p99
- Wall-clock duration and approximate GPU-hours consumed

Output lengths are forced with `--ignore-eos` so every request produces exactly the
requested number of tokens. Without it, a model that stops early inflates throughput
in a way that varies by prompt.

Each tensor-parallel configuration runs one discarded warm-up pass before any timed
run, so the first measurement does not pay for CUDA graph capture and cache warming.

## Running it

On a rented multi-GPU box with vLLM installed:

```bash
git clone https://github.com/brettleehari/tokencalci && cd tokencalci && npm install

npm run bench -- --dry-run                    # validate the plan, no GPUs touched
npm run bench                                 # the full 24-run sweep
npm run bench -- --tp 1,2 --conc 1,64         # a cheaper subset
npm run bench -- --model meta-llama/Llama-3.3-70B-Instruct --precision fp8
```

Results are written to `data/benchmarks/<date>-<gpu>-<model>.json` and committed.

An 8×H100 node runs the full sweep in well under an hour. At community marketplace
rates that is roughly $15–20 of GPU time — more than the five dollars §6 estimates,
because the estimate assumed a single card.

## Folding the result into the model

```bash
npm run bench:ingest -- data/benchmarks/<file>.json
```

This **does not** edit the model. It reports:

1. whether tensor parallelism added throughput, and whether §6's assumption survives;
2. the concurrency span the model has no term for;
3. how far the current fit is from the measurement, as a geometric mean, next to
   Ornn's implied ~4×;
4. the exact `BENCHMARKS` rows to paste into `client/src/throughput.js`.

You then decide, edit, and run `npm test`. The golden transcript will fail and name
every published figure the change moves. That failure is the point: accept it with
`npm run test:update` and say in the commit which numbers moved and why.

A script that silently rewrote the constants behind a published argument would be the
opposite of what this project is for.

## What each outcome means

**The assumption holds** (throughput roughly flat across tensor-parallel degrees).
§6 goes from the paper's weakest section to one of its strongest, and the
`published` grade on Appendix A-9 becomes `measured`.

**The assumption fails** (throughput rises materially with GPU count). `§6` must be
rewritten and `TP_BUYS_CAPACITY_NOT_SPEED` set false. Fleet sizing changes, and with
it every cost multiple in the paper. This is the more interesting result and should
lead the revision.

**The level is wrong but the shape is right.** Most likely, given Ornn. Every cost
figure scales inversely with throughput, so §5, §5.1, §6 and the abstract all move
together. Appendix C exists to record exactly this kind of correction.

All three outcomes are publishable. Only the absence of the measurement is not.
