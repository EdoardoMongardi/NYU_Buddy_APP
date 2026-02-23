# Contributing to NYU Buddy

Thanks for your interest in contributing. This guide covers the basics to get you started.

## Prerequisites

- Node.js 20 (see `.nvmrc`)
- npm >= 10
- Firebase CLI (`npm install -g firebase-tools`)

## Setup

Follow the [Getting Started](README.md#getting-started) section in the README.

## Branch Naming

Use descriptive branch names with a prefix:

```
feature/activity-notifications
fix/match-cancel-race-condition
chore/update-dependencies
```

## Commits

Write clear, concise commit messages:

```
feat: add group chat message reactions
fix: prevent duplicate offer creation on rapid clicks
chore: clean up unused imports in match hooks
```

Use conventional prefixes: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`.

## Pull Requests

1. Create a branch from `main` (or the current working branch).
2. Keep PRs focused — one feature or fix per PR.
3. Ensure `npm run build` and `npm run lint` pass before opening.
4. Write a short description of what changed and why.

## Code Style

- TypeScript strict mode is enabled.
- Formatting and lint rules are enforced by ESLint (`npm run lint`).
- Use the existing patterns in the codebase — check nearby files for conventions.

## Questions?

Open an issue or reach out to the maintainer directly.
