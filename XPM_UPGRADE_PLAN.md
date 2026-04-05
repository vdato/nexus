# Log Quality & Minimalist UI Refinement

This plan aims to resolve the messy TTY output (m-prefix artifacts, spinner spam) and provide a polished, minimalist dashboard experience.

## Objectives
- **Fix Log Quality:** Remove cursor artifacts ('m' characters) and spinner spam while preserving syntax coloring.
- **Minimalist Mode:** Add a toggle for a compact, monospace UI.

## Proposed Changes

### 1. Server-side Log Cleaning (server.js)
Refine `appendLog` to:
- Correctly handle carriage returns (`\r`).
- Strip non-color ANSI codes (movement/clearing).
- Robustly filter spinner frames.

### 2. Frontend Enhancements
- Integrate `ansi_up` properly across all log components.
- Implement "Compact Mode" toggle and styling.
- Auto-scroll for logs.

# Current Progress
- [x] Initial node-pty integration.
- [x] Basic stdin support with \r.
- [x] Log cleaning (v2 — carriage return handling, non-color ANSI stripping, robust spinner regex).
- [x] Minimalist UI mode (Compact Mode toggle in header, persisted to localStorage).
