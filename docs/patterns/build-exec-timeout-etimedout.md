---
패턴명: 자식 프로세스 timeout 판별은 ETIMEDOUT 단독으로, killed/signal 휴리스틱 금지
카테고리: build
출처프로젝트: VHK (vhk-cli)
태그: [child-process, spawnSync, timeout, ETIMEDOUT, SIGINT, error-handling, nodejs]
발견일: 2026-05-30
출처DevLog: docs/log/2026-05-30-v1.6.0-drift-cloud-robustness.md
---

# 패턴: 자식 프로세스 timeout 판별은 ETIMEDOUT 단독으로

## 증상

CLI/툴이 외부 명령(`build`, `test`, `npm view` 등)을 `child_process` 로 실행하면서 hang 방지용 backstop timeout 을 건다. 그런데 timeout 식별을 `killed && signal` 로 하면, 사용자가 Ctrl+C(SIGINT)로 직접 중단하거나 부모가 SIGTERM 을 보낸 경우까지 "시간 초과"로 잘못 보고한다.

```ts
// ❌ 오라벨 발생 코드
function isTimeoutError(e: { killed?: boolean; signal?: string }): boolean {
  return Boolean(e.killed) && Boolean(e.signal) // SIGINT/SIGTERM 도 여기 걸림
}
```

결과적으로 사용자가 의도적으로 끊은 작업에도 다음과 같은 오해 소지 메시지가 뜬다.

```
명령 시간 초과 (timeout 600000ms): pnpm build
```

실제로는 timeout 이 발사된 적이 없는데도, "killed 됐고 signal 이 있으니 timeout 이다"라는 휴리스틱이 외부 시그널을 timeout 으로 둔갑시킨다. 사용자/상위 자동화는 잘못된 원인(느린 빌드)에 매달려 디버깅한다.

## 원인

`child_process.spawnSync`(및 이를 쓰는 `execFileSync`)는 **timeout 으로 자식을 죽인 경우에만** `error.code === 'ETIMEDOUT'` 를 크로스플랫폼으로 세팅한다. 반면 `killed`/`signal` 필드는 timeout 종료뿐 아니라 **모든 시그널 종료**(외부 Ctrl+C → SIGINT, 부모의 SIGTERM, OOM killer 등)에서도 채워진다.

- `killed: true` + `signal: 'SIGTERM'` → timeout 일 수도, 외부 종료일 수도 있다 (구별 불가).
- `code: 'ETIMEDOUT'` → 오직 spawnSync 의 timeout 발사일 때만 존재한다 (명시적 신호).

즉 `killed && signal` 은 timeout 의 **충분조건이 아니라 필요조건의 일부**일 뿐이다. 충분조건이 아닌 것을 판별에 쓰면 거짓 양성(false positive)이 난다.

## 해결

종료 원인은 휴리스틱이 아니라 런타임이 주는 **명시적 code** 로만 판별한다. `ETIMEDOUT` 단독 검사로 바꾸고, timeout 을 애초에 걸지 않은 호출은 검사 자체를 건너뛴다.

`src/lib/exec.ts` 의 판별 함수:

```ts
// execFileSync(=spawnSync) 가 timeout 으로 죽인 경우 식별.
// spawnSync 는 timeout 발사 시 err.code='ETIMEDOUT' 를 크로스플랫폼으로 설정한다.
// killed/signal 로도 판별하면 외부 시그널(Ctrl+C 등)에 의한 종료를 timeout 으로 오라벨할 수
// 있으므로 ETIMEDOUT 만 신뢰한다.
function isTimeoutError(e: { code?: string }, timeout?: number): boolean {
  if (!timeout) return false
  return e.code === 'ETIMEDOUT'
}
```

호출부는 이 판별로만 메시지를 분기한다 (`killed`/`signal` 은 보지 않는다):

```ts
} catch (err) {
  const e = err as {
    stdout?: Buffer | string
    stderr?: Buffer | string
    message?: string
    killed?: boolean
    signal?: string
    code?: string
  }
  const stdout = e.stdout ? e.stdout.toString() : ''
  let msg = e.message ?? String(err)
  if (isTimeoutError(e, timeout)) {
    msg = `명령 시간 초과 (timeout ${timeout}ms): ${cmd} ${args.join(' ')}`.trim()
  }
  return { ok: false, err: msg, out: stdout.trim() }
}
```

**timeout 값 정책**도 함께 분리한다 — 정상 작업이 걸리지 않게 종류별로 다른 backstop 을 둔다.

