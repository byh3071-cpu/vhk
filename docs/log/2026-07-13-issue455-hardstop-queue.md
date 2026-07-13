# 2026-07-13 — #455 뒷단 4명령 HARD_STOP 가드 + 정적 완전성 래칫

> #279(goal74 뒷단 Epic) 분리 서브이슈 1/5. 격리 worktree · 브랜치 `feat/455-hardstop-queue`.

## 실측 (구현 전)

- `src/commands/{content,launch,sell,ops}.ts` 4개 전부 `ensureNotHardStopped` **부재** 확정 — 전체 grep 에서 4파일만 미검출.
- 4명령은 `emitPrompt` 로 `.vhk/<name>-prompt.md` 파일쓰기 + 클립보드 복사 수행 → HARD_STOP 활성 상태에서도 산출물을 만들었음(트립와이어 우회).
- 같은 클래스("신규 명령이 HARD_STOP 가드 누락") 과거 3회: #334/#335/#336 + seo-report(2026-07-03 재검증 발견). 이번이 4번째.
- MCP 표면: content/launch/ops/sell MCP 툴은 `runVhkCli` 위임(CLI 서브프로세스) → CLI 가드만 넣으면 자동 커버(server.ts:37 주석 확인).

## 수정

- **가드 합류(4파일)**: `content()`/`launch()`/`ops()`/`sell()` 진입부 첫 줄에 `if (!ensureNotHardStopped('<name>')) return`. 차단 시 사유 + `vhk resume --confirm` 해제 안내 출력, `process.exitCode = 1`, 행동원장(`.vhk/events`) 기록 — 기존 가드 시맨틱 그대로(ship.ts 패턴).
- **회귀 테스트**: `tests/backend-hardstop.test.ts` — HARD_STOP 활성 → 4명령 각각 산출물 미생성 + exitCode 1 (TDD: 구현 전 4 fail 확인).
- **정적 완전성 래칫(보너스)**: `tests/hard-stop-completeness.test.ts` — `src/commands/**/*.ts` 중 쓰기 시그널(writeFileSync·appendFileSync·rmSync·renameSync·copyFileSync·atomicWriteFile·emitPrompt) 있는 파일은 ①파일 내 가드 ②index.ts chokepoint(guardCli 배선 자가검증) ③사유 문서화된 EXEMPT 중 하나여야 통과. 셋 다 아니면 FAIL → 같은 실수 5번째 원천 차단. 예외 목록은 래칫(빼기만 가능 — 가드 생기면 항목 제거 강제).

## 스코프 정직화 — 무엇을 하고 무엇을 안 했나

- **함(이슈 완료기준 충족분)**: HARD_STOP 게이트 합류 · 활성 시 차단(exit 1) · 해제(=사람 승인) 시 진행.
- **안 함(별도 "승인 큐" 인프라)**: 4명령은 자문형(외부 실행 0 — 프롬프트만 emit)이라 큐에 넣어 승인 대기시킬 "실행"이 존재하지 않음. 사람 승인은 이미 구조적으로 충족 — ①명령 자체가 게시·발송·결제를 실행하지 않고 ②프롬프트에 "사람 승인 전 게시·발송 금지" 치명 규칙 ③printNextStep "사람이 직접" 유도. `HIGH_RISK_ACTIONS`(runGuarded) 편입도 하지 않음 — high-risk 정의(되돌리기 어렵거나 외부 영향)에 불합치(로컬 .vhk 초안 파일뿐)하고, 편입 시 자문형 명령이 confirm/preview 로 막혀 기능만 마비됨(과설계). 향후 뒷단에 실제 외부 실행(게시 API 등)이 생기면 그때 HIGH_RISK_ACTIONS + runGuarded 편입이 정도(定道).
- **README/COMMANDS.md 미갱신 사유**: 두 문서 모두 HARD_STOP 을 전역 트립와이어로만 기술(명령별 가드 목록 없음) — 이번 변경은 문서된 동작에 코드를 맞춘 것이라 사용법 변화 없음.
- **로드맵 참고**: "ensureNotHardStopped 정적 완전성 테스트"는 roadmap.md 밀봉(백로그 유지) 항목이었으나, 이번 임무 지시("같은 뿌리 — 구현 가능하면 포함")에 따라 선인출 구현. 채택 여부는 PR 리뷰에서 판단 가능(머지는 사람).

## 검증

- TDD red→green: 구현 전 6 fail(런타임 4 + 정적 2) → 구현 후 8/8 pass.
- 게이트: `pnpm build` ✅ · `pnpm test:run` 2416 pass(217 files) ✅ · `pnpm lint` ✅.
- E2E(dist 실행): HARD_STOP 활성 → `vhk launch` exit 1 + 산출물 0 + 사유·해제 안내 출력 + events 원장 기록 / 해제 후 → exit 0 + `launch-prompt.md` 생성.

## 교훈

- 같은 가드 누락이 4번 반복되면 리뷰·기억이 아니라 **정적 래칫 테스트**로 클래스 자체를 막아야 한다(개별 수리 3번 < 래칫 1번). 한계도 정직하게: lib 헬퍼 경유 쓰기는 명령 파일에 시그널이 없어 이 정적 검사가 못 잡음 — 커버 범위를 테스트 주석에 명시.
