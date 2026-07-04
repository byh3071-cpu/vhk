---
vhk_format: 1
type: goal
id: 93
title: ecosystem.mdc 정체성 모순 제거 — "Claude Code = primary" → 실행/트리거 계층 분리 — P2
status: DONE
priority: P2
created: 2026-07-04
completed: 2026-07-04
leads_to: RFC 0057(에이전트 불가지론) 실측 감사가 확정한 3항목 중 트랙① 완결 — 트랙②(receipt agent 필드)·트랙③(트리거 격차 문서화)는 별도 goal/트랙에서 병렬 진행
---

# Goal 93: ecosystem.mdc 정체성 모순 제거

> 출처: RFC 0057 실측 감사(2026-07-03, docs/state 최상단 Phase 기록) — "트리거계층 CC전용·
> `ecosystem.mdc` 모순문구·receipt agent필드 없음" 3항목 확정 중 첫 번째 항목의 구현 트랙.

## 근거 (실측)

- `src/templates/ecosystem-mdc.ts`가 `vhk inject-bootstrap` 실행 시 매 신규 프로젝트에
  `.cursor/rules/ecosystem.mdc`를 생성하는데, 그 1번 항목이 "Claude Code = primary —
  handoff, release-gate, epic architecture, vhk-auto는 Claude-only (yohan-cc-skills)."
  라고 못박혀 있었다.
- VHK 자신의 정체성은 "어떤 AI 에이전트가 와도 안 무너지는 풀사이클 하네스"
  (기억: vhk-identity-full-cycle-agnostic) — VHK 코드가 만드는 산출물이 이 모순을
  매번 새 프로젝트에 주입하는 셈이었다.
- 실측 결과 실제로 에이전트 종속인 건 **트리거 계층**(SessionStart/Stop 훅·`vhk-auto`,
  `yohan-cc-skills` 의존)뿐 — **실행 계층**(vhk 명령 자체)은 어떤 에이전트가 실행하든
  동일하게 동작한다. 기존 문구는 이 둘을 뭉뚱그려 "Claude Code = primary"라 선언해
  실제 아키텍처보다 좁고 부정확하게 표현하고 있었다.

## 동작

`ECOSYSTEM_MDC_TEMPLATE()`의 1번 항목을 실행/트리거 2단계로 분리하고, 기존 2~5번 항목은
내용 변경 없이 번호만 3~6으로 이동:

1. 실행 계층(vhk 명령)은 에이전트 무관.
2. 트리거 계층(훅·`vhk-auto`)은 현재 Claude Code 전용 — 격차 해소 로드맵(RFC 0057)을 명시해
   "은폐"가 아니라 "정직한 현황 표기 + 로드맵 포인터"로 정정.
3~6. 기존 Cursor/Cross-repo/Concurrency/Derived files 항목 그대로.

`ECOSYSTEM_MDC_VERSION`을 `'1'`→`'2'`로 올려 기존 프로젝트도 `vhk inject-bootstrap --force`
실행 시 갱신 대상으로 인식되게 한다(`isCurrentEcosystemMdc()`가 이 상수를 마커 비교에
직접 재참조하므로 별도 하드코딩 비교 코드 수정은 불필요 — grep으로 확인).

## Completion Check

- [x] `ECOSYSTEM_MDC_TEMPLATE()` 1번 항목이 "실행 계층(vhk 명령)은 에이전트 무관" 포함
- [x] 템플릿 전체에서 "Claude-only" 문구 완전 제거(회귀 테스트로 부재 단언)
- [x] `ECOSYSTEM_MDC_VERSION`이 `'2'`(기존 프로젝트 `--force` 갱신 인식용)
- [x] 기존 2~5번 항목 내용 보존, 번호만 3~6으로 이동(회귀 없음)
- [x] 기존 테스트(`tests/inject-bootstrap.test.ts`·`tests/init.test.ts`·
      `tests/init-core-rules-warn.test.ts`) 전부 회귀 없이 통과
- [x] 공통 게이트(_meta) + `check-goal-93.mjs`(고유 검증으로 채움)

## 구현 결과 (2026-07-04)

- `src/templates/ecosystem-mdc.ts` — `ECOSYSTEM_MDC_VERSION` `'1'`→`'2'`, 1번 항목을
  2개 항목(실행 계층 / 트리거 계층)으로 분리, 기존 2~5번은 번호만 3~6으로 재배치(내용 그대로).
- `isCurrentEcosystemMdc()`(`src/lib/inject-bootstrap.ts:37-42`)는 `ECOSYSTEM_MDC_VERSION`
  상수를 마커 문자열 비교에 직접 재참조 — 버전 비교 로직 별도 수정 불필요. 레포 전체
  `ECOSYSTEM_MDC_VERSION`/`ECOSYSTEM-MDC` grep으로 다른 하드코딩된 `v1` 리터럴 비교 코드가
  없음을 확인(유일한 `'1'` 리터럴은 정의 자체였음).
- `tests/inject-bootstrap.test.ts` — TDD RED→GREEN으로 신규 회귀 테스트 1개 추가(신규 문구
  포함 단언 + "Claude-only" 부재 단언). 수정 전 실행해 실패(RED) 확인 후 구현 반영.

### TDD 로그

RED: `generateEcosystemMdcContent()`가 "실행 계층(vhk 명령)은 에이전트 무관"을 포함하는지와
"Claude-only"가 없는지를 단언하는 테스트를 먼저 추가 → 기존 코드 기준 1개 실패(4개는 그대로
통과) 확인. GREEN: `ecosystem-mdc.ts` 수정 후 재실행 → `inject-bootstrap.test.ts`(5개)·
`init.test.ts`·`init-core-rules-warn.test.ts` 전부(53개) 통과.

### 게이트

`pnpm exec tsc --noEmit`·`pnpm build`·`pnpm lint` clean. `pnpm test:run` 2213/2214 pass —
유일한 실패 1건은 `tests/gen-goals-index.test.ts`("커밋된 goals/README.md == 재생성 결과")로,
이 goal 파일(93) 신규 등록에 따른 **예상된** 드리프트다. 이 goal의 Forbidden Actions에 명시된
대로 `goals/README.md`는 의도적으로 갱신하지 않았다(RFC 0057 병렬 3트랙 병합 후 메인 세션이
한 번에 재생성 예정 — 지금 갱신하면 다른 트랙과 병합 충돌). goal 93 고유 검증(`check-goal-93.mjs`)
자체는 `VHK_GATES_SKIP_DEEP=1`·전체 모드 모두 green.

## Forbidden Actions (OUT)

- `description`/제목의 "(Cursor-only)" 문구 및 최상단 타이틀 변경 금지 — 이 goal 스코프는
  1번 항목(에이전트 계층 구분)에 한정, 문서 전체 리브랜딩은 별도 논의 필요.
- `goals/README.md` 갱신 금지 — 메인 세션이 RFC 0057 병렬 트랙 전체 병합 후 한 번에 재생성.
- 레포 자체 `.cursor/rules/ecosystem.mdc`(이미 커밋된 산출물 파일) 재생성 금지 — 갱신하려면
  `vhk inject-bootstrap --force`를 실행해야 하는데 이는 다른 tier-S 파일도 함께 덮어쓰는
  부작용이 있어 이 goal 범위 밖(사람 판단 필요, 별도 후속 작업).
- RFC 0057 트랙②(receipt agent 필드)·트랙③(트리거 격차 문서화) 구현 금지 — 독립 트랙.

## Mandatory Reading

`src/templates/ecosystem-mdc.ts` · `src/lib/inject-bootstrap.ts` ·
`tests/inject-bootstrap.test.ts`
