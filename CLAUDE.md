---
id: claude-md-vhk
tags: [process, constitution]
---

# CLAUDE.md — vhk 헌법 + 현재 상태

> 📖 **읽는 법 (필수):** 이 파일은 두 구역이다.
> 1) 위 = 🔒 영구 헌법 (절대 수정 금지)
> 2) 맨 아래 = ✏️ LIVE 현재 상태 (매 세션 갱신, 여기만 수정)
> **반드시 맨 아래 ✏️ LIVE 구역까지 읽고 "다음 할 일"에서 이어간다. 스킵 금지.**
> 사실 SoT: 버전·테스트 = package.json·CHANGELOG / 상세 상태 = docs/state/.

════════════ 🔒 영구 헌법 (수정 금지) ════════════

## 언어·소통 규칙
- 응답은 무조건 한국어. 영어는 기술 용어(commit·MCP·build 등)에만.
- 사용자는 비개발자 → 두괄식(결론 먼저) + 전문용어는 쉬운 말로 풀이.
- 결론 → 이유 → 다음 행동 순, 짧게.

## 프로젝트 좌표 (포인터)
- 레포: github.com/byh3071-cpu/vhk (public) · npm: @byh3071/vhk
- 패키지 매니저: pnpm (npm 아님)
- 규칙 단일소스 → RULES.md → (vhk sync) → .cursorrules·AGENTS.md 등 / 명령 사용법 → COMMANDS.md
- 단계 미션 → goals/<n>-<name>.md · 공통 게이트 → goals/_meta.md
- 상태 SoT → docs/state/next-task.md · blockers.md

## 세션 시작 의례
1. `vhk work` 실행 → 상태 수집 + 시작 프롬프트를 클립보드에 복사 (HARD_STOP 자동 확인)
2. `claude` 실행 후 Ctrl+V 붙여넣기
3. Claude는 이 파일(✏️ LIVE 포함)을 1순위로 읽고 → AGENTS.md는 참고만 →
   docs/state/next-task.md·.vhk/context.md 기준으로 이어서 작업

## 작업 단위 의례
- 1 iteration = active goal 하나 + 작은 commit 하나 + 게이트 통과(or 정직한 블로커)
- 범위 계약: `vhk mission set` → `vhk mission check`
- 완료 주장 전 `vhk review`(거짓완료 자기검증)
- 막히면(3 cycle 진전 없음): `vhk blocker "<증상>"` → 다음 태스크

## 세션 중단/종료 의례 (🔒 dev log = 영구·삭제 금지)
- `vhk work handoff` 실행 → 인수인계 프롬프트 클립보드 복사 →
  Claude가 완료/미완 정리 + next-task.md 갱신 + 커밋 가능 여부 판단
- dev log `docs/log/YYYY-MM-DD-<작업명>.md` = append-only. 추가만, 수정·삭제 금지.
- 미완으로 꺼도 next-task.md에 "다음 할 일" 반드시 남김

<!-- vhk:rules:start -->
> ⚡ 아래 규칙 섹션은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.

## 기술 스택
> 변경 시 ADR(docs/adr/) 필수.

- Node.js + TypeScript (strict)
- commander (CLI) + inquirer (인터랙티브) + chalk (출력)
- tsup (빌드) + vitest (테스트)
- @modelcontextprotocol/sdk + zod (MCP)
- pnpm (패키지 매니저)
- src/i18n/ko.ts (한국어 i18n)
- src/nlp-router.ts (자연어 라우팅)

## 코딩 규칙
- TypeScript strict (any 금지)
- try-catch 필수, 빈 catch 금지
- console.log 프로덕션 제거
- `execSync` 신규 사용 금지 → `safeExecFile` 사용
- 모든 커맨드 파일에 `printNextStep()` 패턴 사용
- 한국어 별칭 `.alias()` + `ko.ts` 메시지 필수
- 신규 커맨드 시 `nlp-router.ts` 키워드 추가 필수
- 주석: 복잡 로직(git porcelain·drift·sync 등)은 why 블록주석 / 자명한 코드엔 주석 금지 / JSDoc 지양(타입이 말함) / 트러블 우회 코드는 원인 `#이슈` 참조
- 신규 명령 체크리스트: 등록 4지점(index.ts + command-registry TOP_LEVEL·CONTAINER·한글별칭 + cli-args + ko.ts) 누락 = NL 라우터 가드 무력 — 영문·한글 별칭 둘 다 테스트. + COMMANDS.md·README 사용법 갱신

