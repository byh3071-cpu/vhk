# vhk — AGENTS.md (에이전트 작동 규약)

> ⚡ 이 파일은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.
> 빠른 시작(토큰 절감): `docs/context/agent-compact.md` 를 먼저 읽으세요.

## Loop Protocol
- 루프: `context → goal next → 작업 → goal check → goal done`
- 작업 시작 시 `.vhk/HARD_STOP` 확인 — 있으면 모든 자동화 즉시 중단.
- active goal 만 작업. `docs/state`(next-task/blockers)는 append-only.
- 교훈·결정·실패·성공은 `vhk memory`(memory v2 4버킷, 단일 출처).
- 게이트(tsc / test:run / build) 통과해야만 `vhk goal done`.

## Ecosystem (cross-repo)

> Contract SoT: private-rules-repository `memory/core/ecosystem-contract.yaml` (obey when status=active).

- **Tier:** private-rules-repository `memory/core/inheritance-registry.yaml`
- **Cursor:** `.cursor/rules/ecosystem.mdc` (vhk inject-bootstrap)
- **금지:** AGENTS.md 손수 편집 → `RULES.md` + `vhk sync`

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
