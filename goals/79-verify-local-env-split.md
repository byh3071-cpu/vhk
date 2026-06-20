---
vhk_format: 1
type: goal
id: 79
title: verify 로컬 환경의존 테스트 분리 — 게이트 신뢰 회복 — P0
status: NOT_STARTED
priority: P0
created: 2026-06-20
leads_to: 로컬 verify가 다시 초록 — 게이트가 신호로서 기능
---

# Goal 79: verify 로컬 환경의존 테스트 분리

> 출처: RFC 0053 §4(D2). 도그푸딩 감사 [D2]. 연계: Goal 47(CI OS/Node 매트릭스).

## 근거 (실측)
- 깨끗한 `main`에서 `pnpm test:run` → **6 파일 7 테스트 실패** (CLAUDE.md "~1758 pass(CI)"와 괴리):
  - `tests/cloud.gh-contract.test.ts`(2) — gh CLI `--method/--input`·`gist --files/--raw` 플래그 존재
  - `tests/exec.test.ts` — safeExecFile Windows .cmd shim(CVE-2024-27980)
  - `tests/context.test.ts` — "모듈 import"
  - `tests/mcp-server.test.ts` — "서버 인스턴스 생성"
  - `tests/start.test.ts` — "start 함수 export"
  - `tests/recall-log.test.ts` — "maxSize trim"
- 패턴 = **환경 의존(gh CLI 버전·Windows shim) + 골격 스모크**. 로컬 verify 상시 빨강 → **늘 빨간 신호등은 무시당한다**(게이트 무력화).

## 동작
- **(선결 조사)** 7개 실패를 "환경 의존 vs 진짜 회귀/flaky"로 분류·기록. 회귀면 별도 수정 goal로 분리(이 goal은 환경 분리만).
- 환경 의존 테스트에 `@env` 태그(vitest describe/test 태그 or 파일 suffix).
- `vhk verify`가 로컬에서 `@env`를 분리 실행해 **"환경 N개 보류"**로 표기하고 핵심 게이트 판정에서 제외(또는 `--profile local|ci`). CI(`profile ci`)는 전체 실행 — 커버리지 불변.

## 수용 기준
- 로컬 `vhk verify`가 환경 문제로는 FAIL하지 않는다(환경 보류로 표기). CI는 전체 테스트를 그대로 실행한다.

## Completion Check (작은 단위)
- [ ] 7개 실패 원인 분류표 작성(환경/회귀) — dev log 또는 troubleshooting 기록
- [ ] (회귀로 판명된 것) 별도 fix goal 발행 — 이 goal 스코프 아웃
- [ ] 환경 의존 테스트 `@env` 태깅(vitest)
- [ ] `vhk verify`: 로컬 `@env` 분리 + "환경 N개 보류" 출력, test 게이트는 env 제외하고 판정
- [ ] CI 경로(`--profile ci` 또는 env flag)는 전체 실행 — 분리 무효화
- [ ] 회귀 테스트 `tests/verify.test.ts`(분리 로직)
- [ ] COMMANDS.md·README(verify 프로파일) 갱신
- [ ] check-goal-79.mjs
- [ ] 공통 게이트 통과, 회귀 0

## Forbidden Actions (OUT)
- CI 테스트 커버리지 축소 0 (로컬만 분리, CI는 전체 — 환경 회피로 진짜 회귀를 숨기지 말 것)
- 테스트 삭제·skip 영구화 0 (분리는 "로컬 보류"이지 "영구 제외" 아님)
- 게이트 통과 기준 약화로 거짓 green 0

## Mandatory Reading
- src/commands/verify.ts · tests/cloud.gh-contract.test.ts · tests/exec.test.ts · tests/mcp-server.test.ts
- goals/47-ci-os-node-matrix.md(CI 매트릭스 정책) · vitest.config / tsup.config
