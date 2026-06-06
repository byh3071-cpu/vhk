---
vhk_format: 1
type: goal
id: 33
title: vhk today — 저녁 자축·회고(오늘 해낸 것 담백 요약) — P2
status: NOT_STARTED
priority: P2
created: 2026-06-06
depends_on: goal-32-standup
---

# Goal 33: vhk today (저녁 자축·회고)

> 출처: Notion "C1 · vhk today 상세 설계 (저녁 자축·회고)". 전제: Goal 32의 daily 모듈.
> 하루를 마칠 때 `vhk today` 한 번이면 오늘 해낸 것을 담백하게 요약 + 격려. 혼자라서 사라지기 쉬운 성취감을 시스템이 챙긴다.

## 배경 (왜)
- standup(Goal 32)과 한 몸 — 시점·방향만 다르다: standup = 아침·미래(할 일), today = 저녁·과거(한 일·회고).
- 오늘 git 커밋·완료 goal·Dev Log를 모아 "오늘 이만큼 했다"를 보여준다.

## 철학
① 성취 집계 = 단순 카운트(커밋 N·완료 goal N·Dev Log N) — 명확·즉시·오프라인·결정적 ② 게임 요소(streak 등) 안 넣음 — 담백하게 사실만(유치함·부담 방지) ③ AI 의미요약은 v0 제외(LLM 호출 = 비용·지연·비결정적) → 나중 `vhk today --smart` 플래그로 분리 ④ 실행 = 수동 `vhk today`(마감 시점 불규칙) ⑤ **daily 모듈을 Goal 32와 공유**(today 범위 필터).

## 동작 (오늘 집계)
- 데이터 소스: 오늘 git 커밋 / 오늘 완료된 goal / 오늘 Dev Log 기록(결과·교훈).
- `daily` 모듈에 `dayRange(now)`(오늘 00:00~now, KST) 주입 → `TodayReport { commitCount, doneGoalCount, devlogCount, doneGoals, lessons, message }`.
- 출력 = 🎉 해낸 것(카운트 + 항목) + 💬 격려 문구(간단 템플릿 풀에서 랜덤, 톤 절제).

## Completion Check
- [ ] `vhk today`가 오늘 성과 요약(커밋·완료 goal·Dev Log 카운트) + 격려 출력
- [ ] daily 모듈을 Goal 32와 공유(today 범위 필터만 차이, 중복 구현 0)
- [ ] 단순 카운트 — LLM 호출 0(오프라인 동작)
- [ ] today 범위 필터(KST 00:00~now) vitest mock
- [ ] vhk goal sync → check-goal-33.mjs → vhk goal check --id 33 통과
- [ ] 공통 게이트 통과 (typecheck + test + build), 기존 회귀 0

## 제외 범위 (v0)
- streak/게임 요소(담백함 우선) / AI 의미요약(`--smart` 후속) / 마감 시각 자동 알림(Phase 3)

## Mandatory Reading
- goals/32-standup.md (daily 모듈 계약 — 먼저 구현 후 today 범위로 재사용)
- src/lib/date.ts (KST dayRange)
