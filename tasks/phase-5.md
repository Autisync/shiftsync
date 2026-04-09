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
