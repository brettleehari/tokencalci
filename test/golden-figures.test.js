// THE REGRESSION TEST THAT MATTERS.
//
// Every number in the paper comes from scripts/paper-figures.mjs, run against
// pinned feeds. That makes its output deterministic, and therefore testable: this
// compares it against a committed transcript and fails on any difference.
//
// If you changed the cost model, the catalogue or the throughput fit, this test
// SHOULD fail. That is the point — it tells you exactly which published figures
// your change moves, before a reader finds out. Read the diff, satisfy yourself
// the new numbers are right, then accept them:
//
//     npm run test:update
//
// and say in your pull request which figures moved and why. A changed golden file
// with no explanation is the one thing a reviewer cannot check.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const goldenPath = join(root, 'test', 'golden', 'paper-figures.txt')

function runFigures() {
  return execFileSync(process.execPath, [join(root, 'scripts', 'paper-figures.mjs')], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  })
}

test('paper figures reproduce the committed transcript', () => {
  const actual = runFigures()
  const golden = readFileSync(goldenPath, 'utf8')

  if (actual !== golden) {
    // A whole-file diff is unreadable; show only the lines that moved.
    const a = actual.split('\n')
    const g = golden.split('\n')
    const changed = []
    for (let i = 0; i < Math.max(a.length, g.length); i++) {
      if (a[i] !== g[i]) changed.push(`  line ${i + 1}\n    golden: ${g[i] ?? '(absent)'}\n    actual: ${a[i] ?? '(absent)'}`)
      if (changed.length >= 20) { changed.push('  ... further differences suppressed'); break }
    }
    assert.fail(
      `The paper's figures no longer match test/golden/paper-figures.txt.\n\n` +
      changed.join('\n') +
      `\n\nIf the change is intended, run "npm run test:update" and explain in your PR which figures moved.`
    )
  }
})

test('figures are deterministic across runs', () => {
  assert.equal(runFigures(), runFigures(), 'two runs of paper-figures.mjs disagree — something reads the clock or a live feed')
})

test('the paper is computed from pinned feeds, not live ones', () => {
  const out = runFigures()
  const prices = JSON.parse(readFileSync(join(root, 'server', 'paper-prices.json'), 'utf8'))
  const snapshot = JSON.parse(readFileSync(join(root, 'server', 'paper-openrouter.json'), 'utf8'))
  assert.match(out, new RegExp(`prices as of ${prices.asOf}`), 'the price stamp does not match the pinned feed')
  assert.match(out, new RegExp(`openrouter snapshot ${snapshot.fetchedAt}`), 'the snapshot stamp does not match the pinned snapshot')
})
