# Goal 103 — paste prompt

Implement **Goal 103** (autonomy morning report).

## Acceptance
- Template + helper writing `docs/audits/autonomy-overnight-<date>.md`
- Fields: PR URL, runId, complete / hardstop / blocked counts
- `node scripts/check-goal-103.mjs` passes

## Forbidden
- Fake sample rates; inventing PR URLs
- Auto-merge

## Verify
`VHK_GATES_SKIP_DEEP=1 node scripts/check-goal-103.mjs`
