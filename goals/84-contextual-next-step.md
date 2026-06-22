---
vhk_format: 1
type: goal
id: 84
title: doctor/status next-step 맥락 인지 — 신규 vs 기존 레포 분기 — P2
status: DONE
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
- [x] 판정 헬퍼 — `src/lib/project-maturity.ts`: `classifyMaturity`(순수) + `gatherMaturitySignals`(.vhk/context 존재 OR 커밋수≥5) + `projectMaturity`(cwd 래퍼)
- [x] 기존 레포 분기 — doctor all-OK: `vhk 시작` 대신 `vhk work`("이어서 작업"). status clean: 변경 있으면 diff / 없으면 goal next(established 유지)
- [x] 신규 레포 분기 — doctor/status 모두 new → 기존 온보딩(`vhk 시작`) 보존(퇴행 0)
- [x] printNextStep 패턴·이중 안내(터미널/Cursor) 유지(분기 함수가 같은 shape 반환)
- [x] 회귀 테스트 `tests/project-maturity.test.ts` — 분류 3 + doctor 2 + status 4(established/new/diff/하위호환)
- [x] COMMANDS.md·README — next-step 문구만 변경(사용법 불변)이라 갱신 불요
- [x] check-goal-84.mjs
- [x] 공통 게이트 통과, 회귀 0

## 구현 노트 (선조사)
- 카드 premise 대체로 정확. 단 **status 는 과장**: clean 시 이미 `vhk goal next`(established 적절) — `vhk 시작` 온보딩 아님. 진짜 D9 는 **doctor**(`ko.doctor.nextOkMessage`="이제 프로젝트를 시작하세요" + `vhk 시작`)가 396커밋 레포에도 떴던 것. doctor 가 핵심 수정, status 는 new-repo 케이스 보강(온보딩).
- 판정 신호: `.vhk/context.md` 존재(vhk 사용 흔적) OR 커밋수≥5(`ESTABLISHED_COMMIT_THRESHOLD`). gitOut 재사용(신규 execSync 0).
- 라이브: 이 레포(396+커밋)에서 `vhk doctor` → "환경 점검 통과 — 이어서 작업하세요 / vhk work".

## Forbidden Actions (OUT)
- 신규 사용자 온보딩 경험 퇴행 0 (기존 멘트는 신규 레포에서 유지)
- doctor/status 진단 항목 자체 변경 0 (next-step 분기만)

## Mandatory Reading
- src/commands/doctor.ts · src/commands/status.ts · src/lib/(printNextStep 헬퍼)