### MCP 규칙

- handler 내부 `process.exit()` 금지
- MCP 모드에서 inquirer 프롬프트 호출 금지 (TTY 없음)
- 신규 handler 는 `runVhkCli(args, headline)` 헬퍼 패턴 사용
- 대화형 커맨드 (gate/init/design palette/theme) 는 MCP 제외
- 기존 tool API 시그니처 변경 금지 (GA 안정성)

## 디자인 Anti-patterns
- 보라-파랑 기본 그라디언트 금지
- 과도한 둥근 모서리 (>16px) 금지
- 그림자 중첩 · 장식 SVG 남발 금지

## 커밋 컨벤션
- 형식: `feat:` / `fix:` / `refactor:` / `docs:` / `chore:`
- 1 iteration = 작은 commit 하나 + 게이트 통과(or 정직한 블로커)

## VHK 운영 — Forbidden (전역 금지)
> 단일 Forbidden 목록(통합 SoT — goals/_meta.md 는 이 섹션을 포인터로 참조).
> CLAUDE.md 헌법 영구구역의 Forbidden 은 불가침이라 그대로 둠 — 의례 수준 금지는 그쪽, 코드/운영 수준 금지는 여기.

- `node_modules/` 직접 수정 금지
- `package.json` 기존 명령어 시그니처 breaking change 금지 (GA 정책)
- `execSync` 신규 사용 금지 → `safeExecFile`
- MCP 모드에서 inquirer 프롬프트 호출 금지 (TTY 없음)
- 토큰/시크릿 코드·커밋 평문 노출 금지 (`.env` + `.gitignore`)
- dev log·blockers 과거 항목 수정·삭제 금지 (append-only)
- 게이트 실패 상태에서 done 처리 금지 / `vhk resume` 자동 호출 금지
- AGENTS.md·.cursorrules 등 sync 산출물 직접 편집 금지 → RULES.md + `vhk sync`
- publish 는 main 에서만 + 사람 승인 (가드 #119)

## 기록 규칙
- 의사결정 → docs/adr/ · 에러 → docs/troubleshooting/ · 배움 → docs/til.md · 설계 → docs/rfc/
- 기록 경로 판단표 (governance-v2):
  - 작은 구현 선택(국소·되돌리기 쉬움) → commit 메시지 본문
  - 패키지·아키텍처·정책 결정 → docs/adr/ `ADR-NNN-슬러그.md`
  - 설계·제안(구현 전 검토) → docs/rfc/ `NNNN-슬러그.md`
  - 에러·해결 과정 → docs/troubleshooting/ `TS-NNN-슬러그.md`
  - 세션 작업 내역 → docs/log/ `YYYY-MM-DD-작업명.md` (append-only)
  - 범용 패턴(타 프로젝트 재사용 가능) → docs/patterns/ `PAT-NNN-영문명.md`
- 기록 집행: 실질 코드변경(src/** · scripts/check-*) 커밋 시 세션 dev log(오늘 또는 자정 넘긴 연속 세션의 어제 파일) 스테이지 필수 — check-records hook 이 커밋을 차단. 사소·문서성 커밋은 메시지에 `[skip-record]` 로 우회 (governance-v2 T1).
- 세션 종료(`vhk work handoff`) 시 미기록 ADR·트러블슈팅 후보를 자동 감지·보고 → 해당하면 docs/adr·docs/troubleshooting 에 기록(자문형, 강제 아님) (RFC 0051)
- dev log `docs/log/YYYY-MM-DD-<작업명>.md` = append-only (추가만, 수정·삭제 금지)
- 코드 변경이 동작/사용법을 바꾸면 README 만 같이 갱신 (CLAUDE.md 는 갱신 대상 아님)
- 교훈·결정·실패·성공 = `vhk memory`(4버킷) / `vhk learn`. learnings.md 는 v2 흡수·동결 → 신규 기록 금지.
- 상태 SoT = docs/state/next-task.md · blockers.md (append-only)

<!-- vhk:rules:end -->

## Safety — HARD_STOP
- 작업 시작 시 `.vhk/HARD_STOP` 확인 → 있으면 즉시 중단 (vhk work가 자동 체크)
  PowerShell: `if (Test-Path .vhk/HARD_STOP) { Write-Host '🛑 HARD STOP'; exit 1 }`
- 자동 생성: 블로커 3개 누적 / 토큰 예산 초과
- 해제: `vhk resume --confirm` (사람만, 자동 호출 금지)

## Stability Gates
- 작업 전 게이트 통과 필수: `pnpm build; pnpm test`
  (PowerShell은 `&&` 미지원 → 반드시 `;` 로 연결)
- 게이트 실패 시 done 금지
- publish는 항상 main에서만 (가드 #119가 feature 브랜치/미커밋 발행 차단)
- 새 이벤트 리스너 → 해제 로직 짝으로 / 새 캐시(Map·Set) → TTL 또는 maxSize 필수

## Goals / State 체계
- 단계 미션 = goals/<n>-<name>.md (frontmatter + 표준 섹션)
- 공통 게이트 = goals/_meta.md + scripts/check-meta.sh
- 상태 SoT = docs/state/next-task.md · blockers.md

## Forbidden
- 🔒 영구 구역 수정 / 상태값을 영구 구역에 박제 금지 (버전 줄은 LIVE 예외 ↓)
- dev log·blockers 과거 항목 수정·삭제 금지 (append-only)
- 게이트 실패에 done / `vhk resume` 자동 호출 금지
- 코딩·디자인 규칙 여기 적기 금지 → RULES.md
- AGENTS.md·.cursorrules 직접 편집 금지 → RULES.md 단일소스 + `vhk sync` 로만

════════════ ✏️ LIVE — 현재 상태 (매 세션 갱신 · 여기만 수정) ════════════

> 세션 시작: 이 구역 읽고 "다음 할 일"부터.
> 세션 종료: 마지막 갱신·버전·Phase·다음 할 일 갱신. (위 🔒 구역은 절대 건드리지 마.)
> ⚠️ 아래 `**버전:**` 줄은 CI(version-sync.test.ts)가 강제 — 형식 `**버전:** vX.Y.Z` 유지, 릴리즈마다 package.json 따라 갱신.

**마지막 갱신:** 2026-06-16
- **버전:** v2.6.0 (npm 발행 대기 — 사용자 직접 publish 필요) — 사실 확인은 package.json·CHANGELOG
- **테스트:** 1737 pass(main) · **MCP tools:** 32 — 사실값은 package.json·CHANGELOG
- **Phase:** Fable5 배치3 완료 — goal68(remind)·69(evolve negatives)·70(MCP 옵트인) 머지(#282·#283·#285, 각 적대 리뷰 동반). 풀사이클 뒷단 첫 트랙 goal74(vhk content)+RFC 0052(뒷단 4트랙 설계) 머지(#284).
- **블로커:** 없음
- **진행 중(미완):** 없음 — 열린 PR 0. goal 75~77(뒷단 launch/ops/sell)·73은 카드/설계만, 착수 대기.
- **다음 할 일:** ① v2.6.0 main 발행(사용자 직접 npm publish 2FA). ② 풀사이클 뒷단 나머지 트랙 — `vhk launch`(75)·`ops`(76)·`sell`(77), RFC 0052 §4·§5 예약, 자문형. ③ goal 73(#276, `vhk check --evals` LLM-judge) — Fable5 위생 golden-set. ④ measure-first: `vhk recall` 실사용→recall@5·`diff-cover` 실측. 미완 goal: 린트 25/27(#128)·SEO 21~26. 핸드오프: `C:\Users\user\.claude\plans\handoff-fullcycle-2026-06-16.md`
- **주의:** publish는 main에서만(#119)·사용자 직접(2FA) / 직접 main push 차단 → PR 경유
