# 다음 작업 (next-task)

> "지금 무엇부터"의 상태 SoT. 버전·테스트 등 사실값은 package.json·CHANGELOG가 SoT.

**갱신:** 2026-06-05
**Phase:** v2.3.2 발행 완료 — 앞단(검증→배포) 발행 라인 종료.

## 다음 할 일
- 앞단(코어 CLI) 추가 액션 없음.
- 진행 중(미발행): `vhk work` / `vhk work handoff`
  - 브랜치: feat/vhk-work-session-handoff ([Unreleased])
  - 다음: 버전 범프 → main 머지 → 발행
- 뒷단 로드맵 = Goal 21~24 (launch·content·sell·ops) → docs/state/roadmap.md 참조

## 블로커
- 없음

## 주의
- publish는 항상 main에서만 (가드 #119)
- active goal 은 goals/ 기준 동적 계산 (vhk work / vhk goal next)
