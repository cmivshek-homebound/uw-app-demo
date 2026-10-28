# CLAUDE.md

## Project context

- This is a frontend demo of Homebound's Underwriting App 2.0 for BOOL (Build on Own Lot) infill.
- All data is hardcoded in `src/data/`.
- Markets: DFW, Houston, Tampa, St. Pete, LA.
- Scope is BOOL infill only — no suburban product, filters, or data.
- Design direction:
  - Black nav (`#0A0A0A`)
  - Neutral grays (no blue-tinted grays)
  - Brand green `#1A6B4A`
- Any portfolio stats must be computed from `src/data`, never hardcoded separately.
- Run `npm run build` after changes to catch type errors.

## Design rules

- One Asset model (`src/types`, `src/data/assets.ts`) is the single source of truth; every page reads from it via `selectors.ts`.
- Every displayed number uses `ProvenanceValue` to show whether it's AI-drafted, human-confirmed or overridden, or system-sourced.
- Lot feasibility checks cover the primary plan and ADU fit (setbacks, lot coverage, remaining buildable area).
- Don't add new top-level pages or modules unless asked; extend existing screens instead.
