---
vhk_format: 1
type: meta
project: vhk-cli
version: v1.1
---

# Goal _meta: Cross-cutting invariants (VHK)

이 goal 은 numeric goal 스택과 별개의 **메타 게이트 모음**이다.
모든 goal 에 공통으로 적용되는 universal claim — typecheck / tests / build —
을 한 곳에 모아, 각 goal-local gate 가 자기 goal 고유의 universal claim 에만
집중할 수 있게 한다.

> 출처: vspec/vooster `goals/_meta.md` 패턴 차용. VHK 맥락에 맞게
> 단일 패키지(pnpm 단일 워크스페이스, eslint 미설정) 기준으로 변형.

## Why this exists

이전엔 같은 명령(`pnpm test:run`, `tsc --noEmit`, `pnpm build`)이 각 goal
체크 스크립트에 중복되었다. 중복을 한 곳에 모으면:

- 각 goal-local gate 가 자기 universal claim 에만 집중
- 변경 감지 캐시(향후 도입) 효율 상승
- CI 와 로컬 사이의 실행 주체 분리 가능

## The Goal

다음 조건이 **모두** 성립한다:

1. **Every TypeScript source file** in `src/` 와 `tests/` 가 `tsc --noEmit`
   기준으로 컴파일된다 (`pnpm exec tsc --noEmit`).
2. **Every vitest test** 가 통과한다 (`pnpm test:run`). 현재 baseline 267+ (Goal 1 머지 후).
3. **tsup build** 가 성공한다 (`pnpm build`). `dist/index.js` 와
   `dist/mcp/index.js` 가 생성된다.
4. **새 기능에 대한 테스트가 최소 1개 이상** 추가됨 (PR 단위).
   — Goal 28: `vhk testmap` 으로 변경 기능 소스(src/commands·src/lib) ↔ 테스트 매핑을 점검한다.
   기본은 경고만, `VHK_TEST_FIRST=1` 일 때만 HARD 차단(과안정화 경계 — 실사용 신호 전 강제 안 함).
5. **README.md / COMMANDS.md** 명령어 표에 신규 명령어가 반영됨.
6. **완료(DONE) 표시된 goal 은 비스텁 게이트를 가진다** (Goal 60, M.4). status `DONE`
   인데 `check-goal-<id>.mjs` 가 미싱이거나 빈 스캐폴드(`고유 검증 (직접 추가)` 마커만)면
   "헛통과 DONE" — `check-meta` 가 FAIL. `NOT_STARTED`/`IN_PROGRESS`/`BLOCKED` 은 제외
   (미구현/진행 중/미주장 — 스텁 게이트 정상. IN_PROGRESS 완화: 머지 시 in-flight goal 오탐 방지).

각 condition 은 source-of-truth 로부터 enumerate 된다:

| Condition | Source of truth | Iteration |
| --- | --- | --- |
| typecheck | `tsconfig.json` | `pnpm exec tsc --noEmit` |
| tests | `vitest` 자동 탐색 (`tests/**`) | `pnpm test:run` |
| build | `tsup.config.ts` | `pnpm build` |
| 완료-스텁 0 | `goals/*.md` ↔ `scripts/check-goal-*.mjs` | `findCompletedStubGates` (`scripts/_lib.mjs`) |

## Env flags

| Env | Effect |
| --- | --- |
| `VHK_GATES_SKIP_DEEP=1` | M.2 (vitest) 와 M.3 (build) 를 스킵. 빠른 iteration 용 typecheck-only 패스. |
| `VHK_GATES_SKIP_META=1` | numeric goal sweep 에서 `_meta` 제외 (CI 에서 별도 step 으로 enforce 할 때 사용). |

## Forbidden Actions (전역)

- `node_modules/` 직접 수정 금지
- `package.json` 의 기존 명령어 시그니처 breaking change 금지 (GA 정책)
- `execSync` 신규 사용 금지 → `safeExecFile` 사용
- MCP 모드에서 inquirer 프롬프트 호출 금지 (TTY 없음)
- 토큰/시크릿 코드·커밋에 평문 노출 금지 (`.env` + `.gitignore`)

## Relation to numeric goals

| 위치 | _meta 로 이동 |
| --- | --- |
| `goals/0-mcp-full-coverage` typecheck 중복 | M.1 |
| `goals/0-mcp-full-coverage` 테스트 중복 | M.2 |
| `goals/1-goal-command` build 중복 | M.3 |

각 numeric goal 의 `.md` 본문에서 cross-cutting 부분은 "see goals/_meta.md"
포인터로 대체되어 있다.
