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

## Implementation Status

- Completed: `src/features/swaps/services/swap-matching.ts`
  - Added deterministic strategy selection (`exact`, `overlap`, `same_day`).
  - Added ranked scoring + rationale generation for each match candidate.
- Completed: `src/components/swaps/swap-availability-panel.tsx`
  - Added availability open/close actions for authenticated user-owned shifts.
  - Added ranked match list rendering.
  - Added loading, error, empty, and no-match states.
- Completed: `src/components/home.tsx`
  - Added `isSwapsEnabled()` gated rendering for swaps panel.

## Analyzer Results - Phase 4

- Availability toggles are persisted correctly: PASS
  - Validated through panel flow using backend swap operations (`openAvailability` / `closeAvailability`) and reflected UI state updates.
- Match results are relevant and ranked correctly: PASS
  - Covered by `tests/swaps/swap-matching.test.ts`.
- No unauthorized shift exposure: PASS
  - Panel fetches current user shifts and applies ownership filtering before availability actions.
- UI handles empty/error/loading states: PASS
  - Covered by `tests/ui/swap-availability-panel.test.tsx`.

## Validation Evidence

- Test command:
  - `npm test -- tests/swaps/swap-matching.test.ts tests/ui/swap-availability-panel.test.tsx tests/calendar/phase3-smoke.test.ts tests/calendar/calendarDiff.test.ts tests/calendar/reconciliation-anomaly-logs.test.ts tests/calendar/shift-uid-normalization.test.ts`
- Result:
  - `Test Files  6 passed (6)`
  - `Tests  24 passed (24)`
