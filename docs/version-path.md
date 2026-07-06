# STUDiOS Version Path

This document defines how STUDiOS projects move from early experiments into stable versions.

## What a version means

A version is a named stage in the life of a project, not only a software release number.

In STUDiOS, a version should communicate:

- how mature the idea is
- whether the project is still exploratory or becoming stable
- whether it should be used as a current trunk, a working branch, or a historical reference

## Suggested maturity path

### 1. Idea

The project exists as a concept, note, repo shell, or experiment.

### 2. Prototype

The project demonstrates a usable direction, but the structure is still changing quickly.

### 3. Working Build

The project supports active learning, testing, or content production and is part of current workflow.

### 4. Stable Build

The project has a clear role, consistent naming, and a defined relationship to the wider ecosystem.

### 5. Legacy / Archived

The project is no longer the current version, but it remains useful for reference, migration, or comparison.

## Promotion rules

Move a project forward when it has:

- a clear purpose
- a named category
- a documented next step
- a known relationship to other repos
- enough structure to avoid duplicate effort

## Version naming guidance

- keep a single current project when possible
- use `v2`, `v3`, or other suffixes only when they reflect a real generational shift
- archive earlier versions once a later version clearly becomes the active one
- record the replacement relationship in `/docs/project-index.md`

## STUDiOS tracking rule

Every project in the inventory should show:

- current status
- next step
- whether it is active, review, paused, or archived
- whether it is the current version or a legacy version
