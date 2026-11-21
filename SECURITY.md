# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's [private vulnerability reporting](../../security/advisories/new), which
notifies the maintainer without disclosing the detail publicly. If that is
unavailable to you, open an issue saying only that you have a security report and
asking for a contact route.

Expect an acknowledgement within a week.

## Scope

This is a static calculator with a small read-only server. It holds no user
accounts, no user data and no secrets, and it writes nothing per request. The
realistic surface is:

* The server fetches third-party JSON (LiteLLM, Vast.ai, OpenRouter) and serves a
  normalised form of it. Anything that turns a malicious upstream response into
  code execution or a cross-site scripting vector is in scope.
* Dependency vulnerabilities reachable from the served application.
* The GitHub Actions workflows, which hold `contents: write` and commit data
  snapshots to the default branch.

Out of scope: rate limiting, denial of service against the public demo deployment,
and the accuracy of any cost estimate. Wrong numbers are bugs — please report those
as ordinary issues, which is how the paper has been corrected before.
