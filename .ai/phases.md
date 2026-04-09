(The file documents phased execution policy for ShiftSync.)

# ShiftSync Phase Execution Map

## Context

- Existing app: React + Vite + TypeScript
- Current backend: Supabase
- Future target: custom backend API + local Postgres on own server
- Delivery mode: demo/staging first, production unchanged until approval

## Global Guardrails

- Complete one phase at a time.
- Preserve current live behavior unless behind environment or feature flags.
- Keep migrations authoritative for Supabase.
- Keep frontend business logic behind provider/contracts layer.
- Run analyzer at end of each phase and fix failures before moving on.

## Environment Defaults

- local: safe development defaults
- demo/staging: new features, flags enabled as needed
- production: conservative defaults, no unreleased features

## Phase Outcomes

1. Phase 1: data foundation + auth/session/profile loading + provider/repository baseline
2. Phase 2: upload/parser boundaries + consent-driven shared schedule recovery
3. Phase 3: calendar sync abstraction + idempotent diff engine structure
4. Phase 4: swap availability + match ranking panel
5. Phase 5: swap workflow lifecycle + inbox views
6. Phase 6: pure constraint engine service
7. Phase 7: leave workflow + notification abstraction
8. Phase 8: dashboard UX polish and guided flow
9. Phase 9: contracts/DTO enforcement for provider parity
10. Phase 10: realtime subscriptions + notification center scaffold

## Done Criteria per Phase

- Required implementation items completed
- No major regressions in existing flow
- Analyzer checks pass
- Documentation updated for new architecture and operations
