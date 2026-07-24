---
rfc: 0063
title: Overnight vhk-auto conductor (wrapper PR path)
status: Draft
created: 2026-07-25
relates: 0054, 0052
---

# RFC 0063 — Overnight vhk-auto conductor

## Problem

`vhk-auto` INV-7 forbids push/PR/merge. Without a thin overnight wrapper, autonomy runs never surface as reviewable PRs. `overnight-autoloop` is a **different track** (mcp/control-tower defects) and must not be mixed.

## Decision

1. **INV-7 stays** on `.claude/skills/vhk-auto` — commit only inside the goal loop.
2. **overnight-vhk-auto** (skill + runbook) may call `scripts/auto_pr_goal.ps1` **after** verify green + commit, with `BaseBranch=main`.
3. **Merge = 0** — humans only, via morning checklist.
4. Missing autonomy-log start/complete (INV-9) → **HARD_STOP**, stop the night.
5. No human A/B/C prompts mid-run — use plan defaults.

## Non-goals

- Auto-merge, force-push, git config changes.
- 2-stage CLI `vhk auto` (RFC 0054 D2 later).
- Closing #373 before sample N≥5 complete.

## Interface sketch

```
queue = [101,102,103,104]  # Wave A; later Wave B cards
for goal in queue:
  if HARD_STOP exists: break
  mark IN_PROGRESS
  run vhk-auto contract for that goal
  require autonomy-log start + terminal event
  if green+commit: auto_pr_goal.ps1 (no merge)
  else: HARD_STOP / blocked → stop
```

## Status

Draft — landed with Wave A docs/skills. Promote to Accepted after one successful overnight PR cycle.
