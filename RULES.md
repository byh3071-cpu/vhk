# vhk — 프로젝트 규칙 단일 소스 (Single Source of Truth)

> ⚡ 이 파일이 모든 규칙의 원본이다. 규칙 변경은 **여기서만** 하고 `vhk sync` 로 전파한다.
> 전파 대상: .cursorrules · .windsurfrules · .github/copilot-instructions.md · .agents/rules/vhk-rules.md · AGENTS.md · GEMINI.md · .clinerules/vhk-rules.md · CLAUDE.md(기록 규칙 영역)
> 명령 사용법은 COMMANDS.md, 공개 기여 절차는 CONTRIBUTING.md가 담당.

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
- src/lib/nlp-router.ts (자연어 라우팅)

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
- 공개 API breaking change는 major 버전에서만 허용
- `execSync` 신규 사용 금지 → `safeExecFile`
- MCP 모드에서 inquirer 프롬프트 호출 금지 (TTY 없음)
- 토큰/시크릿 코드·커밋 평문 노출 금지 (`.env` + `.gitignore`)
- 게이트 실패 상태에서 done 처리 금지 / `vhk resume` 자동 호출 금지
- AGENTS.md·.cursorrules 등 sync 산출물 직접 편집 금지 → RULES.md + `vhk sync`
- publish 는 main 에서만 + 사람 승인 (가드 #119)
- 공개 추적 금지: 개인 운영 로그·상태·goal, 로컬 절대경로, 개인 이메일, 실명, 개인 저장소명, 실제 외부 서비스 객체 ID
- 예제는 `sample-*`, `<HOME>`, 명백한 가짜 ID만 사용하고 `boundary:check` 우회 금지
- Git 작성자 이메일은 GitHub noreply, npm 공개 연락처는 `opensource@yohanstudio.co` 사용

## 기록 규칙

- 의사결정 → docs/adr/ · 에러 → docs/troubleshooting/ · 배움 → docs/til.md · 설계 → docs/rfc/
- 기록 경로 판단표 (governance-v2):
  - 작은 구현 선택(국소·되돌리기 쉬움) → commit 메시지 본문
  - 패키지·아키텍처·정책 결정 → docs/adr/ `ADR-NNN-슬러그.md`
  - 설계·제안(구현 전 검토) → docs/rfc/ `NNNN-슬러그.md`
  - 에러·해결 과정 → docs/troubleshooting/ `TS-NNN-슬러그.md`
  - 세션 작업 내역 → Notion Dev Log 또는 추적되지 않는 `docs/devlog/`
  - 범용 패턴(타 프로젝트 재사용 가능) → docs/patterns/ `PAT-NNN-영문명.md`
- 세션 종료 시 미기록 ADR·트러블슈팅 후보를 확인하고 해당하면 공개 문서에는 일반화된 기술 사실만 기록
- 개인 세션 기록·현재 작업 큐·외부 서비스 식별자는 커밋하지 않음
- 코드 변경이 동작/사용법을 바꾸면 README를 같이 갱신
- 교훈·결정·실패·성공 = `vhk memory`(4버킷) / `vhk learn`. learnings.md 는 v2 흡수·동결 → 신규 기록 금지.
- 로컬 작업 상태 SoT = 추적되지 않는 `.vhk/context.md`
