# PHASE 9 - API ENFORCEMENT PREPARATION

## Objective

Enforce a stable frontend contract layer so Supabase and future HTTP API providers are interchangeable.

## Scope

### Contracts

- Create src/services/contracts for major entities/actions
- Define DTOs for request/response shapes

### Provider Parity

- Ensure SupabaseProvider conforms to contract layer
- Ensure HttpProvider stub conforms to same contracts

### Migration Readiness

- Frontend should not require rewrite when switching to custom backend API

## Analyzer - Phase 9

Validate:

- DTOs exist for major entities/actions
- Provider implementations conform to shared contracts
- No contract leaks from UI into provider internals

If any condition fails:
-> Fix before moving to Phase 10
