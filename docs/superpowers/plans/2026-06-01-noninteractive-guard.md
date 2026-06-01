# 대화형/비대화형 통합 가드 (Goal 11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** inquirer 쓰는 명령을 비-TTY(CI·파이프·MCP stdio)에서 안전하게 — 절대 안 멈춤 + 위험작업 무단실행 0 + MCP면 stdin 미접근 — 단일 계약으로 통합.

**Architecture:** 감지 단일출처 `isInteractive()` + 3버킷(auto-default=`promptOrDefault` / essential=`ensureInteractive` / destructive=기존 `runGuarded`). 새 분류 안 만들고 `risk-policy`/`safety-guard` 재사용.

**Tech Stack:** TypeScript, Node, commander, inquirer, vitest, tsup.

**설계 정본:** `docs/superpowers/specs/2026-06-01-mcp-noninteractive-guard-design.md`

---

### Task 1: `isInteractive` + `promptOrDefault` (감지 SoT)

**Files:**
- Modify: `src/lib/interactive.ts`
- Test: `tests/interactive.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `tests/interactive.test.ts` 에 추가

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { isInteractive, promptOrDefault } from '../src/lib/interactive.js'

describe('isInteractive (감지 SoT)', () => {
  const origTTY = process.stdin.isTTY
  const origEnv = process.env.VHK_FORCE_INTERACTIVE
  afterEach(() => { process.stdin.isTTY = origTTY; process.env.VHK_FORCE_INTERACTIVE = origEnv })

  it('stdin TTY 면 true', () => { process.stdin.isTTY = true; expect(isInteractive()).toBe(true) })
  it('비-TTY 면 false', () => { process.stdin.isTTY = undefined as never; expect(isInteractive()).toBe(false) })
  it('--yes 면 TTY 라도 false', () => { process.stdin.isTTY = true; expect(isInteractive({ yes: true })).toBe(false) })
  it('VHK_FORCE_INTERACTIVE=1 면 비-TTY 라도 true (Git Bash 탈출구)', () => {
    process.stdin.isTTY = undefined as never; process.env.VHK_FORCE_INTERACTIVE = '1'
    expect(isInteractive()).toBe(true)
  })
})

describe('promptOrDefault', () => {
  const origTTY = process.stdin.isTTY
  afterEach(() => { process.stdin.isTTY = origTTY })

  it('대화형 → ask 결과', async () => {
    process.stdin.isTTY = true
    expect(await promptOrDefault(async () => 'asked', 'fb')).toBe('asked')
  })
  it('비대화형 → ask 미호출 + fallback (MCP 불변식)', async () => {
    process.stdin.isTTY = undefined as never
    const ask = vi.fn(async () => 'asked')
    expect(await promptOrDefault(ask, 'fb')).toBe('fb')
    expect(ask).not.toHaveBeenCalled()
  })
  it('ask 가 abort 던지면 fallback', async () => {
    process.stdin.isTTY = true
    const ask = async () => { throw new Error('User force closed the prompt') }
    expect(await promptOrDefault(ask, 'fb')).toBe('fb')
  })
  it('ask 가 비-abort 에러면 rethrow', async () => {
    process.stdin.isTTY = true
    const ask = async () => { throw new Error('boom') }
    await expect(promptOrDefault(ask, 'fb')).rejects.toThrow('boom')
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm exec vitest --run tests/interactive.test.ts` → FAIL ("isInteractive is not a function").

- [ ] **Step 3: 구현** — `src/lib/interactive.ts` 상단(ensureInteractive 위)에 추가 + ensureInteractive 재배선

```ts
// 프롬프트 가능 여부 단일출처. stdin TTY + --yes 아님.
// VHK_FORCE_INTERACTIVE=1 = Git Bash/MinTTY 탈출구(E3). 비-TTY 는 undefined → !! (E1).
export function isInteractive(opts?: { yes?: boolean }): boolean {
  if (opts?.yes) return false
  if (process.env.VHK_FORCE_INTERACTIVE === '1') return true
  return !!process.stdin.isTTY
}

// benign 프롬프트: 비대화형이면 ask 호출 없이 fallback (stdin 미접근 = MCP 안전, E5).
export async function promptOrDefault<T>(
  ask: () => Promise<T>,
  fallback: T,
  opts?: { yes?: boolean }
): Promise<T> {
  if (!isInteractive(opts)) return fallback
  try {
    return await ask()
  } catch (err) {
    if (isPromptAbortError(err)) return fallback
    throw err
  }
}
```

