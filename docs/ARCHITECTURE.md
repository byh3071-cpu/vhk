# Architecture — vhk

> 마지막 갱신: 2026-08-01
>
> 현재 구현만 설명한다. 승인 대기 설계는 §8에서 분리한다.
> 외부 사용법은 [README](../README.md), 운영 규칙은 [RULES](../RULES.md), 파일 형식은
> [.vhk 규격](spec.md)을 따른다.

## 1. 한눈에 보기

```text
사람 / Claude Code / Codex / Cursor / 기타 에이전트
                    │
          ┌─────────┴─────────┐
          │                   │
         CLI              MCP(stdio)
          │                   │
          └─────────┬─────────┘
                    ▼
              src/commands
                    │
                    ▼
                 src/lib
                    │
                    ▼
      프로젝트 파일 · 로컬 실행 상태 · 검증 결과
```

- 에이전트와 IDE는 교체 가능한 실행 표면이다.
- CLI와 MCP는 같은 command/lib 구현을 재사용한다.
- 중요한 판정은 모델의 설명이 아니라 파일, Git 상태, 종료 코드와 검증 결과를 사용한다.

### 기술·패키지 표면

| 구분 | 현재 선택 |
|---|---|
| 런타임 | Node.js 22 이상, ESM |
| 언어 | TypeScript strict |
| CLI | Commander, Inquirer, Chalk |
| MCP | Model Context Protocol SDK, Zod, stdio |
| 빌드·검증 | tsup, Vitest, ESLint |
| 패키지 관리자 | pnpm |
| 공개 패키지 | `@byh3071/vhk` |
| 실행 파일 | `vhk`, `vhk-mcp` |

버전, 실행 파일과 의존성의 최종 원본은 `package.json`이다. 이 표는 구조를 이해하기 위한 요약이며
값을 중복 관리하는 설정이 아니다.

## 2. 설계 원리

1. **사실 하나에는 원본 하나만 둔다.** 같은 내용을 여러 파일에서 직접 관리하지 않는다.
2. **파생물은 다시 만들 수 있어야 한다.** 파생물을 잃어도 원본에서 복구할 수 있어야 한다.
3. **읽기와 쓰기를 분리한다.** 조회처럼 보이는 기능이 원본을 조용히 바꾸지 않는다.
4. **완료는 증거로 판정한다.** 테스트·빌드·Git 상태와 맞지 않으면 완료로 표시하지 않는다.
5. **위험한 경계는 사람에게 남긴다.** 배포, publish, main/master 머지와 파괴적 변경은 자동 승인하지 않는다.

이 원리는 VHK가 특정 에이전트의 프롬프트 묶음이 아니라, 에이전트가 바뀌어도 남는 개발 하네스가
되기 위한 최소 조건이다.

## 3. 원본과 파생물

| 정보 | 원본 | 파생·보조 표현 |
|---|---|---|
| 프로젝트 규칙 | [RULES.md](../RULES.md) | CLAUDE.md, AGENTS.md, .cursorrules 등 `vhk sync` 산출물 |
| 2.x 작업 정의·순서 | [2.x roadmap](roadmap/2.x-roadmap.md) | 비추적 `goals/*.md` 실행 카드 |
| 2.x 수용 기준 | [PRD-2.x](PRD-2.x.md) | Goal 검사와 프롬프트에 필요한 요약 |
| 로컬 Goal 실행 상태 | `goals/*.md` frontmatter | `docs/state/next-task.md` |
| 프로젝트 맥락 요약 | 위 원본과 저장소 실측 | `.vhk/context.md` |
| 차단 이력 | `docs/state/blockers.md` | context·work 출력의 최근 항목 |
| 버전·릴리스 | `package.json`, `CHANGELOG.md` | CLI 도움말과 문서 표면 |
| 기억 | `.vhk/memory.json` 스키마 v2 | context의 활성 기억 요약 |

주의:

- `goals/`, `docs/state/`, 번호형 `scripts/check-goal-<id>.mjs`는 이 저장소에서 비추적 로컬 산출물이다.
- `.vhk/context.md`와 `docs/state/next-task.md`는 상태를 보기 쉽게 만든 스냅샷이지 작업 정의의 원본이 아니다.
- Goal 카드가 소실되면 roadmap·PRD에서 정의와 완료 조건은 재생성할 수 있지만, 과거 frontmatter의
  로컬 실행 상태는 복원할 수 없다. 이 경우 진행 상태를 추측하지 않고 `unknown`으로 되돌린다.
- 구 `docs/state/learnings.md`는 동결됐다. 새 교훈은 memory v2의 `failures[].lesson`에 기록한다.

## 4. 코드 레이어

### 4.1 CLI — [src/index.ts](../src/index.ts), [src/commands](../src/commands)

- commander 진입점과 명령 등록을 담당한다.
- 각 command는 사용자 흐름을 조립하고, 재사용 가능한 판정은 lib로 위임한다.
- 한국어 사용자 메시지는 [src/i18n/ko.ts](../src/i18n/ko.ts)를 사용한다.
- 명령 종료 안내는 `printNextStep()` 패턴을 사용한다.

### 4.2 MCP — [src/mcp](../src/mcp)

- MCP stdio 서버가 AI 클라이언트에 VHK 기능을 노출한다.
- 가능한 경우 `runVhkCli(args, headline)`로 CLI 동작을 재사용한다.
- TTY가 필요한 inquirer 흐름은 MCP에서 실행하지 않는다.
- handler 안에서 `process.exit()`를 호출하지 않는다.
- 도구 수는 등록 결과에서 런타임에 계산한다. 문서에 고정 숫자를 복제하지 않는다.

### 4.3 공용 라이브러리 — [src/lib](../src/lib)

