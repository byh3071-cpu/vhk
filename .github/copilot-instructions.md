# vhk — GitHub Copilot Instructions

> 코딩/디자인 전용. 기록/운영 → CLAUDE.md 참조.
> ⚡ 이 파일은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.

## 필수 참조
- docs/PRD.md · docs/ARCHITECTURE.md · CLAUDE.md · RULES.md

## 세션 시작 필독
> 이 절은 진입점이다. 어떤 도구로 세션을 열든 여기부터 읽는다 (ADR-010 §3).

- **현 사이클 원본:** [docs/roadmap/2.x-roadmap.md](docs/roadmap/2.x-roadmap.md) — 작업 단위·순서·릴리스 종료 조건 전량. 작업 시작 전 여기부터 읽는다.
- **수용 기준:** [docs/PRD-2.x.md](docs/PRD-2.x.md)
- 실행 단위인 `goals/*.md` 카드와 `scripts/check-goal-<번호>.mjs` 는 위 원본에서 파생된 **비추적** 산출물이다. Goal 카드가 있으면 그 frontmatter가 로컬 실행 상태를 보존한다. 소실되면 정의·완료 조건은 원본에서 재생성하고 `vhk goal sync` 로 검사 스크립트를 백필한다. 단, 과거 로컬 진행 상태는 복구된 것으로 추측하지 않고 unknown으로 돌아간다.
- `.vhk/context.md` 와 `docs/state/next-task.md` 는 현재 상태를 보기 쉽게 모은 **파생 스냅샷**이다. 작업 정의나 완료 조건의 원본으로 사용하지 않는다.
- `docs/state/blockers.md` 는 로컬 차단 기록이다. append-only로 다루되 제품 작업 정의의 원본으로 승격하지 않는다.

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
