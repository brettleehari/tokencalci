import React from 'react'

export default function Guide() {
  return (
    <article className="panel guide">
      <h2>Should you self-host an LLM? A practical guide</h2>
      <p className="lead">
        Open-weight models are good enough now that running your own is a real option — but
        “can” and “should” are different questions. This is a short, vendor-neutral guide to
        what’s available, what it actually takes, and the one reason that overrides the cost
        math entirely: data sovereignty.
      </p>

      <h3>What’s available today</h3>
      <p>
        The open-weight ecosystem has caught up faster than most people realize. You can
        download and run models spanning the full range:
      </p>
      <ul>
        <li><b>Frontier-class</b> — DeepSeek V3/R1, Qwen3 235B, Kimi K2, Llama 3.1 405B. Near the top
          of public leaderboards, but hundreds of billions of parameters.</li>
        <li><b>Strong mid-size</b> — Llama 70B, Qwen 72B, Mistral Large, Gemma 3 27B, Command R+.
          The workhorse tier for most production tasks.</li>
        <li><b>Efficient small</b> — Qwen 32B/8B, Mistral Small, Phi-4, Gemma 3, Llama 8B/3B.
          Cheap to run, surprisingly capable, and where most self-hosting actually makes sense.</li>
        <li><b>Specialists</b> — coding (Qwen Coder, DeepSeek-Coder, Codestral), reasoning
          (DeepSeek R1, QwQ), vision (Llama 4, Pixtral, Gemma 3), multilingual (Aya).</li>
      </ul>
      <p>
        You don’t have to run them yourself to use open weights, though. A layer of
        <b> neocloud</b> providers — DeepInfra, Together, Fireworks, Groq, Cerebras, Novita,
        and others — serve these exact models as a pay-per-token API, often cheaper than you
        can run them, because they batch across thousands of tenants at near-100% utilization.
        That’s the real alternative to self-hosting: not “open vs closed,” but
        <b> “run the open model yourself vs rent the same open model by the token.”</b>
      </p>

      <h3>What’s required to self-host</h3>
      <p>People underestimate this, so here’s the honest checklist:</p>
      <ul>
        <li><b>GPUs — and enough VRAM to fit the model.</b> Roughly 2 bytes per parameter at
          FP16 (0.5 at INT4), plus ~30% headroom for the KV-cache. A 70B model needs ~168 GB
          (fp16) → 2–3× 80 GB GPUs; a 405B model needs a small cluster. Mixture-of-Experts
          models (active ≪ total) are far cheaper to serve.</li>
        <li><b>The rest of the node.</b> System RAM, CPU, fast networking (InfiniBand for
          multi-GPU), and storage — often $8–9k per GPU on top of the card itself.</li>
        <li><b>Throughput headroom for your peak.</b> You must size hardware for your busiest
          minute, not your average — and then pay for it 24×7.</li>
        <li><b>People.</b> Someone has to run vLLM/TGI/SGLang, monitor it, patch it, and keep it
          up. This is the cost most calculators omit, and it frequently dominates.</li>
        <li><b>Power, cooling, and space</b> if you own the hardware — metered energy plus
          colocation at roughly $100–200 per kW per month.</li>
      </ul>
      <p>
        The uncomfortable truth the numbers keep showing: for most workloads, at neocloud
        prices, <b>the API is cheaper until you have very high, very steady volume.</b> Self-host
        is a fixed cost provisioned for peak; a neocloud bill scales to zero when you’re idle.
        If your traffic is bursty — nights and weekends quiet, occasional spikes — you pay for
        capacity you don’t use. The break-even isn’t a token count; it’s a <b>duty cycle</b>:
        how much of the time your hardware is actually busy.
      </p>

      <h3>What is data sovereignty?</h3>
      <p>
        <b>Data sovereignty</b> is the principle that data is subject to the laws and governance
        of the jurisdiction where it is collected or stored — and, in practice, the requirement
        that your data (and often the model and the compute) stay under your control and within a
        defined boundary. For LLMs specifically it means: <b>prompts, documents, and outputs
        never leave infrastructure you control.</b> No third-party API sees them; nothing crosses
        a border or a corporate boundary you haven’t sanctioned.
      </p>
      <p>
        This is the one factor that overrides the cost math. When sovereignty is a hard
        requirement, “the API is cheaper” is irrelevant — the API isn’t an option at all. The
        only question left is <b>how large a premium you’ll pay for control</b>, and how that
        premium grows as neocloud prices keep falling.
      </p>

      <h3>When is sovereignty essential — and why</h3>
      <ul>
        <li><b>Regulated data (health, finance, legal).</b> HIPAA, GLBA, and similar regimes
          restrict where PII/PHI can be processed. Sending patient notes or account data to a
          third-party inference API can be a reportable violation — <i>why:</i> the legal and
          reputational cost of a breach dwarfs any inference savings.</li>
        <li><b>Government & public sector.</b> National-security and public-records rules often
          mandate in-country, in-agency processing — <i>why:</i> classified or citizen data
          can’t sit on foreign or commercial infrastructure.</li>
        <li><b>Cross-border / data-residency law.</b> GDPR, and China’s, India’s, and other
          data-localization regimes constrain moving personal data across borders — <i>why:</i>
          a foreign-hosted API may itself be the unlawful transfer.</li>
        <li><b>Trade secrets & competitive IP.</b> Source code, drug pipelines, deal terms,
          proprietary datasets — <i>why:</i> even with a no-training pledge, sending your crown
          jewels to an external endpoint is a risk surface many firms won’t accept.</li>
        <li><b>Air-gapped or contractual isolation.</b> Defense, critical infrastructure, or
          client contracts that forbid external data egress — <i>why:</i> there is literally no
          network path to a cloud API, by design.</li>
      </ul>
      <p>
        When one of these applies, self-hosting (or a sovereign/private deployment) isn’t a cost
        optimization — it’s a control requirement, and the “premium vs a neocloud” is simply what
        that control costs. When none of them apply, the decision is pure economics, and for most
        bursty workloads a neocloud API wins. This tool is built to make both cases explicit:
        the verdict, the premium, and the math behind them.
      </p>

      <p className="muted small">
        Directional and educational — not legal or financial advice. Verify a model’s license and
        your own regulatory obligations before deploying. Note: different models use different
        tokenizers, so token-based price comparisons across models are approximate.
      </p>
    </article>
  )
}
