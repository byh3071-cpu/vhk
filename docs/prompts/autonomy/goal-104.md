# Goal 104 — paste prompt

Implement **Goal 104** (autonomy stats section).

## Acceptance
- `calcAutonomyStats(readAutonomyLog)` — sample 0 → honest empty (no fake 0%)
- `vhk stats` and/or `--trend` shows autonomy completion section
- TDD tests under `tests/autonomy-stats*` or stats tests
- `node scripts/check-goal-104.mjs` passes

## Forbidden
- Closing #373 early
- Disguising empty log as 0% success

## Verify
`VHK_GATES_SKIP_DEEP=1 node scripts/check-goal-104.mjs` + `pnpm test:run`
