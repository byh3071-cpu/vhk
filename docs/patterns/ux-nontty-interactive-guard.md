---
패턴명: 비-TTY 진입을 가정한 대화형 프롬프트 가드 + 전역 EOF catch
카테고리: ux
출처프로젝트: VHK (vhk-cli)
태그: [cli, tty, stdin, inquirer, readline, eof, ci, error-handling, nodejs]
발견일: 2026-05-31
출처DevLog: docs/log/2026-05-31-v1.6.2-dogfooding-release.md
---

# 패턴: 비-TTY 진입을 가정한 대화형 프롬프트 가드 + 전역 EOF catch

## 증상

대화형 프롬프트(`inquirer`, `readline`, `prompts` 등)를 호출하는 CLI 명령을 비-TTY stdin 환경에서 실행하면 readline 이 즉시 닫힌 상태로 프롬프트가 열려 크래시한다.

재현 경로(모두 stdin 이 TTY 가 아님):

```bash
echo "" | mycli recap          # 파이프
mycli recap < /dev/null        # EOF 리다이렉트
mycli recap                    # CI 러너 / Docker / 백그라운드 잡
```

에러 출력:

```
Error [ERR_USE_AFTER_CLOSE]: readline was closed
    at Interface.[kError] (node:internal/readline/interface)
    ...
node:internal/process/promises: Unsettled top-level await ...
```

- 종료 코드 13(`ERR_USE_AFTER_CLOSE` unhandled rejection) 으로 비정상 종료.
- top-level `await` 를 try/catch 없이 쓴 진입부에서는 `Unsettled top-level await` 경고까지 동반.
- 사용자에게 노출되는 건 스택 트레이스뿐 — "왜 안 되는지" 안내가 전혀 없다.

## 원인

대화형 라이브러리는 `process.stdin` 에 readline 인터페이스를 붙여 한 줄씩 입력을 기다린다. stdin 이 TTY 가 아니면(파이프/리다이렉트/CI):

1. stdin 이 데이터 없이 곧바로 `end`(EOF) 를 발생 → readline 이 닫힘.
2. 프롬프트는 닫힌 readline 에 다시 쓰려다 `ERR_USE_AFTER_CLOSE` 를 던진다.
3. 이 에러가 `parseAsync()`(또는 핸들러)의 Promise rejection 으로 전파되는데, top-level `await` 를 try/catch 없이 호출했다면 잡히지 않고 프로세스가 비정상 종료한다.

즉 "사용자가 항상 키보드 앞에 있다"는 암묵 가정이 깨지는 지점이다. CI·파이프라인·스크립트·다른 도구의 자식 프로세스로 호출되는 순간 모든 대화형 경로는 비-TTY 진입을 받는다.

## 해결

두 겹의 방어선을 둔다. (1) 각 대화형 명령 **진입부**에서 TTY 여부를 먼저 검사해 friendly 안내 후 우아하게 빠진다. (2) 그래도 새어나오는 EOF/강제종료 류 에러를 **전역 catch** 에서 잡아 스택 트레이스 대신 안내 메시지로 종료한다.

### 1. 공용 가드 헬퍼 (`src/lib/interactive.ts`)

```ts
import chalk from 'chalk'

/**
 * 대화형 명령 진입 가드 — 비-TTY(파이프/CI/EOF stdin)면 inquirer 프롬프트가
 * `ERR_USE_AFTER_CLOSE` 로 크래시하므로, 진입부에서 friendly 안내 + 비-0 종료 신호 후 중단한다.
 * 반환 true = 대화형 진행 가능.
 */
export function ensureInteractive(hint = ''): boolean {
  if (process.stdin.isTTY) return true
  console.error(chalk.yellow('  ⚠️  이 명령은 대화형 입력이 필요합니다 — 비-TTY/파이프 환경에서는 실행할 수 없어요.'))
  if (hint) console.error(chalk.dim(`     ${hint}`))
  process.exitCode = 1
  return false
}

/** 프롬프트 강제 종료/EOF 류 에러인지 — 전역 catch 에서 friendly 처리용. */
export function isPromptAbortError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /ERR_USE_AFTER_CLOSE|force closed|ExitPromptError|readline was closed|User force closed/i.test(msg)
}
```

### 2. 대화형 명령 진입부에서 가드 호출 (`src/commands/recap.ts`)

```ts
import { ensureInteractive } from '../lib/interactive.js'

// ... 비대화형으로 보여줄 정보(분석 결과 등)는 먼저 출력한 뒤 ...
console.log('')
// 비-TTY 면 프롬프트 크래시 대신 friendly 안내 + exit 1.
if (!ensureInteractive('회고 입력은 대화형으로만 가능합니다.')) return

const answers = await inquirer.prompt([
  { type: 'input', name: 'summary', message: ko.recap.summary },
  // ...
])
```

