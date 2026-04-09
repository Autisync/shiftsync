# PHASE 6 - CONSTRAINT ENGINE

## Objective

Implement pure validation engine for scheduling/swap constraints with structured violations and no side effects.

## Scope

### Validation Service

- Pure functions, no DB mutation during validation.
- Rules:
  - max 60 hours/week
  - max 6 consecutive days
  - optional minimum 11h rest behind feature flag

### Output

Return structured result:

{
  valid: boolean,
  violations: Array<{ code: string; message: string; details?: unknown }>
}

## Analyzer - Phase 6

Validate:

- Violations are detected accurately
- No DB writes occur during validation calls
- Optional 11h rule toggles correctly via flag

If any condition fails:
-> Fix before moving to Phase 7
