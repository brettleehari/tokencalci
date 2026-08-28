# The Serving Chain Canvas

**One page. Ten questions. Fill it in before you commit a quarter.**

A checkpoint is one of ten cost-bearing responsibilities between a published weight file and a token you can bill for. Nine of them do not arrive in the download. This canvas is the decomposition in a form you can complete in a planning meeting, without reading the paper it came from.

Answer each row for **your** workload. Mark who does the work: **rent** if a provider carries it, **own** if you will. Any row you cannot answer is not a row that does not apply — it is the row that will surprise you.

---

**Model** ________________  **Workload shape** ________________  **Volume** _______ tokens/day  **Duty cycle** ______ %

---

| # | Layer | The question to answer | Your answer | Rent / Own |
|---|---|---|---|---|
| 1 | **Weights** | Which checkpoint, at which licence, and does the licence permit our use and our derivatives? | | *arrives free* |
| 2 | **Precision** | What precision will we actually serve at, did the lab ship it, and who validates that quality survived? | | ☐ ☐ |
| 3 | **KV cache** | At our context and concurrency, how much memory is KV — and what does that make our replica cost? | | ☐ ☐ |
| 4 | **Batching** | What concurrency do we actually have at peak, and at the trough? Cost per token is set here, not by the GPU. | | ☐ ☐ |
| 5 | **Execution** | Which serving engine, which version, and who re-benchmarks and re-qualifies when it moves? | | ☐ ☐ |
| 6 | **Parallelism** | How many GPUs does one replica need purely to fit? Splitting makes it fit, not fast. | | ☐ ☐ |
| 7 | **Fleet** | We provision for peak and pay 24×7. What is the trough, and what is idle costing us? | | ☐ ☐ |
| 8 | **Reliability** | Who carries the pager? What happens to a stream mid-generation when a node dies? | | ☐ ☐ |
| 9 | **Utilisation** | What else runs on this fleet? If the answer is "nothing", we pay the full correlation tax. | | ☐ ☐ |
| 10 | **Surface** | Who builds and maintains the API, streaming, quotas, metering, keys — and for how long? | | ☐ ☐ |

---

## The four numbers

Fill these in from the calculator, or from your own model. They are the ones that decide the answer.

| | Your value | What it means |
|---|---|---|
| **Correlation tax** `(1/duty) − 1` | ______ × | Capacity bought and idled per unit consumed. **Zero only for flat batch work.** This is the number a provider avoids by having many tenants, and no amount of engineering removes it. |
| **Step headroom** | ______ % consumed | How much of the current fleet step is used. Under ~70%, context and concurrency are free. Over ~90%, the next increment buys a GPU. |
| **Fit cliff** | ______ tokens / ______ concurrent | Where the next GPU per replica arrives. Growth crosses this without warning. |
| **Refresh cadence** | every ______ weeks | How often you can succeed one model with another and stay in service. This is a capability ceiling, not a schedule. |

---

## The two tests

**The acquirability test.** Go back through rows 2–10 and mark each: can this be *hired*, *bought*, or neither?

> Eight of them can. **Row 9 cannot.** Utilisation is a property of whose demand you serve, not of how good your engineers are, and a well-run single-tenant fleet still loses it to an indifferently-run multi-tenant one. If your build-versus-rent case does not have a line for row 9, it has assumed the hardest part away.

**The demo test.** Look at what convinced the room this was viable.

> If it was a laptop or a single GPU serving one user, it exercised **row 1 and part of row 2**. It measured latency for one person. Your bill will be set by rows 3, 4, 7 and 9 at concurrency, which the demo never had. That gap is *demo debt*: real work, already incurred, not yet visible.

---

## How to read your answers

**Mostly "rent".** Reasonable, and the common answer. You are buying nine layers and a tenth you could not build. Spend the saved effort on rows 1 and 2 — model selection and precision — where your judgement actually differentiates.

**Mostly "own", with a low correlation tax.** Defensible. Flat, schedulable, high-duty work is the one shape where a single tenant manufactures the utilisation a provider gets from many. Verify the duty cycle against real traffic rather than a plan.

**Mostly "own", with a high correlation tax and no answer for row 9.** This is the case that goes wrong. The economics are being carried by an assumption nobody has written down. Write it down, then decide.

**A regulatory requirement in row 9.** Then this is a budgeting exercise rather than a decision, and the right question is which rung of the data-control ladder your requirement actually binds to — several are contractual and cheaper than physical custody.

---

*From "From Free Weights to Reliable Tokens: the ten layers of open-model inference, and the discipline forming around them" — Sudharshan, 2026. The calculator that computes the four numbers is at [tokencalci.onrender.com](https://tokencalci.onrender.com). Corrections welcome; the paper has been wrong seven times and says so.*

*This canvas is CC BY 4.0. Copy it, change it, put your own logo on it.*
