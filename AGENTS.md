# AGENTS.md — VHK 자율 루프 에이전트 작동 규약

> VHK 의 자율 루프(`context → goal next → 작업 → goal check → goal done`) 안에서
> 동작하는 모든 에이전트(사람·LLM·CI 봇)가 따라야 하는 공통 규약.
> vspec/vooster `AGENTS.md` 패턴 차용, VHK 단일 패키지 맥락에 맞춰 축소.
>
> ⚡ **빠른 시작(토큰 절감):** 전체를 매번 읽기 부담되면 짧은 요약
> `docs/context/agent-compact.md` 를 먼저 읽으세요. `vhk context --compact` 도 같은 규약을 참조합니다.

## You Are

작은 단위로 일하는 엔지니어. 매 iteration 은:

- 하나의 goal 의 일부 작업
- 하나의 작은 commit
- 게이트 통과 또는 정직한 블로커 기록

으로 끝난다. 매번 끝낼 때 진척이 검증 가능해야 한다.

## Working Principles

### 1. Small Steps

매 commit 은 자기-완결. commit 못 하겠으면 step 이 너무 큰 것. 쪼개라.

### 2. State Is in Files, Not in Your Head

진척·블로커·교훈은 `docs/state/{next-task,blockers,learnings}.md` 에 기록.
세션 종료 / 모델 교체 / 시간 흐름에도 다음 에이전트가 같은 파일에서 출발 가능해야 함.

### 3. One Goal Per Iteration

`vhk goal next` 가 선택한 active goal 만 작업. 다른 goal 을 건드릴 일이 생기면
별도 iteration 으로 분리.

### 4. Append-Only History

`docs/state/blockers.md` 와 `docs/state/learnings.md` 는 append-only.
해결은 ~~strikethrough~~ 로 표기, 삭제 금지. 과거 기록이 다음 결정의 컨텍스트.

### 5. Gate Passes or Stops

`vhk goal check` 또는 `bash scripts/check-goal-<n>.sh` 가 실패하면 그 시점에 멈춤.
실패 무시하고 done 처리 = Forbidden.

## Mandatory Reading Order (매 iteration)

cache hit 최대화 위해 동일 순서로:

1. `CLAUDE.md` — 프로젝트 기록 규칙
2. `AGENTS.md` (이 파일) — 작동 규약
3. `goals/_meta.md` — 공통 게이트
4. `goals/<active>.md` — 현재 goal 의 미션·완료조건·금지사항
5. `docs/state/next-task.md` — 지금 할 일
6. `docs/state/blockers.md` — 막혀있는 것
7. `docs/state/learnings.md` — 과거 교훈

이미 컨텍스트에 있으면 재독 생략 가능. 변경 감지는 git/diff 책임.

## Loop Protocol

```
1. vhk context              → 상태 + 최근 교훈 로드
2. vhk goal next            → active goal 자동 선택
3. (개발 작업 수행)
4. vhk goal check           → 게이트 검증
   ├─ PASS → vhk goal done → 다음 goal
   └─ FAIL → 3 cycle 내 진전 없으면 → vhk blocker "<증상>" → 다음 태스크 자동 전환
5. 블로커 3 개 누적         → .vhk/HARD_STOP 자동 생성 → 즉시 중단
6. (블로커 해소되면) 사람 검토 후 → vhk resume --confirm
```

## When Stuck

3 cycle 진전 없으면:

1. `vhk blocker "<증상>"` — `docs/state/blockers.md` 에 타임스탬프 + active goal id 와 함께 append
2. 같은 작업 더 시도 금지. 다음 태스크로 이동
3. 블로커 3 개 누적 → `.vhk/HARD_STOP` 자동 생성 → 사람에게 에스컬레이션

## Recording Learnings

iteration 끝에 비-자명한 교훈 1 건이라도 있으면:

- `vhk learn "<교훈>"` — `docs/state/learnings.md` 에 한 줄 append
- **단일 SoT**: `vhk memory add` 와 이중 기록 금지. 결정사항 = memory, 교훈 = learnings.

## HARD_STOP

`.vhk/HARD_STOP` 파일이 존재하면 모든 자동화 즉시 중단.

- 자동 생성 조건: 블로커 3 개 누적 / 토큰 예산 초과 감지 (향후)
- 해제: `vhk resume --confirm` (사람이 직접 실행, 자동 호출 금지)
- 게이트 스크립트는 시작 시 이 파일을 검사하고 exit 1

## Forbidden Actions (전역)

- `node_modules/` 직접 수정
- `package.json` 의 기존 명령어 시그니처 breaking change
- `execSync` 신규 사용 → `safeExecFile` 사용
- MCP handler 안에서 inquirer 호출
- `vhk resume` 의 자동 호출
- `docs/state/{blockers,learnings}.md` 의 과거 항목 수정/삭제 (append-only)
- `vhk learn` 와 `vhk memory add` 의 이중 기록 (SoT 분리: learnings = 교훈, memory = 결정사항)
- 게이트 실패에도 `vhk goal done` 으로 마킹 (실패 = 보존)

## Tech Stack (do not deviate)

- TypeScript / Node 20+
- commander / inquirer (CLI) — inquirer 는 MCP 경로에서 호출 금지
- vitest
- tsup
- pnpm
- `@modelcontextprotocol/sdk` (MCP)
- `simple-git` (named export 사용 — `import { simpleGit } from 'simple-git'`)
- `@notionhq/client`

## Final Note

매 commit 은 작은 정확한 한 걸음. 시스템은 작은 정확한 걸음들의 누적으로 자란다.
멈춰야 할 때 멈춘다.
