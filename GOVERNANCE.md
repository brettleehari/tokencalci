# Governance

How decisions get made here, who makes them, and what would have to change for that
to stop being one person.

## The split this project runs on

This repository holds two things with different rules, and conflating them is the
main way it could go wrong.

**The tool** — the calculator, the cost model, the catalogue, the data pipeline.
Open to pull requests from anyone, including ones that prove it wrong. Decisions are
technical and are settled by evidence: a number is right or it is not.

**The paper** — [*From Free Weights to Reliable Tokens*](https://doi.org/10.5281/zenodo.24516238),
a published argument under a named author with a DOI. Corrections are welcome and
credited; its prose and its argument are the author's. A paper whose claims are
edited by committee is not a paper, and a DOI'd record cannot be quietly rewritten.

The tool's numbers *are* the paper's numbers, which is why the golden transcript
test exists: a change to the model announces which published figures it moves.

## Who decides

**Maintainer: [@brettleehari](https://github.com/brettleehari)** (Hariprasad
Sudharshan). Currently the only one, which is this project's largest structural
risk and is stated as such in the README rather than hidden.

Day to day: pull requests to the tool are reviewed on the merits and merged when CI
is green and the change is explained. Dependency updates of patch and minor severity
merge themselves; major versions are held for a person, because this repository has
already been bitten by one that passed every check.

Disagreements are settled in the open — in the issue or the pull request, not in
private. Where evidence is available, evidence wins. Where it is not, the change
waits until it is, which is the same standard the paper applies to itself.

## Becoming a co-maintainer

There is no application. The path is:

1. **Contribute substantively more than once.** A few merged pull requests that
   required judgement, not only typo fixes.
2. **Review someone else's work.** Maintenance is mostly reading other people's
   changes, and that is the skill being looked for.
3. **Be asked.** The maintainer offers; you accept or decline.

A co-maintainer gets commit access, a line in CODEOWNERS, and a say in direction.
What is expected in return is a reply within a reasonable time and saying so when
you no longer have the time — stepping back is normal and should be announced, not
performed by silence.

**This is wanted, not tolerated.** A project with one maintainer dies when that
person gets busy.

## Authorship and credit

Credit is deliberate here, because the project produces academic output as well as
software.

| What you did | What you get |
|---|---|
| Code, docs, bug reports, data corrections | Named in the release notes and the repository's contributor list |
| A measured benchmark that becomes an anchor | Named in the dataset record and in the paper's acknowledgements, with your run cited |
| Substantive research — a new section, a result that changes a conclusion, analysis that would not exist without you | **Co-authorship** on the next version of the paper, by discussion before the work starts |

If you think your contribution crosses from the second row into the third, say so
early. That conversation is much easier before the work than after it.

## Conflict of interest

**The project's only real asset is that it is disinterested.** It publishes
comparisons between GPU vendors and inference providers in a field where most
published break-even numbers come from parties selling one side of the comparison —
a point the paper itself makes. Protecting that is the first obligation.

**Current disclosures:**

- The maintainer is employed outside this project. The employer does not fund it,
  direct it, or review it, and no employer confidential information is used in it.
  All work here is done independently of that role.
- No funding, no sponsorship, and no commercial relationship with any provider named
  in the paper or priced by the tool.

**If that changes** — credits from a GPU provider, sponsorship, paid work related to
the subject — it will be disclosed here, in the paper's disclosure section and on
the results page, *before* the first number produced under it is published. Any such
arrangement must be credits or funding only, with no say over which models or
hardware are measured, no say over timing, and the condition that **every result is
published regardless of outcome**, including results unflattering to the funder.

**Contributors should disclose too.** If you work for a GPU provider, a neocloud, an
inference gateway or a lab whose model is in the catalogue, say so in your first
pull request. It does not disqualify you — people who run this infrastructure know
things the rest of us do not, and that knowledge is welcome. It just has to be
visible.

## Changing this document

By pull request, like anything else. Changes to the conflict-of-interest section
should be proposed in an issue first, because that is the part other people are
relying on.