그리고 기존 `ensureInteractive` 의 `if (process.stdin.isTTY) return true` 를 `if (isInteractive()) return true` 로 교체(축 통일).

- [ ] **Step 4: 통과 확인** — Run: `pnpm exec vitest --run tests/interactive.test.ts` → PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/interactive.ts tests/interactive.test.ts
git commit -m "feat(interactive): isInteractive/promptOrDefault 감지 SoT (#14)"
```

---

### Task 2: `restore` 를 HIGH_RISK_ACTIONS 에 추가 (R3)

**Files:**
- Modify: `src/lib/risk-policy.ts:8-17`
- Test: `tests/safety-coverage.test.ts` (또는 risk-policy 테스트 파일)

- [ ] **Step 1: 실패 테스트** — risk-policy 테스트에 추가

```ts
import { isHighRisk } from '../src/lib/risk-policy.js'
it('restore 는 high-risk (백업 덮어쓰기)', () => { expect(isHighRisk('restore')).toBe(true) })
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm exec vitest --run tests/safety-coverage.test.ts` → FAIL.

- [ ] **Step 3: 구현** — `HIGH_RISK_ACTIONS` 배열 끝에 `'restore'` 추가 + 주석에 restore 설명.

```ts
export const HIGH_RISK_ACTIONS = [
  'undo', 'deploy', 'publish', 'migrate', 'cloud-pull', 'resume', 'env-write', 'delete', 'restore',
] as const
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm exec vitest --run tests/safety-coverage.test.ts` → PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/risk-policy.ts tests/safety-coverage.test.ts
git commit -m "fix(safety): restore 를 HIGH_RISK_ACTIONS 에 추가 (R3)"
```

---

### Task 3: runGuarded lite 분기 — 비대화형 destructive 중단 (R13/E8)

**Files:**
- Modify: `src/lib/safety-guard.ts:47-67`
- Test: `tests/safety-guard.test.ts` (없으면 생성)

- [ ] **Step 1: 실패 테스트**

```ts
import { describe, it, expect, vi } from 'vitest'
import { runGuarded } from '../src/lib/safety-guard.js'

describe('runGuarded — lite 비대화형 destructive 중단 (R13)', () => {
  it('lite + 비대화형(isTTY:false) + 미승인 → 실행 안 함', async () => {
    const run = vi.fn(async () => 'ran')
    const { outcome } = await runGuarded('undo',
      { channel: 'cli', mode: 'lite', isTTY: false, approved: false }, run)
    expect(run).not.toHaveBeenCalled()
    expect(outcome.ran).toBe(false)
  })
  it('lite + 대화형(isTTY:true) → 경고 후 실행', async () => {
    const run = vi.fn(async () => 'ran')
    const { outcome } = await runGuarded('undo',
      { channel: 'cli', mode: 'lite', isTTY: true }, run)
    expect(outcome.ran).toBe(true)
  })
  it('lite + 비대화형 + --yes 승인 → 실행', async () => {
    const run = vi.fn(async () => 'ran')
    const { outcome } = await runGuarded('undo',
      { channel: 'cli', mode: 'lite', isTTY: false, approved: true }, run)
    expect(outcome.ran).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm exec vitest --run tests/safety-guard.test.ts` → 첫 테스트 FAIL (현재 lite 는 항상 실행).

- [ ] **Step 3: 구현** — 'warn' 분기 교체 + confirm 분기 축 stdin 통일(E8)

