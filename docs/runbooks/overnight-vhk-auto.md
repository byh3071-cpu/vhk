# 런북 — overnight-vhk-auto

**하루 goal 1장**을 vhk-auto + PR 래퍼로 돌리는 지휘 절차. overnight-autoloop과 혼용 금지.

## 잠들기 전 (사람, 1회)

1. IDE Approvals = Run Everything (또는 `agent --force`).
2. Wave 문서·카드가 작업 브랜치(또는 머지된 main)에 있는지 확인.
3. 트리거: 스킬 **overnight-vhk-auto** 로드 / 「밤새 vhk-auto 큐부터」.
4. **A/B/C 묻지 말 것** — 로드맵 기본값(`docs/roadmap/autonomy-evolution.md`).

## 루프 (에이전트)

1. `.vhk/HARD_STOP` 있으면 거부.
2. 다음 **NOT_STARTED** id 선택(Wave B: 105→107 등). DONE인 101–104를 다시 돌리지 말 것 → `IN_PROGRESS`.
3. **vhk-auto**(INV-1..INV-9): 구현 → verify → 적대 리뷰 → **commit만**.
4. autonomy-log **start**와 종결(**complete|hardstop|blocked**) 필수. 누락 → HARD_STOP 후 중단.
5. green+commit 이면 (트리가 clean이어도 OK — unpushed면 래퍼가 push+PR):

```powershell
powershell -NoProfile -File C:\Users\Public\dev\scripts\auto_pr_goal.ps1 `
  -RepoPath "C:\Users\Public\dev\yohan-ecosystem\vhk" `
  -BaseBranch main `
  -BranchName "<피처 브랜치>" `
  -Title "<feat: ...>" `
  -Body "<아침 3문답>"
```

   `auto_pr_goal.ps1` 경로: dirty→commit+push+PR / clean+unpushed→push-only+PR / clean+synced→skip.

6. **절대 머지하지 말 것.** PR 오픈 또는 HARD_STOP 후 종료.

## 아침

1. `docs/audits/autonomy-overnight-<date>.md`가 있으면 읽기.
2. `docs/runbooks/MORNING_AUTONOMY_MERGE.md` 3문답.
3. 사람이 머지하거나 거절.

## 교차 링크

- 스킬: `.claude/skills/overnight-vhk-auto/SKILL.md`
- RFC: `docs/rfc/0063-overnight-vhk-auto.md`
- 로드맵: `docs/roadmap/autonomy-evolution.md`
- vhk-auto SoT: `.claude/skills/vhk-auto/SKILL.md`(글로벌 = 복제본)
