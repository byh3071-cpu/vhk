# Architecture — vhk

> 마지막 갱신: 2026-05-30 (v1.4.0)
>
> VHK CLI 의 내부 구조. 외부 사용자 가이드는 [README.md](../README.md), 운영/기록 규칙은 [CLAUDE.md](../CLAUDE.md) 참조.

## 1. 한눈에 보기

```text
┌───────────────────────────────────────────────────────────┐
│  사용자 / Cursor / Claude Desktop                          │
└──────────────┬─────────────────────────┬──────────────────┘
               │ CLI                     │ MCP (stdio, 24 tool)
               ▼                         ▼
        ┌──────────────┐         ┌──────────────────┐
        │  src/index.ts │         │  src/mcp/server  │
        │  (commander) │         │  (@mcp/sdk)      │
        └──────┬───────┘         └──────────┬───────┘
               │                            │
               └─────────┬──────────────────┘
                         ▼
                 ┌───────────────┐
                 │ src/commands/ │  ← 비즈니스 로직 단위
                 └───────┬───────┘
                         ▼
                 ┌───────────────┐
                 │   src/lib/    │  ← 재사용 유틸 (exec, git, secrets …)
                 └───────┬───────┘
                         ▼
            ┌───────────────────────────┐
            │  하네스 산출물 (프로젝트별)  │
            │  goals/ · docs/state/      │
            │  scripts/check-*.sh        │
            │  .vhk/HARD_STOP            │
            └───────────────────────────┘
```

## 2. 기술 스택

| 영역 | 선택 | 비고 |
|------|------|------|
| 런타임 | Node.js ≥ 20 | ESM 출력 |
| 언어 | TypeScript (strict) | tsup 번들 |
| CLI 프레임워크 | `commander` | `program.command()` 단위 |
| 프롬프트 UX | `inquirer` | TTY 전용 (MCP 모드 차단) |
| 출력 | `chalk`, `ora` | 색상 + 스피너 |
| MCP | `@modelcontextprotocol/sdk` | stdio transport |
| 테스트 | `vitest` | 356 pass |
| 패키지 매니저 | `pnpm` | `pnpm build` / `pnpm test` |

## 3. 레이어별 책임

### 3.1 CLI 레이어 — [src/index.ts](../src/index.ts) + [src/commands/](../src/commands/)

- `src/index.ts` — commander 진입점, 한국어 별칭(`KO_ALIASES`) 매핑, 시작 메뉴(inquirer), 자연어 라우터 fallback
- `src/commands/<name>.ts` — 명령 1개당 1파일. 시그니처: `export async function <name>(opts?)`
- 출력 컨벤션:
  - 헤더: `chalk.bold` + 이모지
  - 다음 액션 안내: `lib/next-step.ts:printNextStep()` 패턴 통일
  - 한국어 메시지는 [src/i18n/ko.ts](../src/i18n/ko.ts) 의 `t()` 키만 사용

### 3.2 MCP 레이어 — [src/mcp/](../src/mcp/)

- `server.ts` — `@modelcontextprotocol/sdk` stdio 서버. 24 tool 노출.
- 핸들러 패턴: `runVhkCli(args, headline)` 헬퍼로 CLI 실행을 wrap (인터랙티브 프롬프트 차단)
- 제외 커맨드 (TTY 필수): `gate`, `init`, `start`, `design palette`, `theme`, `goal`
- 핸들러 내부 `process.exit()` 금지 — MCP 클라이언트 세션 강제 종료 위험

### 3.3 라이브러리 — [src/lib/](../src/lib/)

| 파일 | 책임 |
|------|------|
| `exec.ts` | `safeExecFile()` — argv 분리 기반 셸 인젝션 차단. `execSync` 신규 사용 금지의 SoT |
| `git-repo.ts` / `git-porcelain.ts` / `git.ts` | git 호출 + porcelain 파서 |
| `scan-secrets.ts` / `secret-patterns.ts` / `check-secure.ts` | 시크릿/키 패턴 매처 |
| `goal-frontmatter.ts` | `goals/*.md` YAML frontmatter 파싱/갱신 |
| `state-files.ts` | `docs/state/next-task.md` / `blockers.md` / `learnings.md` SoT IO |
| `nlp-router.ts` / `nlp-run.ts` | 자연어 → 명령어 매핑 (트리거 키워드 사전) |
| `next-step.ts` | `printNextStep({ message, command, cursorHint })` — 모든 명령 종료 시 일관된 안내 |
| `read-json.ts` | JSON 파일 안전 읽기 |
| `cli-args.ts` | 자연어 입력 감지 (단어 1개 + 한글) |
| `version.ts` | `package.json` 버전 동적 조회 |
| `adr.ts` / `rules-parser.ts` / `notion-import.ts` / `scan-files.ts` | 보조 |

