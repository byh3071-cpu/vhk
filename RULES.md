# vhk — 프로젝트 규칙 단일 소스 (Single Source of Truth)

> ⚡ 이 파일이 모든 규칙의 원본이다. 규칙 변경은 **여기서만** 하고 `vhk sync` 로 전파한다.
> 전파 대상: .cursorrules · .windsurfrules · .github/copilot-instructions.md · .agents/rules/vhk-rules.md · AGENTS.md · GEMINI.md · .clinerules/vhk-rules.md · CLAUDE.md(기록 규칙 영역)
> 기록/운영 의례·현재 상태는 CLAUDE.md 가, 명령 사용법은 COMMANDS.md 가 담당.

## 서문

- 한 줄 설명: 바이브코딩 풀사이클 CLI
- 레포: https://github.com/byh3071-cpu/vhk (public)
- npm: @byh3071/vhk
- 패키지 매니저: pnpm (npm 아님)

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

## 기록 규칙

- 의사결정 → docs/adr/ · 에러 → docs/troubleshooting/ · 배움 → docs/til.md · 설계 → docs/rfc/
- 기록 경로 판단표 (governance-v2):
  - 작은 구현 선택(국소·되돌리기 쉬움) → commit 메시지 본문
  - 패키지·아키텍처·정책 결정 → docs/adr/ `ADR-NNN-슬러그.md`
  - 설계·제안(구현 전 검토) → docs/rfc/ `NNNN-슬러그.md`
  - 에러·해결 과정 → docs/troubleshooting/ `TS-NNN-슬러그.md`
  - 세션 작업 내역 → docs/log/ `YYYY-MM-DD-작업명.md` (append-only)
  - 범용 패턴(타 프로젝트 재사용 가능) → docs/patterns/ `PAT-NNN-영문명.md`
- 기록 집행: 실질 코드변경(src/commands·src/lib·scripts/check-goal-*) 커밋 시 오늘자 dev log 스테이지 필수 — check-records hook 이 커밋을 차단. 사소·문서성 커밋은 메시지에 `[skip-record]` 로 우회 (governance-v2 T1).
- 세션 종료(`vhk work handoff`) 시 미기록 ADR·트러블슈팅 후보를 자동 감지·보고 → 해당하면 docs/adr·docs/troubleshooting 에 기록(자문형, 강제 아님) (RFC 0051)
- dev log `docs/log/YYYY-MM-DD-<작업명>.md` = append-only (추가만, 수정·삭제 금지)
- 코드 변경이 동작/사용법을 바꾸면 README 만 같이 갱신 (CLAUDE.md 는 갱신 대상 아님)
- 교훈·결정·실패·성공 = `vhk memory`(4버킷) / `vhk learn`. learnings.md 는 v2 흡수·동결 → 신규 기록 금지.
- 상태 SoT = docs/state/next-task.md · blockers.md (append-only)
