# PHASE 7 - LEAVE REQUESTS + HR AUTOMATION PREP

## Objective

Deliver leave workflow and notification abstraction without coupling transport logic to UI.

## Scope

### Leave Workflow

- Create leave request UI and service
- Validate conflicts against shifts/swap constraints
- Support status transitions:
  - pending -> approved
  - pending -> rejected

### Notification Abstraction

- Introduce HR notification abstraction service
- Use stub or Supabase-trigger-friendly wiring for now
- Do not hardcode email transport in frontend components

### Feature Safety

- Gate leave workflow with VITE_ENABLE_LEAVE

## Analyzer - Phase 7

Validate:

- Leave request creation and transition rules are correct
- Conflict validation works
- Notification abstraction is invoked through service contracts
- No UI hard dependency on specific email provider

If any condition fails:
-> Fix before moving to Phase 8
