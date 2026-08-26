# Changelog

All notable changes are documented here.

## 0.1.0 — 2026-08-26

- Added privacy-aware local Git scanning for normal repositories, bare repositories, linked worktrees, tags, branches, multiline commit bodies, binary changes, and unusual paths.
- Added deterministic UTC activity summaries and author/category/file aggregates.
- Added Conventional Commits parsing and categorization.
- Added deterministic commit clustering with hub-file exclusion.
- Added strict bounds, sanitized errors, package exports, CI, and fresh-package verification.
- Disabled lazy fetches and reject missing reachable objects before scanning.
- Made public ordering locale-independent and bounded clustering to 2,000 commits with union-find/sliding-window component construction.
