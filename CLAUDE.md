# CLAUDE.md

## Project context

- This is a frontend demo of Homebound's Underwriting App 2.0 for BOOL (Build on Own Lot) infill.
- All data is hardcoded in `src/data/`.
- Markets: DFW, Houston, Tampa, St. Pete, LA.
- Design direction:
  - Black nav (`#0A0A0A`)
  - Neutral grays (no blue-tinted grays)
  - Brand green `#1A6B4A`
- Any portfolio stats must be computed from `src/data`, never hardcoded separately.
- Run `npm run build` after changes to catch type errors.