### 3.4 i18n + 템플릿

- [src/i18n/ko.ts](../src/i18n/ko.ts) — 모든 사용자 노출 문자열의 SoT. v1.0 GA 부터 키 이름 안정 (추가만, 제거/이름 변경 금지).
- [src/templates/](../src/templates/) — `vhk init` 산출물 템플릿 (CLAUDE.md, .cursorrules, docs/ 스캐폴딩).
- [src/notion/](../src/notion/) — Notion PRD import 어댑터 (`vhk init --from-notion`).

### 3.5 하네스 — 프로젝트 산출물

CLI 가 만들어 내는 외부 아티팩트:

```text
goals/
├── _meta.md              ← 공통 게이트 명세
├── 0-mcp-full-coverage.md
├── 1-goal-command.md
└── 2-agent-loop.md       ← YAML frontmatter (status / priority / completed)

docs/state/
├── next-task.md          ← vhk goal next 산출
├── blockers.md           ← vhk blocker 누적 (3건 → HARD_STOP)
└── learnings.md          ← vhk learn 누적

scripts/
├── check-meta.sh         ← 공통 게이트
├── check-goal-0.sh
├── check-goal-1.sh
└── check-goal-2.sh

.vhk/
├── HARD_STOP             ← 트립와이어 (gitignored)
├── context.md            ← vhk context
├── memory.json           ← vhk memory
├── brief.md              ← vhk brief
└── refs.json             ← vhk ref
```

자율 루프 한 사이클:

```text
vhk context → vhk goal next → (작업) → vhk goal check → vhk goal done
                                          │ FAIL × 3 cycle
                                          ▼
                                   vhk blocker "<증상>"
                                          │ 3건 누적
                                          ▼
                                  .vhk/HARD_STOP 자동
                                          │
                                          ▼
                                  사람 검토 → vhk resume --confirm
```

## 4. 보안 가드레일

| 가드 | 위치 | 위반 시 |
|------|------|--------|
| `execSync` 금지 → `safeExecFile` 강제 | `src/lib/exec.ts` | 셸 인젝션 회귀 위험 |
| MCP handler 에서 `process.exit()` 금지 | `src/mcp/server.ts` | MCP 클라이언트 세션 강제 종료 |
| MCP 에서 `inquirer` 호출 금지 | 모든 MCP handler | TTY 없음 → hang |
| `.env` → `.gitignore` 자동 추가 | `vhk env` | 시크릿 평문 커밋 |
| `vhk save` 전 시크릿 스캔 | `commands/save.ts` | CRITICAL/HIGH 발견 시 확인 프롬프트 |
| `vhk resume` 자동 호출 금지 | `commands/agent.ts` | HARD_STOP 우회 (사람 개입 필수) |

## 5. 빌드 / 배포

- `pnpm build` — tsup → `dist/index.js` (CLI) + `dist/mcp/index.js` (MCP)
- `pnpm test --run` — vitest 일괄
- `prepublishOnly` — publish 전 build + test 강제
- `vhk publish` — semver 범프 → 빌드 → 테스트 → `npm publish` → git tag
- npm 패키지: `@byh3071/vhk` (public, scoped)
- bin: `vhk` (`dist/index.js`), `vhk-mcp` (`dist/mcp/index.js`)

## 6. 안정성 약속 (v1.0 GA → v2.0)

- 명령어 이름 / CLI 인자 / `.vhk/` 파일 포맷 — breaking change 금지
- MCP tool 시그니처 — breaking change 금지
- `ko.ts` 의 `t()` 키 이름 — 신규 키 추가만, 기존 키 미제거
- deprecation 절차: 제거 전 1개 마이너 버전(1.x.0) 에서 경고

## 7. 참고

- 운영 규칙: [CLAUDE.md](../CLAUDE.md), [AGENTS.md](../AGENTS.md)
- Goal 사양: [goals/_meta.md](../goals/_meta.md)
- 코딩 컨벤션: [.cursorrules](../.cursorrules), CLAUDE.md "코딩 컨벤션" 섹션
- 작업 로그: [docs/log/](./log/)
- ADR: [docs/adr/](./adr/)
- 트러블슈팅: [docs/troubleshooting/](./troubleshooting/)
