# Security Policy

Morrow profiles hold real, authenticated browser state — cookies, local
storage, and live logins for whatever sites an operator signs into. A Morrow
instance is a high-value target by design. Please treat it accordingly and
help us keep it safe.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report privately through GitHub's [private vulnerability
reporting](https://github.com/jekyo/morrow/security/advisories/new) (Security →
Report a vulnerability), or email the maintainers at **[security contact —
operator to fill in]**.

Please include:

- a description of the issue and its impact,
- steps to reproduce (a minimal proof of concept if possible),
- affected version(s) or commit,
- any suggested remediation.

We aim to acknowledge reports within a few days and will keep you updated as we
investigate. Once a fix is available we'll credit you (unless you prefer to
stay anonymous) in the release notes.

## Supported versions

Morrow is pre-1.x-mature, single-maintainer open source. Security fixes land on
`main` and in the next tagged release; we do not backport to older minor
versions. Run the latest release.

| Version | Supported |
| ------- | --------- |
| latest `1.x` | ✅ |
| older | ❌ (upgrade) |

## Operating Morrow securely

Because a running instance can act inside authenticated sessions, operators
should:

- set a strong, unique `MORROW_API_KEY` and never commit it,
- terminate TLS in front of Morrow and restrict network exposure (it is not
  hardened for the open internet),
- treat the `/data` volume as containing secrets — back it up and delete it
  securely; **encryption at rest is not yet built in** and is the operator's
  responsibility today,
- avoid exposing the Playwright/viewer WebSocket endpoints publicly, since the
  API key travels as a query parameter there and may be logged upstream,
- review `docs/` and the `/privacy` and `/terms` templates before offering the
  service to others.

See also the [Non-Goals](README.md) — Morrow deliberately ships no
arbitrary-code-execution endpoints (`/function`, `/download`) for exactly these
reasons.
