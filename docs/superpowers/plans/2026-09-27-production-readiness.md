# Production Readiness Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Independent reviewers inspect game input and rendering while the main worker handles data loading, fixes and browser verification.

**Goal:** Verify and harden the existing static portfolio for release without redesigning it or publishing changes.

**Architecture:** Retain vanilla JavaScript, the five existing game simulations, separate Three.js views and the 2D fallback. Use Node's built-in test runner for reproducible data, input and renderer checks without adding runtime dependencies.

**Tech Stack:** HTML, CSS, JavaScript, vendored Three.js 0.186.1, GitHub Pages.

**Spec:** The user's September 27 production-readiness request: inspect the entire repository, reproduce defects, implement focused fixes, verify runtime and production assets, and report remaining limitations honestly.

## Global Constraints

- Preserve the current visual direction, project names and game rules.
- No speculative rewrites, major dependency upgrades or weakening security checks.
- No deployment, commit or push as part of this review.

## Review Focus

- Offline, rate-limited or stalled GitHub requests must recover without a permanent loading state.
- Restricted storage and malformed external/cache data must not break valid project cards.
- Hidden tabs, lost keyboard focus and unrelated keys must not advance or restart a game.
- Full Snake boards and interrupted graphics contexts must recover without freezing or blank previews.
- Phone/landscape layouts and keyboard-only navigation must remain usable.

## Tasks

- [x] Add regression tests for project response validation, storage failures, request timeouts and safe URLs; harden `script.js` and project status markup.
- [x] Add controller tests for input/pause/food placement; apply verified state and accessibility fixes in `script.js`, `index.html` and `styles.css`.
- [x] Add renderer tests for object identity, context recovery and visibility; fix confirmed issues in both portal modules.
- [x] Verify vendored dependency integrity, syntax, local references and static deployment assumptions; document repeatable verification commands in `README.md`.
- [x] Run all tests and serve the exact production files; check all games, navigation, project refresh, Help, resume and contact links across desktop/tablet/mobile.
- [x] Review the final diff, rerun checks and record results and deployment limitations in the final report.
