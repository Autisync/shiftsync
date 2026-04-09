# PHASE 4 - SWAP AVAILABILITY + MATCHING

## Objective

Enable shift availability and produce useful match suggestions with clear ranking in UI.

## Scope

### Availability

- Open/close availability for user-owned shifts.
- Respect auth and ownership boundaries.

### Matching Engine

- Implement matching strategies:
  1. exact same date/time
  2. overlap
  3. same day fallback
- Add ranking utility and score rationale.

### UI

- Add clean match results panel.
- Include empty and no-match states.

### Feature Safety

- Gate swap features using VITE_ENABLE_SWAPS.

## Analyzer - Phase 4

Validate:

- Availability toggles are persisted correctly
- Match results are relevant and ranked correctly
- No unauthorized shift exposure
- UI handles empty/error/loading states

If any condition fails:
-> Fix before moving to Phase 5
