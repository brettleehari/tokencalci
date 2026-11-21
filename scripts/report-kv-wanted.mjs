// Regenerates docs/kv-architecture-wanted.md, the contributor-facing list of models
// whose attention parameters are still estimated.
//
// Run it after merging a KV-architecture contribution so the list stays honest —
// an open-source task list that still asks for work already done is how a project
// loses the people who did it.
//
// Run: npm run report:kv

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { MODELS, KV_ARCH } from '../client/src/hwdata.js'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'kv-architecture-wanted.md')

const missing = MODELS.filter((m) => !KV_ARCH[m.id])
const have = MODELS.filter((m) => KV_ARCH[m.id])

const rows = missing
  .map((m) => `| ${m.label} | \`${m.id}\` | ${m.params}B total, ${m.active}B active | ${m.org} |`)
  .join('\n')

const doc = `# Wanted: KV-cache architecture for ${missing.length} models

**This is the best first contribution to this project, and it needs no knowledge of
the codebase.**

Every model's KV cache size per token is set by its attention architecture:

\`\`\`
KV bytes per token = 2 x layers x kv_heads x head_dim x bytes
\`\`\`

That number decides how much GPU memory a replica needs, and therefore how many GPUs
a deployment needs, and therefore the cost. We have published parameters for
**${have.length} of ${MODELS.length}** catalogue models. The other **${missing.length}** are
estimated from parameter count, which is exactly what the paper argues is wrong: a
671B model with multi-head latent attention holds a *smaller* cache per token than a
70B model with grouped-query attention.

## What to do

1. Pick a model from the table below that nobody has claimed.
2. Open its \`config.json\` on Hugging Face, or its model card.
3. Read off four fields:
   - \`num_hidden_layers\` → **layers**
   - \`num_key_value_heads\` → **kvHeads**
   - \`head_dim\` → **headDim** (or \`hidden_size / num_attention_heads\`)
   - the attention kind: grouped-query (\`gqa\`) or multi-head latent (\`mla\`)
4. Open an issue using the [KV-cache architecture template](../../issues/new?template=kv-architecture.yml),
   or send a pull request adding the entry to \`KV_ARCH\` in \`client/src/hwdata.js\`.

For multi-head latent attention, give the latent dimension instead of heads and head
dimension, and set \`kind: 'mla'\`.

## Please include the source

An entry with a link to the config it came from is \`published\`. One without it is
another estimate, which is what we already have.

## Models still needed

| Model | Catalogue id | Size | Organisation |
|---|---|---|---|
${rows}

---

*Generated from the catalogue by \`npm run report:kv\`.*
`

writeFileSync(out, doc)
console.log(`Wrote docs/kv-architecture-wanted.md — ${missing.length} wanted, ${have.length} published, ${MODELS.length} total`)
