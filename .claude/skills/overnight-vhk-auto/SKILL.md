---
name: overnight-vhk-auto
description: VHK overnight conductor — pick one goal, run vhk-auto contract, then auto_pr_goal push+PR only (never merge). Triggers - "밤새 vhk-auto", "overnight vhk", "자율 overnight", "큐부터 한 장".
---

# Overnight vhk-auto conductor

One goal per invocation. **Different track from overnight-autoloop** (do not mix).

## Invariants
- **INV-A** Follow `.claude/skills/vhk-auto/SKILL.md` INV-1..INV-9 for the implement loop. Commit only inside that loop (INV-7).
- **INV-B** After green verify + commit, you MAY call `C:\Users\Public\dev\scripts\auto_pr_goal.ps1` with `-BaseBranch main` for push+PR. **Merge = 0.**
- **INV-C** If autonomy-log start or terminal event is missing → write `.vhk/HARD_STOP` and stop.
- **INV-D** No human A/B/C questions — use `docs/roadmap/autonomy-evolution.md` defaults.
- **INV-E** Stop on HARD_STOP, verify 2× red, or open PR reported.

## Loop
0. If `.vhk/HARD_STOP` exists → report and exit.
1. Choose next **NOT_STARTED** card (Wave B: 105→107, or later queue). Do **not** re-run DONE Wave A (101–104). Set frontmatter `IN_PROGRESS`.
2. Run **vhk-auto** loop for that card (including INV-9 autonomy-log).
3. On success (commit done):  
   `powershell -NoProfile -File C:\Users\Public\dev\scripts\auto_pr_goal.ps1 -RepoPath "C:\Users\Public\dev\yohan-ecosystem\vhk" -BaseBranch main ...`  
   Include morning 3 questions in PR body.
4. Optionally generate morning report via `node scripts/gen-autonomy-morning-report.mjs --date YYYY-MM-DD` (Goal 103).
5. Report PR URL (or HARD_STOP reason). **Do not merge.**

## Cross-links
- Runbook: `docs/runbooks/overnight-vhk-auto.md`
- Morning: `docs/runbooks/MORNING_AUTONOMY_MERGE.md`
- RFC: `docs/rfc/0063-overnight-vhk-auto.md`
- Skill SoT for inner loop: `.claude/skills/vhk-auto/SKILL.md` (global = replica)
