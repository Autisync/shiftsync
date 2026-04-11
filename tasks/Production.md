# Production Strategy

## Current Rule

- Demo/staging receives new architecture and features first.
- Production remains unchanged unless explicitly approved.

## Safe Release Model

1. Implement in feature-flag-safe mode.
2. Validate in local.
3. Validate in demo/staging Supabase project.
4. Run phase analyzer and build checks.
5. Approve and promote to production.

## Required Flags

- VITE_ENABLE_SWAPS
- VITE_ENABLE_LEAVE
- VITE_ENABLE_SHARED_RECOVERY
- VITE_ENABLE_REALTIME

## Required Environment Indicator

- VITE_APP_ENV=local|demo|staging|production

## Pre-Production Checklist

- [ ] New behavior isolated by env/flags
- [ ] Backward-compatible routing and navigation
- [ ] Build and analyzer pass
- [ ] Demo acceptance completed
- [ ] Rollback plan documented

## Note

Do not route unreleased features into production navigation by default.


## Final tasks
- Fix parser  as it does not give user a warming when their schedule breaks the 6/60 rule.
    * Parser gives more turnos then it will actually change - FIX