| 책임 | 대표 모듈 |
|---|---|
| 안전한 프로세스 실행 | `exec.ts`의 `safeExecFile()` |
| Git 조회와 세션 상태 | `git-repo.ts`, `git-session.ts`, `git-porcelain.ts` |
| Goal 카드 파싱 | `goal-frontmatter.ts` |
| 로컬 차단 기록과 중단 신호 | `state-files.ts` |
| 검증 리포트와 원장 | `evidence-ledger.ts`, `receipt.ts`, `receipt-log.ts` |
| 규칙 파싱·동기화 | `rules-parser.ts`, `rules-inherit.ts` |
| 안전한 JSON·파일 쓰기 | `read-json.ts`, `atomic-write.ts` |
| 명령 목록 | `command-registry.ts` |

새 타입이나 상수를 만들기 전에 이 레이어에 같은 의미가 이미 있는지 찾는다. 기존 `Receipt`,
검증 리포트, 자율 실행 로그를 새 이름으로 복제하지 않는다.

### 4.4 템플릿과 전파

- [src/templates](../src/templates)는 신규 프로젝트 산출물을 만든다.
- `vhk sync`는 RULES.md를 에이전트별 규칙 파일로 전파한다.
- 생성 파일을 직접 수정하지 않는다. RULES.md 또는 생성기를 고친 뒤 동기화한다.

## 5. 현재 Goal 실행 흐름

```text
roadmap + PRD
      │
      └─ 파생 → goals/*.md + scripts/check-goal-<id>.mjs
                         │
                         ▼
context → goal next → 작업 → goal check → goal done
                         │                     │
                         │ 검사 실패           │ 검사 통과 필요
                         ▼                     ▼
                 blocker append        로컬 Goal 상태 갱신
                         │
                  3건 누적 시
                         ▼
                 .vhk/HARD_STOP
                         │
                         ▼
              사람 확인 후 resume --confirm
```

- Goal 카드가 없는 clean clone에서는 roadmap·PRD가 작업 정의를 보존하지만, 로컬 실행 상태는 없다고
  정직하게 표시한다.
- `goal next`가 생성하는 next-task는 편의용 스냅샷이다.
- `goal done`은 관련 검사 없이 완료 상태를 만들면 안 된다.

## 6. 검증과 기록

```text
소스 변경
   ▼
typecheck / lint / test / build / boundary
   ▼
verify 결과 + receipt 판정
   ▼
검증 근거와 남은 위험 보고
```

- [src/commands/verify.ts](../src/commands/verify.ts)는 실제 종료 코드를 수집한다.
- [src/lib/receipt.ts](../src/lib/receipt.ts)는 기존 검증 결과, Git dirty, 증거 신선도와 의도 범위를
  조합해 `pass`, `caution`, `block`을 판정한다.
- receipt는 저장소 수준 검증 리포트다. 아직 개별 Task와의 영구 바인딩 계약은 없다.
- 실패 기록을 숨기거나 테스트를 약화해 완료로 만들지 않는다.

## 7. 안전 경계

| 경계 | 현재 정책 |
|---|---|
| 셸 실행 | 신규 `execSync` 금지, argv 기반 `safeExecFile` 사용 |
| 시크릿 | 평문 커밋 금지, env 파일과 공개 경계 검사 사용 |
| MCP | TTY 프롬프트·`process.exit()` 금지 |
| 중단 | `.vhk/HARD_STOP`은 사람 확인 없이 해제하지 않음 |
| 외부 상태 | 배포·publish·main/master 머지는 사람 승인 |
| 공개 저장소 | 개인 운영 정보·절대경로·실제 외부 객체 ID 기록 금지 |

## 8. 후속 구현 대기 확장

[ADR-012](adr/ADR-012-agent-agnostic-core-and-method-absorption.md)는 Accepted다.
[RFC 0064](rfc/0064-agent-agnostic-task-spine.md)는 기존 Goal을 읽기 전용으로 투영하고, 같은 입력에서
에이전트 공통 작업 문맥을 만드는 **Proposed** 설계다.

- 현재 구현으로 광고하지 않는다.
- 2.13 작업 115~118과 공통 게이트는 #552로 완료됐다. PR B는 별도 사람 Plan 승인 뒤에만 시작한다.
- 첫 구현은 읽기 전용이어야 하며 roadmap·PRD·Goal·context를 수정하지 않는다.
- Task-native 쓰기, 승인, 의존성 그래프, 관제 화면은 별도 결정과 검증 뒤에만 연다.
- 장기 구상은 [미래 설계 지도](reference/agent-agnostic-future-map.md)에 격리한다.

## 9. 빌드와 배포

- `pnpm build` — tsup 번들
- `pnpm typecheck` — TypeScript 정적 검사
- `pnpm lint` — src 정적 규칙 검사
- `pnpm test:run` — vitest 일괄 실행
- `pnpm boundary:check` — 공개 경계 검사
- publish와 릴리스 머지는 사람 승인 경계다.

### GA 호환성

- 기존 CLI 명령명·인자, 공개 `.vhk` 형식, MCP 도구 시그니처와 기존 한국어 메시지 키는 공개 계약이다.
- 2.x에서는 additive optional 변경을 우선하고, 제거·이름 변경·의미 변경은 deprecation과 major
  version 경계 없이 수행하지 않는다.
- 내부 구현을 단순화할 때도 공개 계약의 회귀 테스트를 먼저 유지한다.

## 10. 관련 문서

- [VISION](../VISION.md)
- [PRD](PRD.md)
- [2.x roadmap](roadmap/2.x-roadmap.md)
- [.vhk 규격](spec.md)
- [ADR 목록](adr/)
- [RFC 목록](rfc/)
