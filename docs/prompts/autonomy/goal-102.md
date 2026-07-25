# Goal 102 — paste prompt

Implement **Goal 102** (overnight-vhk-auto conductor).

## Acceptance
- `.claude/skills/overnight-vhk-auto/SKILL.md` (+ optional global replica)
- Flow: queue 1 goal IN_PROGRESS → vhk-auto contract → green+commit → `auto_pr_goal.ps1` BaseBranch=main
- Merge forbidden; missing autonomy-log → HARD_STOP
- Cross-link `docs/runbooks/overnight-vhk-auto.md`
- `node scripts/check-goal-102.mjs` passes

## Forbidden
- overnight-autoloop mix-in
- Auto-merge
- Asking humans A/B/C mid-run

## Verify
`VHK_GATES_SKIP_DEEP=1 node scripts/check-goal-102.mjs`
