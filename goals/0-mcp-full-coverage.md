---
vhk_format: 1
type: goal
id: 0
title: MCP 풀 커버리지 — 10 tool → 24 tool 확장
status: DONE
priority: P0
version: v1.1
completed: 2026-05-27
---

# Mission: Expose every CLI command through MCP (Goal 0 dogfooding)

## Your Identity

You are a TypeScript engineer working in the small-step style.
Each new MCP tool is one self-contained patch:
register → schema → handler delegate → test → docs.
You never break an existing tool's input/output contract.
You delegate to the matching `src/commands/*.ts` function instead of
re-implementing logic.

## The Goal

VHK 의 모든 CLI 명령어가 MCP tool 로도 노출된다. 구체적으로:

1. 기존 10 tool (`save`, `undo`, `status`, `diff`, `ship`, `doctor`, `check`,
   `recap`, `env`, `env-check`) 은 시그니처 변경 없이 유지된다.
2. 신규 14+ tool 이 `src/mcp/server.ts` 에 등록된다. 후보:
   - `gate`, `init`, `sync`, `secure`, `deploy`, `publish`,
   - `design`, `theme`, `ref` (add/list/open 통합 또는 분리),
   - `harness`, `audit`, `migrate`, `update`,
   - `context`, `memory`, `brief`,
   - `start` (대화형 마법사 — MCP 비호환 시 OUT 처리하고 사유 기록).
3. 각 신규 tool 에 대응되는 `tests/mcp/<tool>.test.ts` 가 존재하고 통과한다.
4. `vhk mcp` 기동 시 24+ tool 목록이 출력된다 (수동 확인 OK, 자동 테스트 권장).
5. inquirer 프롬프트가 MCP 모드에서 호출되지 않는다 (TTY 가드 또는
   non-interactive 분기).
6. `_meta` 의 모든 게이트가 통과한다 (typecheck / tests / build).

## Mandatory Reading Order

매 iteration 마다 아래 순서로 읽어라. 이미 읽은 파일은 `bash
scripts/check-goal-0.sh` 가 변경 없음을 보고하면 재독을 생략한다.

1. `CLAUDE.md` + `AGENTS.md` — 프로젝트 규칙
2. `goals/_meta.md` — 공통 게이트
3. `src/mcp/server.ts` — 현재 MCP 서버 구조 (단일 파일 registry)
4. `src/commands/<대상>.ts` — handler 가 위임할 CLI 구현체 (한 번에 1개)
5. `tests/mcp/` 또는 `tests/` 의 기존 MCP 테스트 — 신규 테스트 작성 시 참고
6. `docs/state/next-task.md` — 현재 진행할 태스크
7. `docs/state/blockers.md` — 막힌 것들

## Tool 등록 패턴 (server.ts 단일 파일)

기존 패턴 (`server.ts` 의 `save`/`undo`/... 섹션) 을 그대로 따른다.
신규 tool 추가 시 별도 `handlers/` 디렉토리는 만들지 않는다 — 단일 파일
registry 가 현재의 SoT 다. 디렉토리 분리는 본 goal 범위 밖.

```ts
server.registerTool(
  '<tool-name>',
  {
    description: '<한국어 짧은 설명>',
    inputSchema: { /* zod schema */ },
  },
  async (input) => {
    // 1) git/파일 사전조건 체크 (필요 시)
    // 2) src/commands/<x>.ts 의 함수 호출 또는 safeExecFile 위임
    // 3) { content: [{ type: 'text', text: '...' }] } 반환
  }
)
```

## Completion Check

`bash scripts/check-goal-0.sh` 가 exit 0 을 반환한다. 구체적으로:

- [ ] `_meta` 모든 게이트 통과
- [ ] `src/mcp/server.ts` 의 `registerTool` 호출 수 ≥ 24
- [ ] 신규 tool 각각에 대해 `tests/mcp/<tool>.test.ts` 또는
      `tests/<tool>.mcp.test.ts` 가 존재
- [ ] inquirer import 가 server.ts 에 없음 (또는 TTY 가드 적용)
- [ ] `README.md` / `COMMANDS.md` 의 MCP 섹션이 신규 tool 을 반영

## Forbidden Actions

- 기존 10 tool 의 input/output 시그니처 변경 (Breaking change)
- handler 내부에서 `process.exit()` 호출
- `execSync` 신규 사용 (→ `safeExecFile` 사용)
- MCP handler 안에서 inquirer 호출 (TTY 없음)
- `node_modules/` 직접 수정
- `package.json` 의 기존 명령어 시그니처 변경 (GA 정책)
- 한 iteration 에서 여러 tool 동시 추가 (한 번에 1개 — 작은 커밋)
- `start` 명령처럼 본질적으로 대화형인 커맨드를 강제로 MCP 화 (대신 OUT 결정 + 사유 기록)

## When Stuck

3 iteration 동안 진전이 없으면:

1. `docs/state/blockers.md` 에 증상 + 시도한 것 + 현재 상태 기록.
2. 현재 tool 건너뛰고 다음 후보 tool 로 이동.
3. 블로커 3 개 누적 시 `.vhk/HARD_STOP` 생성 → 사람에게 에스컬레이션.

## Updating State

iteration 끝마다 `docs/state/next-task.md` 와 `docs/state/learnings.md` 를
손으로 업데이트한다. 자동화는 Goal 2 (`vhk learn`, `vhk blocker`) 에서
제공된다.
