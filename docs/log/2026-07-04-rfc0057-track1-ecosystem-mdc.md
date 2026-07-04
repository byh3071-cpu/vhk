# 2026-07-04 — RFC 0057 트랙① `ecosystem.mdc` 정체성 모순 제거 (goal 93)

> append-only. 추가만, 수정·삭제 금지.

## 한 일

격리된 git worktree(`worktree-agent-ac674fab0bda63015`)에서 RFC 0057 실측 감사가 확정한
3항목 중 트랙①(`ecosystem.mdc` 모순 문구)을 TDD로 해결. goal 93 정식 등록 + 전체 게이트 실행.

## 배경

`src/templates/ecosystem-mdc.ts`가 `vhk inject-bootstrap` 실행 시 매 신규 프로젝트에
`.cursor/rules/ecosystem.mdc`를 생성하는데, 1번 항목이 "Claude Code = primary — handoff,
release-gate, epic architecture, vhk-auto는 Claude-only (yohan-cc-skills)."라고 못박혀
있었다. VHK 자신의 정체성은 "어떤 AI 에이전트가 와도 안 무너지는 풀사이클 하네스"인데, VHK
코드가 만드는 산출물이 이 모순을 매번 새 프로젝트에 주입하는 셈이었다 — VHK가 스스로
생성하는 문서가 스스로의 정체성과 정면 충돌하는 구조적 문제.

실측 확인 결과 실제로 에이전트에 종속된 건 **트리거 계층**(SessionStart/Stop 훅·
`vhk-auto`, `yohan-cc-skills` 의존)뿐이고, **실행 계층**(vhk 명령 자체)은 어떤 에이전트가
실행하든 동일하게 동작한다. 기존 문구는 이 둘을 구분하지 않고 "Claude Code = primary"로
뭉뚱그려 실제보다 좁고 부정확하게 표현했다.

## 변경

- `src/templates/ecosystem-mdc.ts`
  - `ECOSYSTEM_MDC_VERSION`: `'1'` → `'2'` (기존 프로젝트도 `vhk inject-bootstrap --force`로
    갱신 인식되도록).
  - 1번 항목("Claude Code = primary...")을 2개 항목으로 분리:
    1. 실행 계층(vhk 명령)은 에이전트 무관.
    2. 트리거 계층(훅·`vhk-auto`)은 현재 Claude Code 전용 — 격차 해소 로드맵(RFC 0057) 명시.
  - 기존 2~5번(Cursor/Cross-repo/Concurrency/Derived files) 항목은 내용 변경 없이 번호만
    3~6으로 이동.
  - `isCurrentEcosystemMdc()`(`src/lib/inject-bootstrap.ts:37-42`)는 `ECOSYSTEM_MDC_VERSION`
    상수를 마커 비교에 직접 재참조하므로 별도 하드코딩 비교 코드 수정 불필요 — 레포 전체
    `ECOSYSTEM_MDC_VERSION`/`ECOSYSTEM-MDC` grep으로 다른 `v1` 리터럴 비교 코드가 없음을 확인.
- `tests/inject-bootstrap.test.ts` — 신규 회귀 테스트 1개: `generateEcosystemMdcContent()`가
  "실행 계층(vhk 명령)은 에이전트 무관"을 포함하고 "Claude-only"는 포함하지 않음을 단언.
- `goals/93-ecosystem-mdc-identity-fix.md`(신규) + `scripts/check-goal-93.mjs`(신규, 고유
  검증 11개).

## TDD 로그

RED: 위 회귀 테스트를 먼저 추가하고 `pnpm exec vitest run tests/inject-bootstrap.test.ts`
실행 → 신규 테스트 1개 실패(현재 코드엔 새 문구 없음 + "Claude-only" 존재), 기존 4개는 그대로
통과 확인. GREEN: `ecosystem-mdc.ts` 수정 후 재실행 → `inject-bootstrap.test.ts`(5개)·
`init.test.ts`·`init-core-rules-warn.test.ts`(관련 기존 테스트 전부, 합계 53개) 통과.

## 게이트

`pnpm exec tsc --noEmit`·`pnpm build`·`pnpm lint` clean. `pnpm test:run` 2213/2214 pass —
유일한 실패는 `tests/gen-goals-index.test.ts`("커밋된 goals/README.md == 재생성 결과")로,
goal 93 신규 등록에 따른 **예상된** 드리프트다. 사용자 지시에 따라 `goals/README.md`는
의도적으로 갱신하지 않았음(RFC 0057 병렬 3트랙 병합 후 메인 세션이 한 번에 재생성 예정 —
지금 갱신하면 다른 트랙과 병합 충돌). `check-goal-93.mjs` 고유 검증 11개는
`VHK_GATES_SKIP_DEEP=1`·전체 모드 모두 green.

이 워크트리는 `pnpm install` 미실행 상태(신규 worktree라 `node_modules`에 실제 패키지
없음, vitest만 우연히 PATH의 전역 바이너리로 동작)로 시작 — `pnpm lint`가 `eslint` 미인식으로
실패하는 것을 보고 원인 파악 후 `pnpm install` 실행해 해결.

## 참고 — 의도적으로 건드리지 않은 것

- `goals/README.md` — 위 게이트 섹션 참조. 3트랙 병합 후 메인 세션이 재생성.
- 레포 자체 `.cursor/rules/ecosystem.mdc`(이미 커밋된 산출물) — `vhk inject-bootstrap --force`
  실행은 다른 tier-S 파일도 함께 덮어쓰는 부작용이 있어 이 트랙 범위 밖, 사람 판단 필요.
- RFC 0057 트랙②(receipt agent 필드)·트랙③(트리거 격차 문서화) — 독립 트랙, 병렬 진행 중.

## 교훈

- **신규 git worktree는 `node_modules`가 비어 있을 수 있다** — 전역 PATH에 우연히 존재하는
  바이너리(vitest)는 `pnpm exec`가 조용히 성공시켜 착시를 준다("일부 명령이 되니 install도
  됐겠지"). 게이트를 전부 돌리기 전에 `pnpm install` 여부를 먼저 확인하는 습관이 필요 —
  이번엔 `pnpm lint`가 먼저 깨져서 드러났지만, eslint 대신 실행 안 되는 도구가 달랐다면
  더 늦게 발견됐을 수 있다.
- **"게이트 전부 green"과 "공유 생성 파일(goals/README.md) 건드리지 마라"는 병렬 트랙
  상황에서 충돌할 수 있다** — 이번엔 후자가 명시적 지시라 전자를 100% 만족 못 시키는 게
  맞는 선택이었다. 이럴 땐 실패를 감추지 않고 원인(신규 goal 등록에 따른 예상된 드리프트)을
  정확히 지목해 기록하는 것이 "가짜 완료"보다 낫다 — VHK 자신의 "정직한 블로커" 철학과 동일한
  원칙이 게이트 결과 보고에도 적용된다.