```ts
if (guard === 'warn') {
  // R13/E8: lite 여도 비대화형(stdin 비-TTY)+미승인이면 destructive 중단 — 경고 볼 사람 없음.
  const canConfirm = deps.isTTY ?? !!process.stdin.isTTY
  if (!deps.approved && !canConfirm) {
    log(`⚠️ 위험 작업(${action}) — lite 지만 비대화형+미승인 → 중단. (--yes 로 승인)`)
    return { outcome: { ran: false, guard, reason: 'lite-noninteractive-block' } }
  }
  log(`⚠️ 위험 작업(${action}) — lite 모드: 경고만 하고 진행합니다.`)
  return { outcome: { ran: true, guard, reason: 'lite-warn' }, result: await run() }
}
```

그리고 confirm 분기의 `const tty = deps.isTTY ?? !!process.stdout.isTTY` → `?? !!process.stdin.isTTY` (E8 축 통일).

- [ ] **Step 4: 통과 확인** — Run: `pnpm exec vitest --run tests/safety-guard.test.ts` → PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/safety-guard.ts tests/safety-guard.test.ts
git commit -m "fix(safety): lite 여도 비대화형+미승인 destructive 중단 (R13, stdin 축 E8)"
```

---

### Task 4: restore CLI 를 guardCli 로 래핑 + `--yes` (R3)

**Files:**
- Modify: `src/index.ts` (restore `.command()` 블록)

- [ ] **Step 1: 현재 restore 등록 확인** — Run: `rg -n "command\('restore'\)" src/index.ts` 로 블록 위치 찾기. 기존 형태:
`.command('restore').alias('복원')…​.action(async (…) => { await restore(…) })`

- [ ] **Step 2: 구현** — save(line 287) 패턴 그대로 적용. `--yes` 옵션 추가 + action 을 guardCli 경유:

```ts
  .option('--yes', '확인 없이 실행 (위험 작업 명시 승인)')
  .action(async (/* 기존 인자 */ opts: { yes?: boolean }) => {
    await guardCli('restore', opts?.yes === true, () => restore(/* 기존 인자 */))
  })
```

- [ ] **Step 3: 빌드 + 수동 확인**

Run: `pnpm build` → success.
Run: `echo "" | node dist/index.js restore` → "위험 작업(restore) … 확인 불가(비대화형). 실행하지 않았습니다." (크래시·실행 없음)

- [ ] **Step 4: 커밋**

```bash
git add src/index.ts
git commit -m "fix(restore): guardCli 래핑 + --yes — 비대화형 무가드 덮어쓰기 차단 (R3)"
```

---

### Task 5: init.ts 감지 SoT 통일 + check-goal-8 갱신 (R1/S2)

**Files:**
- Modify: `src/commands/init.ts` (isNonInteractive 제거 → isInteractive import)
- Modify: `scripts/check-goal-8.mjs` (assertion 갱신)
- Test: 기존 `tests/init-yes.test.ts`, `tests/init-adopt.test.ts` 회귀 확인

- [ ] **Step 1: 구현** — init.ts 상단 로컬 `function isNonInteractive(options)` 삭제, `import { isInteractive } from '../lib/interactive.js'` 추가. 모든 `isNonInteractive(options)` 호출 → `!isInteractive(options)` 로 교체 (collectAnswers, overwrite 가드 2곳, writeInitExtras 인자).

- [ ] **Step 2: check-goal-8 assertion 갱신** — init 에서 stdin/stdout 직접 참조가 사라지므로 SoT 기준으로 변경:

```js
// (구) must(/process.stdin.isTTY/.test(initSrc) && /process.stdout.isTTY/.test(initSrc), ...)
// (신)
const itSrc = read('src/lib/interactive.ts') ?? ''
must(/export function isInteractive/.test(itSrc) && /process\.stdin\.isTTY/.test(itSrc), 'isInteractive SoT (stdin 축)')
must(/from '\.\.\/lib\/interactive\.js'/.test(initSrc) && /isInteractive\(options\)/.test(initSrc), 'init 이 isInteractive SoT 사용')
```

- [ ] **Step 3: 회귀 테스트** — Run: `pnpm build && pnpm exec vitest --run tests/init-yes.test.ts tests/init-adopt.test.ts` → 모두 PASS.

- [ ] **Step 4: 수동 확인** — Run: `node dist/index.js init -y` (빈 임시폴더) → 안 멈추고 생성. `node dist/index.js goal check --id 8`(VHK_GATES_SKIP_DEEP=1) → 게이트 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/commands/init.ts scripts/check-goal-8.mjs
git commit -m "refactor(init): 로컬 isNonInteractive → isInteractive SoT (stdin 축, R1/S2)"
```

