# PHASE 6 - CONSTRAINT ENGINE

## Rules

- Max 60 hours/week
- Max 6 consecutive days
- Optional: 11h rest

## Edge Function: validate-swap

- Simulate swap
- DO NOT persist

Return:

```json
{
  "valid": true,
  "violations": []
}
```

## Analyzer - Phase 6

Validate:

- Violations correctly detected
- No DB mutations occur

If any condition fails:
-> Fix before moving to Phase 7
