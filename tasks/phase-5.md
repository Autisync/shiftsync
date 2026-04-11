# PHASE 5 - SWAP WORKFLOW

## Objective

Complete end-to-end swap request workflow with guarded transitions and inbox-style UX.

## Scope

### Workflow

- Create swap request
- Accept/reject request
- Guard status transitions:
  - pending -> accepted
  - pending -> rejected
  - accepted -> submitted_to_hr
  - submitted_to_hr -> approved

### Auditability

- Ensure audit-friendly timestamps and status history metadata.

### UI

- Requester inbox view
- Target inbox view
- Clear status badges and feedback

## Analyzer - Phase 5

Validate:

- Lifecycle is consistent and guarded
- Invalid transitions are blocked
- Requester and target views show correct state
- Build and flow remain stable behind feature flag

If any condition fails:
-> Fix before moving to Phase 6

## Implementation Status

- Completed: `src/features/swaps/services/swap-workflow.ts`
  - Added guarded lifecycle transitions and action policy by inbox role.
- Completed: `src/components/swaps/swap-availability-panel.tsx`
  - Added create-swap-request flow from ranked matches.
  - Added requester and target inbox views.
  - Added status badges, action buttons, and user feedback.
- Completed: backend and model auditability
  - Updated `src/services/backend/supabase-provider.ts` to enforce transition guard before status updates.
  - Added actor-aware status updates and status history append logic.
  - Added audit timestamp fields and status history mapping in domain/mappers.
  - Added migration `supabase/migrations/20260411091500_phase5_swap_workflow_audit.sql`.

## Analyzer Results - Phase 5

- Lifecycle is consistent and guarded: PASS
  - Enforced by `assertSwapStatusTransition` before persistence.
- Invalid transitions are blocked: PASS
  - Covered by `tests/swaps/swap-workflow.test.ts`.
- Requester and target views show correct state: PASS
  - Implemented in inbox sections and covered by `tests/ui/swap-availability-panel.test.tsx`.
- Build and flow remain stable behind feature flag: PASS
  - Swaps surface remains mounted only when `isSwapsEnabled()` is true.

## Validation Evidence

- Test command:
  - `npm test -- tests/swaps/swap-workflow.test.ts tests/swaps/swap-matching.test.ts tests/ui/swap-availability-panel.test.tsx tests/calendar/phase3-smoke.test.ts tests/calendar/calendarDiff.test.ts tests/calendar/reconciliation-anomaly-logs.test.ts tests/calendar/shift-uid-normalization.test.ts`
- Result:
  - `Test Files  7 passed (7)`
  - `Tests  28 passed (28)`