```ts
// 기본 timeout 정책 — 외부 명령 hang 방지 backstop.
// 10분: 정상적인 build/test/publish(2FA 제외) 는 절대 안 걸리고, 진짜 hang 만 끊는다.
export const DEFAULT_EXEC_TIMEOUT_MS = 600_000
// 네트워크 호출 (npm view 등) 전용 — 레지스트리 장애 시 빠르게 실패.
export const NETWORK_EXEC_TIMEOUT_MS = 30_000
```

```ts
// 적용할 timeout(ms) 계산. undefined 반환 = timeout 미적용.
function resolveTimeout(timeoutMs: number | undefined, fallback: number): number | undefined {
  const v = timeoutMs === undefined ? fallback : timeoutMs
  return v > 0 ? v : undefined
}
```

스트리밍/대화형 경로(2FA OTP 입력, `deploy` 실시간 로그 등)는 **timeout 면제**가 기본이다. 사용자 입력 대기가 정상 동작이므로 호출부가 명시할 때만 opt-in 한다.

```ts
export function safeExecFileStream(
  cmd: string,
  args: string[],
  opts: SafeExecStreamOptions = {}
): StreamResult {
  const { bin, argv } = resolveCmd(cmd, args)
  // stream 은 기본 timeout 없음 (2FA OTP 입력 등 사용자 대기가 정상). opts 로만 opt-in.
  const timeout = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : undefined
  ...
}
```

정리하면 세 가지 원칙이다.
1. 종료 원인은 명시적 `code === 'ETIMEDOUT'` 로만 판별, `killed`/`signal` 휴리스틱 금지.
2. backstop timeout 은 작업 성격별로 차등: 빌드/테스트는 넉넉히(~10분), 네트워크는 짧게(~30초).
3. 스트리밍/대화형은 timeout 면제(opt-in), 사용자 입력 대기를 hang 으로 오인하지 않게.

## 적용 조건

- ✅ `spawnSync`/`execFileSync`/`execSync` 로 외부 명령을 동기 실행하며 hang 방지 timeout 을 거는 경우
- ✅ 빌드/테스트/패키지 명령처럼 정상 실행 시간이 길고, 사용자가 Ctrl+C 로 중단할 수 있는 경우
- ✅ 종료 원인(timeout vs 외부 시그널 vs 일반 실패)에 따라 메시지/재시도/로그를 다르게 처리해야 하는 경우
- ✅ 네트워크 의존 명령(레지스트리 조회 등)에 별도의 짧은 backstop 을 주고 싶을 때
- ❌ 비동기 `spawn`/`exec`(콜백·Promise) 의 경우 — 비동기는 `err.signal === 'SIGTERM'` + 직접 건 타이머로 판단하거나 `AbortController` 를 쓰므로 판별 로직이 다르다 (그래도 외부 시그널과의 구별 원칙은 동일하게 유지)
- ❌ 대화형/스트리밍 명령(OTP 입력, 실시간 로그)에 무조건 timeout 을 거는 것 — 사용자 대기가 정상이므로 면제가 기본, 명시 opt-in 만 허용

## 검증

`tests/exec.test.ts` 가 timeout 발사·면제·정상 완료를 각각 검증한다.

```ts
it('safeExecFile: timeoutMs 초과 시 ok=false + 시간 초과 메시지', async () => {
  const { safeExecFile } = await import('../src/lib/exec.js')
  // setInterval 로 절대 self-exit 안 하는 프로세스 → 느린 머신에서도 timeout 만이 종료 사유 (flaky 제거).
  const result = safeExecFile('node', ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 200 })
  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(result.err).toMatch(/시간 초과|timeout/i)
  }
})

it('safeExecFile: timeoutMs<=0 이면 timeout 비활성 (정상 완료)', async () => {
  const { safeExecFile } = await import('../src/lib/exec.js')
  const result = safeExecFile('node', ['--version'], { timeoutMs: 0 })
  expect(result.ok).toBe(true)
})

it('exec: 기본 timeout 상수 export 확인', async () => {
  const { DEFAULT_EXEC_TIMEOUT_MS, NETWORK_EXEC_TIMEOUT_MS } = await import('../src/lib/exec.js')
  // 네트워크 timeout 은 기본 backstop 보다 짧아야 의미가 있다.
  expect(NETWORK_EXEC_TIMEOUT_MS).toBeLessThan(DEFAULT_EXEC_TIMEOUT_MS)
})
```

테스트가 `setInterval`(절대 self-exit 안 함) 프로세스를 쓰는 이유도 같은 맥락이다 — 종료 사유를 timeout 하나로 고정해 flaky 를 제거하고, `killed`/`signal` 이 아니라 timeout 발사만이 종료 원인이 되도록 조건을 통제한다.
