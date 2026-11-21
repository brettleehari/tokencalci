# Wanted: KV-cache architecture for 38 models

**This is the best first contribution to this project, and it needs no knowledge of
the codebase.**

Every model's KV cache size per token is set by its attention architecture:

```
KV bytes per token = 2 x layers x kv_heads x head_dim x bytes
```

That number decides how much GPU memory a replica needs, and therefore how many GPUs
a deployment needs, and therefore the cost. We have published parameters for
**17 of 55** catalogue models. The other **38** are
estimated from parameter count, which is exactly what the paper argues is wrong: a
671B model with multi-head latent attention holds a *smaller* cache per token than a
70B model with grouped-query attention.

## What to do

1. Pick a model from the table below that nobody has claimed.
2. Open its `config.json` on Hugging Face, or its model card.
3. Read off four fields:
   - `num_hidden_layers` → **layers**
   - `num_key_value_heads` → **kvHeads**
   - `head_dim` → **headDim** (or `hidden_size / num_attention_heads`)
   - the attention kind: grouped-query (`gqa`) or multi-head latent (`mla`)
4. Open an issue using the [KV-cache architecture template](../../issues/new?template=kv-architecture.yml),
   or send a pull request adding the entry to `KV_ARCH` in `client/src/hwdata.js`.

For multi-head latent attention, give the latent dimension instead of heads and head
dimension, and set `kind: 'mla'`.

## Please include the source

An entry with a link to the config it came from is `published`. One without it is
another estimate, which is what we already have.

## Models still needed

| Model | Catalogue id | Size | Organisation |
|---|---|---|---|
| DeepSeek V4-Pro | `deepseek-v4-pro` | 1600B total, 49B active | DeepSeek |
| Kimi K2.6 | `kimi-k2.6` | 1000B total, 32B active | Moonshot |
| GLM-5.2 | `glm-5.2` | 753B total, 40B active | Zhipu |
| Mistral Large 3 | `mistral-large-3` | 675B total, 41B active | Mistral |
| Qwen3-Coder 480B | `qwen3-coder-480b` | 480B total, 35B active | Alibaba |
| MiniMax M3 | `minimax-m3` | 428B total, 23B active | MiniMax |
| DeepSeek V4-Flash | `deepseek-v4-flash` | 284B total, 13B active | DeepSeek |
| Qwen3 235B | `qwen3-235b` | 235B total, 22B active | Alibaba |
| Nemotron 3 Super | `nemotron-3-super` | 120B total, 12B active | Nvidia |
| Qwen3-Next 80B | `qwen3-next-80b` | 80B total, 3B active | Alibaba |
| Llama 4 Maverick | `llama4-maverick` | 400B total, 17B active | Meta |
| DBRX | `dbrx` | 132B total, 36B active | Databricks |
| Command R+ | `command-r-plus` | 104B total, 104B active | Cohere |
| Gemma 4 31B | `gemma4-31b` | 31B total, 31B active | Google |
| Yi-1.5 34B | `yi-34b` | 34B total, 34B active | 01.AI |
| Mixtral 8x22B | `mixtral-8x22b` | 141B total, 39B active | Mistral |
| Llama 4 Scout | `llama4-scout` | 109B total, 17B active | Meta |
| Qwen2.5 Coder 32B | `qwen-coder-32b` | 32B total, 32B active | Alibaba |
| DeepSeek-Coder V2 | `deepseek-coder-v2` | 236B total, 21B active | DeepSeek |
| QwQ 32B | `qwq-32b` | 32B total, 32B active | Alibaba |
| Gemma 3 27B | `gemma3-27b` | 27B total, 27B active | Google |
| Command R | `command-r` | 35B total, 35B active | Cohere |
| Codestral 22B | `codestral` | 22B total, 22B active | Mistral |
| InternLM2.5 20B | `internlm-20b` | 20B total, 20B active | Shanghai AI Lab |
| Phi-4 14B | `phi-4` | 14B total, 14B active | Microsoft |
| Qwen 2.5 14B | `qwen-14b` | 14B total, 14B active | Alibaba |
| Gemma 3 12B | `gemma3-12b` | 12B total, 12B active | Google |
| Pixtral 12B | `pixtral-12b` | 12B total, 12B active | Mistral |
| OLMo 2 13B | `olmo2-13b` | 13B total, 13B active | Ai2 |
| Falcon 3 10B | `falcon3-10b` | 10B total, 10B active | TII |
| Qwen 2.5 7B | `qwen-7b` | 7B total, 7B active | Alibaba |
| Gemma 2 9B | `gemma2-9b` | 9B total, 9B active | Google |
| Ministral 8B | `ministral-8b` | 8B total, 8B active | Mistral |
| Phi-3.5 mini | `phi-3.5-mini` | 3.8B total, 3.8B active | Microsoft |
| Gemma 3 4B | `gemma3-4b` | 4B total, 4B active | Google |
| Granite 3 8B | `granite-8b` | 8B total, 8B active | IBM |
| StarCoder2 15B | `starcoder2-15b` | 15B total, 15B active | BigCode |
| Aya Expanse 32B | `aya-32b` | 32B total, 32B active | Cohere |

---

*Generated from the catalogue by `npm run report:kv`.*
