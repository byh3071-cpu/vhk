---
vhk_format: 1
type: goal
id: 7
title: 모든 goal에 게이트 스크립트 자동 생성
status: DONE
priority: P0
completed: 2026-06-01
---

# Goal 7: check 스크립트 전체 goal 생성

> 출처: 2026-05-31 VHK A/B 미니 해커톤 dogfood (vhk-project- / cafe-with-vhk).
> 자기개선 배치 — 자세한 공통 규칙은 `goals/_meta-self-improve.md` 참조.

## 배경 (왜)
실험에서 goal 8개를 등록했으나 `check-goal-*.sh`가 0~3만 생성됨.
4~7은 스크립트가 없어 `vhk goal check/done`을 못 쓰고 VHK 밖
(`npm run lint/build`)에서 마무리 → harness가 절반만 작동.

## 변경 대상 (어디) [추론]
- goal 동기화/생성 로직 (goals/*.md → .vhk/ 게이트 스크립트 매핑)
- 신규 백필 명령 `vhk goal sync`

## 동작
- `goals/*.md`를 SoT로, goal id마다 `check-goal-{id}` 스크립트 자동 스캐폴드
- 기본 게이트 = lint + typecheck + build
- 이미 있으면 덮어쓰지 않음(idempotent), 없는 것만 백필

## Completion Check
- [ ] goal N개 → check 스크립트 N개 생성 확인
- [ ] `vhk goal sync`로 누락분 백필
- [ ] 기존 0~3 스크립트 보존(덮어쓰기 없음)
- [ ] 공통 게이트 통과

## Mandatory Reading
- goals 설계 문서 (goal file format SoT)
- 기존 check-goal-0~3 스크립트 구현
