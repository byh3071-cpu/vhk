---
vhk_format: 1
type: goal
id: 84
title: doctor/status next-step 맥락 인지 — 신규 vs 기존 레포 분기 — P2
status: NOT_STARTED
priority: P2
created: 2026-06-20
leads_to: "다음에 이것만 하세요"가 현재 상태에 맞음
---

# Goal 84: doctor/status next-step 맥락 인지

> 출처: RFC 0053 §4(D9). 도그푸딩 감사 [D9].

## 근거 (실측)
- 396커밋·활성 레포에서 `vhk doctor` 통과 → next-step이 *"환경 점검 통과! 이제 프로젝트를 시작하세요 → vhk 시작 / 프로젝트 만들어줘"*.
- `vhk status`도 유사하게 신규 사용자 멘트. **현재 상태(커밋 수·변경 유무·활성도)를 안 보고** 온보딩 멘트를 뱉음 → 안내 신뢰도 저하.

## 동작
- doctor/status의 `printNextStep`이 git 커밋 수·변경 상태로 **신규 vs 기존 레포**를 판정.
- 기존 레포면 "시작" 대신 맥락 맞는 다음 행동(예: 변경 있으면 diff/save, 없으면 work/goal).

## 수용 기준
- 활성 레포에서 "프로젝트를 시작하세요" 멘트가 안 나온다. 신규(빈/초기) 레포에선 기존 온보딩 멘트 유지(퇴행 0).

## Completion Check (작은 단위)
- [ ] doctor/status가 커밋 수(또는 .vhk/context 존재)로 신규/기존 판정 헬퍼
- [ ] 기존 레포 분기: 변경 유무에 따른 맥락 next-step
- [ ] 신규 레포 분기: 기존 온보딩 멘트 보존
- [ ] printNextStep 패턴·이중 안내(터미널/Cursor) 유지
- [ ] 회귀 테스트(신규/기존 각 분기 출력 단언)
- [ ] COMMANDS.md·README 영향 시 갱신
- [ ] check-goal-84.mjs
- [ ] 공통 게이트 통과, 회귀 0

## Forbidden Actions (OUT)
- 신규 사용자 온보딩 경험 퇴행 0 (기존 멘트는 신규 레포에서 유지)
- doctor/status 진단 항목 자체 변경 0 (next-step 분기만)

## Mandatory Reading
- src/commands/doctor.ts · src/commands/status.ts · src/lib/(printNextStep 헬퍼)
