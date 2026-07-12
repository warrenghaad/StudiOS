# Repo Commit Vitality Audit

This directory defines the **first-pass vitality filter** for repositories owned by `warrenghaad`.

The goal is **not** to map system functionality yet. The goal is to identify which repositories are worth deeper inspection and which should be excluded (or flagged for manual review) based on evidence.

---

## Purpose

Before organizing cross-repo functionality, we run an evidence-first audit to answer:

> Does each repository contain meaningful work beyond initial/generated/self-scaffold authoring?

This prevents architecture or Notion mapping from including empty shells, archived placeholders, scaffolds, and low-signal repositories.

---

## Scope

This audit evaluates **all accessible repositories under the `warrenghaad` owner**.

For each repository, we capture repository metadata, commit provenance, lightweight tree signals, and a confidence-based classification:

- **Include for functionality audit**
- **Exclude for now**
- **Manual review needed**

---

## Evidence-first rules

1. Do not assume relevance from repo existence alone.
2. Every inclusion/exclusion must include explicit evidence.
3. Prefer **manual review** over false certainty.
4. Do not assign architecture ownership in this phase.
5. Do not merge, move, or delete repositories in this phase.

---

## Classification gates

Repositories should be evaluated through staged gates:

- **Gate 0**: Repo exists
- **Gate 1**: Repo has files
- **Gate 2**: Repo has meaningful commits
- **Gate 3**: Repo has meaningful source files
- **Gate 4**: Repo has described functionality
- **Gate 5**: Repo has inspectable implementation
- **Gate 6**: Repo can run or be truth-tested
- **Gate 7**: Repo has harvestable functionality

Only repos that pass enough evidence thresholds should move into deeper functionality analysis.

---

## Directory contents

This folder is intended to contain:

- `repo-commit-audit.csv`
- `repo-commit-audit.json`
- `inclusion-candidates.csv`
- `excluded-repos.csv`
- `manual-review-needed.md`
- `author-aliases.yml`
- `scripts/audit-repo-commits.ts`
- `scripts/summarize-audit.ts`

---

## Classification criteria

### Include when

- Meaningful source files exist, or
- There are commits beyond initial scaffold, or
- README/replit docs describe real functionality, or
- The repository appears connected to core project themes (e.g., StudiOS, EUCLID, Mesopotamia, geometry, curriculum/tutor systems, Notion/Obsidian, backend orchestration).

### Exclude when

- Repo size is `0` with no meaningful files, or
- Archived and empty, or
- Only initial README/scaffold templates exist, or
- Tutorial/demo/duplicate shell without system relevance.

### Manual review when

- Tiny repo but conceptually important, or
- One meaningful commit with meaningful files, or
- Generated code with uncertain origin, or
- Name suggests relevance but source evidence is weak, or
- Private/inaccessible from automation.

---

## Definition of evidence

Evidence should be concrete and reproducible, such as:

- Commit counts and commit dates
- First vs latest commit deltas
- Distinct author/committer identities
- Presence of meaningful directories (`src/`, `server/`, `client/`, `app/`, `db/`, etc.)
- Presence of nontrivial route/schema/integration/data files
- Nontrivial README/replit descriptions

Avoid using name-only assumptions without file/commit support.

---

## Expected first PR outcome

The first PR for this initiative should answer:

1. Which repos are likely worth auditing further?
2. Which repos are likely empty/scaffold/archive?
3. Which repos have meaningful commits beyond initial creation?
4. Which repos need human review before inclusion?

This is the intake filter for a multi-repo project, not the final architecture map.