`return` 으로 빠지므로 프롬프트가 아예 열리지 않는다. `process.exitCode = 1` 을 세팅해 호출 측(스크립트/CI)이 "실행 불가"를 종료 코드로 감지할 수 있다 — `throw`/`process.exit()` 대신 `exitCode` 만 세팅하면 이미 출력한 정보가 끊기지 않는다.

### 3. 진입부를 try/catch 로 감싸고 전역 catch 에서 분류 (`src/index.ts`)

```ts
import { isPromptAbortError } from './lib/interactive.js'

if (isMainModule) {
  // parseAsync 를 try/catch 로 감싸 unsettled top-level await 경고 제거 +
  // 비-TTY/EOF 프롬프트 크래시(ERR_USE_AFTER_CLOSE)를 friendly 종료로 처리.
  try {
    const nlInput = detectNaturalLanguageInput(process.argv)
    if (nlInput !== null) {
      await runNaturalLanguageRoute(nlInput)
    } else {
      await program.parseAsync(process.argv)
    }
  } catch (err) {
    if (isPromptAbortError(err)) {
      console.error(chalk.yellow('\n  ⚠️  대화형 입력이 취소/종료됐습니다. (비대화형 환경에서는 해당 명령을 쓸 수 없어요)'))
    } else {
      console.error(chalk.red(`\n❌ ${err instanceof Error ? err.message : String(err)}`))
    }
    process.exitCode = 1
  }
}
```

핵심:

- top-level `await` 를 **반드시** `try/catch` 로 감싼다 → `Unsettled top-level await` 경고 제거.
- `isPromptAbortError()` 로 EOF/강제종료(Ctrl+C 의 `ExitPromptError` 포함) 류만 구분해 friendly 메시지로, 그 외 진짜 에러는 빨간 메시지로 분기.
- 둘 다 `process.exitCode = 1` → 비정상 종료를 종료 코드로 정직하게 전달하되 크래시 스택은 숨긴다.

## 적용 조건

- ✅ 사용자 입력을 기다리는 대화형 프롬프트(inquirer / prompts / readline / Ink 입력 등)를 호출하는 모든 CLI 명령.
- ✅ CI·파이프·`< /dev/null`·다른 도구의 자식 프로세스 등 비-TTY 호출 가능성이 있는 도구(= 사실상 모든 CLI).
- ✅ top-level `await` 또는 async 진입부를 가진 ESM CLI 엔트리(전역 try/catch 가 없으면 unsettled await 경고까지 동반).
- ✅ Ctrl+C 로 프롬프트를 강제 종료(`ExitPromptError`) 했을 때도 스택 대신 깔끔히 끝내고 싶을 때.
- ❌ 대화형 입력이 전혀 없는 순수 배치/비대화형 명령(가드 불필요).
- ❌ `--yes`/`--non-interactive` 같은 플래그로 입력값을 모두 인자로 받도록 설계된 경로 — 이 경우 프롬프트를 호출하지 않으므로 가드 대신 플래그 분기로 처리한다.
- ❌ TTY 를 직접 다루는 풀스크린 TUI(별도 입력 모델) — 동일 정규식이 안 맞을 수 있으니 라이브러리별 에러 식별자를 확인할 것.

## 검증

`tests/interactive.test.ts` — `process.stdin.isTTY` 를 `Object.defineProperty` 로 모사해 양쪽 분기를 검증한다.

```ts
function setTTY(value: boolean | undefined): boolean | undefined {
  const orig = process.stdin.isTTY
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true })
  return orig
}

it('비-TTY 면 false 반환 + exitCode 1 (크래시 대신 friendly 중단)', () => {
  const orig = setTTY(false)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(ensureInteractive('hint')).toBe(false)
  expect(process.exitCode).toBe(1)
  vi.restoreAllMocks()
  setTTY(orig)
})

it('TTY 면 true 반환', () => {
  const orig = setTTY(true)
  expect(ensureInteractive()).toBe(true)
  expect(process.exitCode).toBe(0)
  setTTY(orig)
})

it('isPromptAbortError — EOF/강제종료 류만 true', () => {
  expect(isPromptAbortError(new Error('Error [ERR_USE_AFTER_CLOSE]: readline was closed'))).toBe(true)
  expect(isPromptAbortError(new Error('User force closed the prompt'))).toBe(true)
  expect(isPromptAbortError(new Error('ExitPromptError'))).toBe(true)
  expect(isPromptAbortError(new Error('일반 에러'))).toBe(false)
})
```

`isTTY` 를 직접 모사할 수 있다는 점이 핵심 — 실제 파이프/EOF 를 띄우지 않고도 비-TTY 진입을 단위 테스트로 재현한다. 대화형 명령 테스트(`tests/design.test.ts`)도 `beforeEach` 에서 `isTTY` 를 `true` 로 강제해 가드를 통과시킨 뒤 프롬프트 로직을 검증한다.
