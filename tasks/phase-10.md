# PHASE 10 - REALTIME + NOTIFICATIONS

## Objective

Add practical realtime updates and notification center scaffolding with deduped client behavior.

## Scope

### Realtime

Use Supabase realtime where practical for:

- swap request updates
- leave request updates
- schedule recovery availability

### Notifications

- Add notification center scaffold in UI
- Deduplicate notifications client-side
- Respect feature flags and environment mode

### Feature Safety

- Gate realtime with VITE_ENABLE_REALTIME

## Analyzer - Phase 10

Validate:

- Targeted realtime updates render without refresh
- Duplicate notifications are suppressed
- Notifications are scoped to correct user context
- Production-safe defaults are preserved

If any condition fails:
-> Fix before completion

## Final Objective

Deliver an incremental, production-minded SaaS architecture where:

- Supabase powers current backend
- provider/contracts isolate backend dependencies
- demo/staging receives new behavior first
- production remains stable until explicit approval
- migration to custom backend/API later requires provider swap, not UI rewrite
