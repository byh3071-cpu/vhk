---
rfc: 0063
title: Overnight vhk-auto conductor (wrapper PR path)
status: Draft
created: 2026-07-25
relates: 0054, 0052
---

# RFC 0063 — Overnight vhk-auto conductor

## 문제

`vhk-auto` INV-7은 push/PR/머지를 금지한다. overnight 래퍼가 없으면 자율 런이 리뷰 가능한 PR로 표면화되지 않는다. `overnight-autoloop`은 **다른 트랙**(mcp/관제탑 결함)이며 혼용하면 안 된다.

## 결정

1. `.claude/skills/vhk-auto`의 **INV-7 유지** — goal 루프 안에서는 commit만.
2. **overnight-vhk-auto**(스킬+런북)는 verify green + commit **이후**에만 `scripts/auto_pr_goal.ps1`을 `BaseBranch=main`으로 호출할 수 있다.
   래퍼는 commit 직후 **clean tree + unpushed**(origin/base 대비 ahead)여도 push+PR 한다(push-only 경로).
3. **머지 = 0** — 사람만, 아침 체크리스트 경유.
4. autonomy-log start/종결(INV-9) 누락 → **HARD_STOP**, 그날 밤 중단.
5. 런 중 사람에게 A/B/C 묻지 않음 — 플랜 기본값 사용.

## 비범위

- 자동 머지, force-push, git config 변경.
- 2단계 CLI `vhk auto`(RFC 0054 D2 이후).
- 표본 complete N≥5 전에 #373 닫기.

## 인터페이스 스케치

```text
queue = NOT_STARTED cards (Wave B: 105.. ; not DONE 101-104)
for goal in queue:
  if HARD_STOP exists: break
  mark IN_PROGRESS
  run vhk-auto contract for that goal
  require autonomy-log start + terminal event
  if green+commit: auto_pr_goal.ps1 -BaseBranch main (clean+unpushed => push-only; no merge)
  else: HARD_STOP / blocked → stop
```

## 상태

Draft — Wave A 문서/스킬과 함께 착륙. overnight PR 사이클 1회 성공 후 Accepted 승격.
