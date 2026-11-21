# Contributing to opentoken

This repository holds two things with different rules:

- **A tool** — the calculator, the model, the catalogue and the data pipeline. Pull
  requests welcome, including ones that prove it wrong.
- **A paper** — an argument published under a named author. Corrections are welcome
  as issues and are credited; edits to its prose go through the author.

That split exists because the tool's numbers *are* the paper's numbers. Changing
`client/src/hwcalc.js` changes what the paper claims, which is why the test suite
is built the way it is.

## Getting set up

```bash
git clone https://github.com/brettleehari/tokencalci
cd tokencalci
npm install
npm test          # the suite — about half a second
npm start         # the calculator on http://localhost:3001
```

Node 20 or newer. No build step is needed to run the tests.

> On Apple Silicon, check `file $(which node)` reports `arm64`. A stray x86_64 node
> in `/usr/local/bin` shadows nvm and every `npm run …` fails with
> `Bad CPU type in executable`.

## The one thing to know before you change the model

`npm test` runs a **golden transcript** test. `scripts/paper-figures.mjs` regenerates
every number the paper publishes, deterministically, from pinned feed snapshots. The
test diffs its output against `test/golden/paper-figures.txt`.

If you change the cost model, the catalogue or the throughput fit, **that test will
fail, and it is supposed to.** It is telling you which published figures your change
moves. When you have satisfied yourself the new numbers are right:

```bash
npm run test:update
```

Then say in your pull request **which figures moved and why**. A changed golden file
with no explanation is the only thing a reviewer cannot check for you.

## What is most useful

**Correcting the KV-cache architecture table.** The highest-value contribution, and
it needs no knowledge of this codebase. `KV_ARCH` in `client/src/hwdata.js` holds
attention parameters for 17 of 55 catalogue models; the rest are estimated, and the
estimates drive fleet sizing directly. One model card, four numbers, one citation.
See [the tracking issue](../../issues) and `docs/kv-architecture-wanted.md`.

**Adding a model to the catalogue.** New open-weight releases go stale fast. See
`MODELS` in `client/src/hwdata.js`.

**A measured throughput anchor.** The weakest layer in the whole model, and the
harness is written and waiting: `npm run bench` sweeps tensor parallelism and
concurrency, records every confounder, and `npm run bench:ingest` tells you which
published figures your measurement moves. See
[`docs/benchmark-protocol.md`](docs/benchmark-protocol.md). If you have access to a
multi-GPU box, this is the single most valuable thing anyone can contribute — and
a result that contradicts the paper is more welcome than one that confirms it.

**Telling us a number is wrong.** Open an issue with the number, where you got
yours, and how it was produced. The paper has been corrected this way repeatedly and
the history is in git.

## House style

The code is commented for *why*, not *what*. If a constant is assumed rather than
measured, say so where it is defined — several already do, and that honesty is the
point of the project. Match the surrounding style; there is no linter and no
formatter, deliberately.

Every number a user sees must trace to an input or a dated feed. A pull request that
introduces an unsourced constant will be asked where it came from.

## Pull requests

- Branch from `main`, keep it focused, and describe what changed and why.
- `npm test` must pass. CI runs it on Node 20, 22 and 24.
- If the golden transcript changed, explain the diff.
- Data snapshots under `server/` are refreshed by automation; you should not need to
  edit them by hand. `server/paper-*.json` are pinned deliberately so the paper stays
  reproducible — changing them is a separate, explained PR.

## Questions

Use [Discussions](../../discussions) to ask anything, propose a direction, or argue
with the paper. Issues are for specific, actionable things.

By contributing you agree your code is MIT-licensed and any prose or data is
CC BY 4.0, matching the repository.
