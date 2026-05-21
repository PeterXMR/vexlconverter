# Contributing

Thanks for your interest in improving Vexl Converter. This guide covers the basics for
getting a working dev environment and landing a clean pull request.

## Dev environment

Prerequisites: Docker Engine 24+, Python 3.12, Node.js 18+.

```bash
# Clone and enter the repo
git clone https://github.com/PeterXMR/vexlconverter.git
cd vexlconverter

# Bring up the full stack
docker compose up --build
```

For faster iteration, run Postgres in Docker and the backend/frontend on the host:

```bash
docker compose up -d postgres
cd backend && pip install -r requirements.txt && python app.py
cd frontend && npm install && npm start
```

## Branch naming

Branch off `main` using one of the following prefixes:

- `feat/<short-description>` — new user-facing functionality
- `fix/<short-description>` — bug fix
- `chore/<short-description>` — tooling, refactors, or other non-functional changes

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/). Keep the subject under
72 characters and use the imperative mood.

```
feat(alerts): add email notification channel
fix(converter): correct EUR cross-rate calculation
chore(ci): pin docker/build-push-action to v5
```

## Lint and test

Run these before opening a PR:

```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm test -- --watchAll=false
npm run build        # catches build-time errors and warnings
```

## Pull requests

- Keep PRs focused — one concern per PR where possible.
- Include a short summary of what changed and why.
- Link any related issue in the description.
- Make sure CI is green before requesting review.
