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
- 세션 종료(`vhk work handoff`) 시 미기록 ADR·트러블슈팅 후보를 자동 감지·보고 → 해당하면 docs/adr·docs/troubleshooting 에 기록(자문형, 강제 아님) (RFC 0051)
- dev log `docs/log/YYYY-MM-DD-<작업명>.md` = append-only (추가만, 수정·삭제 금지)
- 코드 변경이 동작/사용법을 바꾸면 README 만 같이 갱신 (CLAUDE.md 는 갱신 대상 아님)
- 교훈·결정·실패·성공 = `vhk memory`(4버킷) / `vhk learn`. learnings.md 는 v2 흡수·동결 → 신규 기록 금지.
- 상태 SoT = docs/state/next-task.md · blockers.md (append-only)
