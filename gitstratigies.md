# Git Strategies

This repository follows a lightweight Git Flow approach that keeps `main` stable while feature work moves quickly in short-lived branches.

## Branching Model

- `main`
  Always reflects the latest stable project state.

- `codex/<feature-name>`
  Used for feature work, technical spikes, and incremental implementation.

- `hotfix/<issue-name>`
  Used for urgent production fixes once the project is deployed.

## Branch Naming Examples

```text
codex/auth-foundation
codex/inventory-ledger
codex/sales-pos
hotfix/fix-stock-adjustment-bug
```

## Daily Workflow

1. Start from `main`.
2. Pull the latest changes.
3. Create a short-lived feature branch.
4. Make focused commits with clear messages.
5. Open a pull request back into `main`.
6. Merge only after review and passing checks.

## Commit Style

Prefer short, descriptive commits that explain the change clearly.

Examples:

```text
feat: scaffold PharmaHub monorepo foundation
feat: add pharmacy and branch schema
feat: add stock movement ledger service
fix: validate manual adjustment reason
docs: improve setup and workflow guides
```

## Pull Request Expectations

Each pull request should:

- stay focused on one area of work
- include a short summary of what changed
- mention any data model or API impact
- note verification steps
- avoid mixing unrelated refactors with feature work

## Recommended Merge Rule

Use squash merge for most feature branches so `main` stays readable and high-signal.

## Protection Rules For Main

When the GitHub repository is connected, `main` should ideally require:

- pull requests before merge
- at least one review
- passing CI checks
- no direct pushes except for maintainers in emergencies

## Suggested First Phase Workflow For PharmaHub

The early implementation sequence should look like this:

1. `codex/auth-foundation`
2. `codex/pharmacy-schema`
3. `codex/inventory-core`
4. `codex/sales-flow`
5. `codex/audit-and-alerts`
6. `codex/dashboard-reporting`

## Release Philosophy

- `main` should always be deployable
- small PRs are better than large PRs
- domain changes should be documented
- schema and workflow changes should be reviewed carefully because they affect pharmacy accountability and stock trust
