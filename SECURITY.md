# Security policy

## Supported versions

Only the latest released version receives security updates.

| Version | Supported |
|---------|-----------|
| 0.2.x   | Yes       |
| < 0.2.0 | No        |

## Reporting a vulnerability

Please report suspected security issues privately — **do not open a public GitHub issue**.

Email: `security@example.com` *(replace with a real inbox before publishing)*

Include, where possible:

- A clear description of the issue and its impact
- Steps to reproduce or a proof-of-concept
- The affected version or commit SHA
- Your preferred contact details for follow-up

We aim to acknowledge reports within **3 business days** and to provide a remediation plan or
patch within **30 days** for confirmed vulnerabilities.

## Scope

In scope:

- The Flask backend (`backend/`)
- The React frontend (`frontend/`)
- The Docker images built from this repository
- The CI workflow under `.github/workflows/`

Out of scope:

- Vulnerabilities in third-party dependencies that are already disclosed upstream (report
  those to the upstream project; we will pick up the fix on our next dependency bump)
- Issues that require a compromised host, privileged local access, or physical access
- Denial-of-service caused by trivially high request volume against a self-hosted instance
- Findings against forks or modified deployments we do not control

## Disclosure

Once a fix is released, we will publish a brief advisory in `CHANGELOG.md` and credit the
reporter (unless anonymity is requested).