---

### Task 6: gate.ts — essential 진입 가드 (R2)

**Files:**
- Modify: `src/commands/gate.ts:41`

- [ ] **Step 1: 구현** — `import { ensureInteractive } from '../lib/interactive.js'` 추가. `export async function gate() {` 직후 첫 줄:

```ts
  if (!ensureInteractive('아이디어 검증은 대화형 질문이 필요합니다. 터미널(PowerShell 등)에서 직접 실행하거나, Git Bash 면 VHK_FORCE_INTERACTIVE=1 설정.')) return
```

- [ ] **Step 2: 빌드 + 실파이프 확인**

Run: `pnpm build`
Run: `echo "" | node dist/index.js gate` → "대화형 입력이 필요합니다…" 안내 후 깔끔히 종료(멈춤·크래시 없음). exitCode 1.

- [ ] **Step 3: 커밋**

```bash
git add src/commands/gate.ts
git commit -m "fix(gate): 비-TTY 진입 거부 (essential 버킷, R2)"
```

---

### Task 7: save.ts — 커밋메시지 기본값 + secrets 안전중단 (S1)

**Files:**
- Modify: `src/commands/save.ts:59-63` (secretsConfirm), `:84-88` (commit message)

- [ ] **Step 1: 구현 (커밋메시지)** — line 84 prompt 를 promptOrDefault 로 감쌈:

```ts
import { promptOrDefault } from '../lib/interactive.js'
// ...
const message = await promptOrDefault(
  async () => (await inquirer.prompt<{ message: string }>([{
    type: 'input', name: 'message', message: t('save.commitMessage'),
  }])).message,
  'chore: vhk save',
)
```

- [ ] **Step 2: 구현 (secretsConfirm — 안전중단)** — line 59 prompt 는 "시크릿 발견, 진행?" → 비대화형이면 **중단**(default false), 자동 진행 금지:

```ts
const proceed = await promptOrDefault(
  async () => (await inquirer.prompt<{ proceed: boolean }>([{
    type: 'confirm', name: 'proceed', message: t('save.secretsConfirm'), default: false,
  }])).proceed,
  false,   // 비대화형 = 시크릿 커밋 안 함 (안전)
)
```

- [ ] **Step 3: 빌드 + 수동 확인**

