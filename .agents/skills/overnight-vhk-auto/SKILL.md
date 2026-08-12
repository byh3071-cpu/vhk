---
name: overnight-vhk-auto
description: Use when one VHK goal should run unattended overnight and stop after opening a pull request without merging.
---

# Overnight vhk-auto conductor

One goal per invocation. **Different track from overnight-autoloop** (do not mix).

## Repository wrapper

Use the tracked `scripts/auto_pr_goal.ps1` wrapper after the implementation commit. Its interface is fixed:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/auto_pr_goal.ps1 `
  -RepositoryRoot <repo-root> -BaseBranch main -Title <title> -BodyFile <body-file>
```

Prepare a temporary PR body file that follows `AGENTS.md` and includes the morning review questions. Do not commit that file.

## Invariants
- **INV-A** Follow `.agents/skills/vhk-auto/SKILL.md` INV-1..INV-9 for the implement loop. Commit only inside that loop (INV-7).
- **INV-B** After green verify + commit, call `scripts/auto_pr_goal.ps1`. **Merge = 0.** Never push `main`, force-push, publish, or change branch protection.
- **INV-B2** The `autonomous` label is attached idempotently by that script on both create and reuse paths (Goal 111 cohort secondary signal). Never add or remove it by hand — the primary signal is the terminal-SHA join, and signal mismatch is quarantined as `unknown`.
- **INV-C** If autonomy-log start or terminal event is missing → write `.vhk/HARD_STOP` and stop.
- **INV-D** Use the release order in `docs/roadmap/2.x-roadmap.md` and acceptance criteria in `docs/PRD-2.x.md`. Do not invent a queue from old Goal numbers.
- **INV-E** Stop on HARD_STOP, verify 2× red, or open PR reported.

## Loop
0. If `.vhk/HARD_STOP` exists → report and exit.
1. Run `vhk goal next` and select only the Goal it reports. If none is available or dependencies block it, report and stop.
2. Run **vhk-auto** loop for that card (including INV-9 autonomy-log).
3. On success, require a clean worktree and a current branch other than `main`.
4. Call `scripts/auto_pr_goal.ps1` with the repository root, base branch `main`, PR title, and temporary PR body file.
5. Report the PR URL (or HARD_STOP reason). **Do not merge.**

## Cross-links
- RFC: `docs/rfc/0063-overnight-vhk-auto.md`
- Skill SoT for inner loop: `.agents/skills/vhk-auto/SKILL.md`
- Work order: `docs/roadmap/2.x-roadmap.md`
- Acceptance criteria: `docs/PRD-2.x.md`
