# PHASE 5 - SWAP WORKFLOW

## Features

- Create request
- Accept / reject
- Status transitions:
  pending -> accepted -> submitted_to_hr -> approved

## Edge Function: process-swap

## Analyzer - Phase 5

Validate:

- Lifecycle is consistent
- No invalid transitions

If any condition fails:
-> Fix before moving to Phase 6
