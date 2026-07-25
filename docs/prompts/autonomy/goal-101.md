# Goal 101 — paste prompt

Implement **Goal 101** (global vhk-auto ← repo SoT sync, INV-9).

## Acceptance
- Copy `.claude/skills/vhk-auto/SKILL.md` → `~/.claude/skills/vhk-auto/SKILL.md`
- Global file contains **INV-9** / autonomy-log hooks
- Docs note: skill SoT = repo; global = replica
- `node scripts/check-goal-101.mjs` passes (with VHK_GATES_SKIP_DEEP=1 ok for fast)

## Forbidden
- Changing INV-7 (commit-only inside vhk-auto)
- Auto-merge / force-push / secrets commit
- Mixing overnight-autoloop

## Verify
`VHK_GATES_SKIP_DEEP=1 node scripts/check-goal-101.mjs` then full verify before PR.
