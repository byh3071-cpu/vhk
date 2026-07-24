# Runbook — overnight-vhk-auto

Conductor for **one goal per night** using vhk-auto + PR wrapper. Not overnight-autoloop.

## Launch (human, once)

1. IDE Approvals = Run Everything (or `agent --force`).
2. Confirm Wave A docs/cards are on the working branch (or main after merge).
3. Trigger: load skill **overnight-vhk-auto** / say "밤새 vhk-auto 큐부터".
4. **Do not ask A/B/C** — use roadmap defaults (`docs/roadmap/autonomy-evolution.md`).

## Loop (agent)

1. Refuse if `.vhk/HARD_STOP` exists.
2. Pick next NOT_STARTED / queue id → set **IN_PROGRESS**.
3. Follow **vhk-auto** (INV-1..INV-9): implement → verify → adversarial review → commit only.
4. Require autonomy-log **start** at begin and **complete|hardstop|blocked** at end. Missing → create HARD_STOP and stop.
5. On green+commit: run

```
powershell -NoProfile -File C:\Users\Public\dev\scripts\auto_pr_goal.ps1 `
  -RepoPath "C:\Users\Public\dev\yohan-ecosystem\vhk" `
  -BaseBranch main `
  -BranchName "<existing feature branch or new>" `
  -Title "<feat: ...>" `
  -Body "<morning 3 questions>"
```

6. **Never merge.** Stop after open PR or HARD_STOP.

## Morning

1. Read `docs/audits/autonomy-overnight-<date>.md` if present.
2. Follow `docs/runbooks/MORNING_AUTONOMY_MERGE.md` (3 questions).
3. Human merges or rejects.

## Cross-links

- Skill: `.claude/skills/overnight-vhk-auto/SKILL.md`
- RFC: `docs/rfc/0063-overnight-vhk-auto.md`
- Roadmap: `docs/roadmap/autonomy-evolution.md`
- vhk-auto SoT: `.claude/skills/vhk-auto/SKILL.md` (global = replica)
