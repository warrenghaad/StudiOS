# Repo Commit Vitality Audit

This folder records which `warrenghaad` repositories look alive enough to inspect for deeper functionality mapping.

## Purpose

The audit separates:

- repositories with meaningful commit history and source structure
- repositories that are empty, scaffold-only, archived stubs, or likely duplicates
- repositories that need manual review before inclusion

## Current method

The current audit used:

1. GitHub repository metadata exported from GitHub API search/listing tools
2. shallow repository-page inspection for root files
3. commit-history page inspection for commit vitality
4. local git inspection for the private `/home/runner/work/StudiOS/StudiOS` repo

## Files

- `repo-commit-audit.json` — detailed audit records
- `repo-commit-audit.csv` — compact spreadsheet export
- `inclusion-candidates.csv` — repos worth deeper functionality inspection
- `excluded-repos.csv` — repos excluded from deeper mapping for now
- `manual-review-needed.md` — uncertain cases
- `author-aliases.yml` — current author classification assumptions

## Script usage

The scripts run on Node 24+ with built-in TypeScript stripping.

### 1. Prepare repository metadata

Provide a GitHub repository metadata export in JSON.

Examples:

- authenticated GitHub CLI for owner repos:
  - `gh api "/user/repos?per_page=100&affiliation=owner" > /tmp/warrenghaad-repos.json`
- public-only GitHub API fallback:
  - `gh api "/users/warrenghaad/repos?per_page=100&type=owner" > /tmp/warrenghaad-repos.json`

The scripts expect fields like:

- `name`
- `full_name`
- `html_url`
- `private`
- `visibility`
- `archived`
- `fork`
- `size`
- `default_branch`
- `created_at`
- `pushed_at`

### 2. Generate the detailed audit

```bash
node --experimental-strip-types \
  /home/runner/work/StudiOS/StudiOS/system-brain/repo-vitality/scripts/audit-repo-commits.ts \
  --metadata-file /tmp/warrenghaad-repos.json \
  --output-dir /home/runner/work/StudiOS/StudiOS/system-brain/repo-vitality \
  --local-repo-root /home/runner/work/StudiOS/StudiOS
```

### 3. Generate the summary files

```bash
node --experimental-strip-types \
  /home/runner/work/StudiOS/StudiOS/system-brain/repo-vitality/scripts/summarize-audit.ts \
  --audit-file /home/runner/work/StudiOS/StudiOS/system-brain/repo-vitality/repo-commit-audit.json \
  --output-dir /home/runner/work/StudiOS/StudiOS/system-brain/repo-vitality
```

## Current caveats

- Public repositories are inspected from GitHub HTML pages when API commit enumeration is not directly available.
- The private `StudiOS` repo is evaluated from the local clone.
- Author classification is evidence-based but still imperfect when commit authors use multiple aliases or agent-generated commit labels.