Run: `pnpm build`
Run: 변경 있는 임시 repo 에서 `echo "" | node dist/index.js save` → 멈춤 없이 `chore: vhk save` 메시지로 커밋(시크릿 없을 때). 크래시 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/commands/save.ts
git commit -m "fix(save): 비대화형 커밋메시지 기본값 + secrets 안전중단 (S1)"
```

---

### Task 8: 완전성 가드 + MCP 불변식 테스트

**Files:**
- Test: `tests/safety-coverage.test.ts` (확장)

- [ ] **Step 1: 완전성 테스트** — HIGH_RISK 전 액션이 index.ts 에서 guard 경유하는지 교차검증

```ts
import { readFileSync } from 'node:fs'
import { HIGH_RISK_ACTIONS } from '../src/lib/risk-policy.js'
it('HIGH_RISK 전 액션이 index.ts 에서 guardCli/guardCliDefer 경유', () => {
  const idx = readFileSync('src/index.ts', 'utf-8')
  for (const a of HIGH_RISK_ACTIONS) {
    expect(new RegExp(`guardCli(Defer)?\\('${a}'`).test(idx), `${a} unguarded`).toBe(true)
  }
})
```
주의: `env-write`/`delete` 는 매핑명(env-write↔env, delete↔?)이 다르면 매핑 테이블로 검증. 현재 env 는 `guardCli('env-write', …)` 로 등록됨. delete 가 미사용이면 HIGH_RISK 에서 제외하거나 예외목록 명시.

- [ ] **Step 2: MCP 불변식 테스트** (이미 Task 1 에 포함 — ask 미호출). 추가로 명시 주석.

- [ ] **Step 3: 통과 확인** — Run: `pnpm exec vitest --run tests/safety-coverage.test.ts` → PASS. (FAIL 시 누락 액션 guard 보강.)

- [ ] **Step 4: 커밋**

```bash
git add tests/safety-coverage.test.ts
git commit -m "test(safety): HIGH_RISK guard 완전성 + MCP stdin 불변식"
```

---

### Task 9: 전체 게이트 + 4환경 스파이크 + Goal 11 done

**Files:**
- Create: `scripts/check-goal-11.mjs` (via `vhk goal sync`, 후 goal-11 assertion 손추가)
- Create: `docs/troubleshooting/` 또는 spec 부록에 스파이크 결과 기록

- [ ] **Step 1: 빌드 + 전체 테스트** — Run: `pnpm build && pnpm exec vitest --run` → 전부 PASS (회귀 0).

- [ ] **Step 2: 게이트 스크립트 생성** — Run: `node dist/index.js goal sync` → `scripts/check-goal-11.mjs` 생성. 거기에 goal-11 고유 assertion 추가:

```js
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const it = read('src/lib/interactive.ts') ?? ''
must(/export function isInteractive/.test(it) && /export async function promptOrDefault/.test(it), 'isInteractive/promptOrDefault SoT')
must(/'restore'/.test(read('src/lib/risk-policy.ts') ?? ''), 'restore HIGH_RISK')
must(/lite-noninteractive-block/.test(read('src/lib/safety-guard.ts') ?? ''), 'lite 비대화형 destructive 중단 (R13)')
must(/ensureInteractive\(/.test(read('src/commands/gate.ts') ?? ''), 'gate essential 가드')
must(/guardCli\('restore'/.test(read('src/index.ts') ?? ''), 'restore guardCli 래핑')
```

- [ ] **Step 3: 4환경 실측 스파이크** — 각 환경서 실행, 결과 기록:

| 환경 | 명령 | 기대 |
| --- | --- | --- |
| PowerShell (TTY) | `vhk gate` | 정상 프롬프트 |
| Git Bash | `vhk gate` | 거부+힌트 / `VHK_FORCE_INTERACTIVE=1 vhk gate` → 프롬프트 |
| 파이프 | `echo "" | vhk gate` / `... undo` | gate 거부, undo 중단 (멈춤 없음) |
| MCP stdio | MCP tool 로 read-only 호출 | RPC 파이프 정상 (stdin 미접근) |

결과를 spec §6 또는 troubleshooting 에 한 줄씩 기록.

- [ ] **Step 4: Goal 11 done**

Run: `node dist/index.js goal done --id 11` → 풀게이트(typecheck+test+build+assertion) 통과 → status DONE.

- [ ] **Step 5: 커밋 + PR**

```bash
git add scripts/check-goal-11.mjs goals/11-noninteractive-guard.md docs/
git commit -m "feat(safety): 대화형/비대화형 통합 가드 P1 완료 (Goal 11, #14)"
```
브랜치 push → PR (base main) → merge.

---

## Self-Review (작성자 체크 — 완료)

- **스펙 커버리지:** §3 SoT→T1, §4 restore→T2/T4, R13→T3, init→T5, gate→T6, save S1→T7, 완전성/불변식→T8, 스파이크/게이트→T9. ✅ (P2 항목은 Goal 12 — 의도적 제외)
- **Placeholder:** Task 4 의 "기존 인자"는 실행 시 restore 시그니처 확인 필요 — Step 1 에서 rg 로 확정하도록 명시함(허용). 나머지 코드 완비.
- **타입 일관:** `isInteractive(opts?: {yes?})`, `promptOrDefault<T>(ask, fallback, opts?)`, `lite-noninteractive-block` reason 문자열 — T1/T3/T9 일관.
