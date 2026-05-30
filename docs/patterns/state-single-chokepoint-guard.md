---
패턴명: 위험 작업 가드는 단일 통제점 + 완전성 게이트로 집행한다
카테고리: state
출처프로젝트: VHK (vhk-cli)
태그: [safety, guard, chokepoint, security, completeness-test, drift-detection, policy-as-data]
발견일: 2026-05-31
출처DevLog: docs/log/2026-05-31-safety-batches.md
---

# 패턴: 위험/파괴적 작업 가드 — 분산 if 배선 대신 단일 chokepoint + 완전성 매핑 테스트

## 증상

되돌리기 어렵거나 외부에 영향을 주는 작업(배포·삭제·되돌리기·시크릿 파일 쓰기 등)에 "확인 가드"를 호출부마다 손으로 `if` 배선했더니, 일부 진입 경로가 가드를 안 거치는 바이패스가 생긴다.

- 같은 위험 작업이 여러 입구(대화형 CLI / 에이전트 도구 / 자연어 라우터 / 인라인 메뉴 switch)에서 호출되는데, 새 입구를 추가할 때 가드 한 줄을 빠뜨림.
- 자연어 라우터가 핸들러를 **직접** 호출해 확인 단계를 건너뜀:

```ts
// 위험: dispatch 가 가드 없이 핸들러 직호출
case 'deploy': return deploy()   // ← 확인 절차 우회
```

- 또 다른 함정: 안전장치 "파일"(예: `.vhk/HARD_STOP` 같은 트립와이어)을 만들어 두었지만, 그 파일을 **읽고 차단하는 가드 호출이 어디에도 없으면** 파일은 장식일 뿐 아무것도 막지 못한다.
- 비대화형(TTY 아님) 환경에서 확인 프롬프트가 그냥 통과되어 위험 작업이 무인 실행되는 경우도 발생.

## 원인

- **정책과 집행의 분산.** "무엇이 위험한가"의 판단과 "어떻게 막을까"의 코드가 호출부마다 흩어지면, 입구가 N개일 때 가드도 N군데에 중복 배선해야 하고 한 곳만 누락돼도 구멍이 생긴다. (드리프트)
- **별도 손관리 리스트.** 위험 작업 목록을 여러 파일에 각자 하드코딩하면 동기화가 깨진다.
- **트립와이어 ≠ 가드.** 신호 파일의 *존재*와 그 신호를 *집행*하는 코드는 별개다. 집행 호출이 없으면 신호는 무효.
- **완전성 검증 부재.** "모든 위험 작업이 빠짐없이 가드를 거치는가"를 검사하는 테스트가 없으면, 신규 작업 추가 시 누락이 조용히 통과한다.

## 해결

핵심 3원칙: ① 정책은 데이터 한 곳에, ② 집행은 단일 chokepoint 하나로, ③ 누락은 완전성 테스트가 FAIL.

### 1) 정책을 단일 소스(데이터)로 — `src/lib/risk-policy.ts`

위험 작업 목록과 채널·모드별 가드 결정을 한 파일에만 둔다. 다른 곳에 같은 리스트를 나열하지 않는다.

```ts
/** 정책 적용 대상 high-risk 액션 — 되돌리기 어렵거나 외부에 영향 주는 작업. */
export const HIGH_RISK_ACTIONS = [
  'undo', 'deploy', 'publish', 'migrate',
  'cloud-pull', 'resume', 'env-write', 'delete',
] as const

export type Channel = 'cli' | 'mcp' | 'nl'
export type Guard = 'confirm' | 'preview' | 'warn' | 'allow'

export function isHighRisk(action: string): action is HighRiskAction {
  return (HIGH_RISK_ACTIONS as readonly string[]).includes(action)
}

/** 액션·모드·채널 → 가드 결정 (정책은 여기서만 내린다) */
export function resolveGuard(action: string, mode: SafetyMode, channel: Channel): Guard {
  const guarded = isHighRisk(action) || (mode === 'strict' && STRICT_EXTRA_ACTIONS.has(action))
  if (!guarded) return 'allow'
  if (mode === 'lite') return 'warn'                 // 막지 않고 경고만
  return channel === 'cli' ? 'confirm' : 'preview'   // CLI=y/N, 에이전트/자연어=미리보기
}
```

자연어 라우터가 가드를 거쳐야 하는 명령도 이 파일에 **단일 매핑**으로 등록한다(별도 손관리 리스트 금지):

```ts
export const NL_GUARDED_ACTIONS: Readonly<Record<string, string>> = {
  undo: 'undo', deploy: 'deploy', publish: 'publish', migrate: 'migrate',
  'cloud-pull': 'cloud-pull', env: 'env-write', save: 'save', sync: 'sync',
}
```

### 2) 모든 high-risk 실행을 단일 chokepoint로 통과 — `src/lib/safety-guard.ts`

CLI·에이전트·자연어 세 입구 모두 "실제 실행" 직전에 이 함수 **하나**를 통과시킨다. 정책 결정은 `resolveGuard` 에 위임하고, 여기선 결정을 집행만 한다.

```ts
export async function runGuarded<T>(
  action: string,
  deps: GuardDeps,
  run: () => Promise<T> | T
): Promise<{ outcome: GuardedOutcome; result?: T }> {
  const mode: SafetyMode = deps.mode ?? readConfig().safetyMode
  const log = deps.log ?? (() => {})
  const guard = resolveGuard(action, mode, deps.channel)

  if (guard === 'allow') {
    return { outcome: { ran: true, guard, reason: 'low-risk' }, result: await run() }
  }
  if (guard === 'warn') {                  // lite — 막지 않고 경고만
    log(`⚠️ 위험 작업(${action}) — lite 모드: 경고만 하고 진행합니다.`)
    return { outcome: { ran: true, guard, reason: 'lite-warn' }, result: await run() }
  }
  if (guard === 'confirm') {               // CLI — 명시 승인 > 대화형 확인 > 비대화형은 안전 중단
    if (deps.approved === true) {
      return { outcome: { ran: true, guard, reason: 'approved' }, result: await run() }
    }
    const tty = deps.isTTY ?? !!process.stdout.isTTY
    if (tty && deps.confirm) {
      const ok = await deps.confirm()
      if (ok) return { outcome: { ran: true, guard, reason: 'confirmed' }, result: await run() }
      log(`취소됨 — ${action} 을(를) 실행하지 않았습니다.`)
      return { outcome: { ran: false, guard, reason: 'declined' } }
    }
    log(`⚠️ 위험 작업(${action}) — 확인 불가(비대화형). 실행하지 않았습니다. (--yes 로 명시 승인)`)
    return { outcome: { ran: false, guard, reason: 'no-confirm' } }
  }

  // preview — 에이전트/자연어. 미리보기 후 기본 비실행, 명시 승인 시에만 실행.
  log(`🔎 위험 작업(${action}) 미리보기 — 실행 전 확인이 필요합니다. (Safety Mode: ${mode})`)
  if (deps.approved === true) {
    return { outcome: { ran: true, guard, reason: 'approved' }, result: await run() }
  }
  log(`실행하지 않았습니다 — 명시적 확인(승인 플래그) 후 다시 시도하세요.`)
  return { outcome: { ran: false, guard, reason: 'preview-no-approve' } }
}
```

설계 포인트:
- **fail-safe 기본값.** 비대화형(TTY 아님) + 미승인 → `ran: false` 로 **차단**이 기본. "막지 못하면 실행"이 아니라 "확신 없으면 비실행".
- **채널별 표현만 다르고 결정은 하나.** CLI는 y/N, 에이전트/자연어는 dry-run preview. 무엇이 위험한지의 판단은 단일 `resolveGuard`.

### 3) 트립와이어는 "집행 호출"까지 짝지어야 유효 — `src/lib/hard-stop-guard.ts`

신호 파일(`.vhk/HARD_STOP`)을 읽어 차단하는 가드를 만들고, **모든 자동화/위험 작업 진입부에서 이 함수를 실제로 호출**한다. 함수는 차단 시 `false` 를 반환하므로 호출부는 곧바로 `return` 하면 된다.

```ts
export function ensureNotHardStopped(action: string): boolean {
  if (!isHardStopActive()) return true
  console.error(chalk.red.bold(`\n🛑 HARD STOP 활성 — '${action}' 을(를) 실행하지 않았습니다.`))
  const reason = readHardStopReason()
  if (reason) console.error(chalk.dim(`   사유: ${reason.replace(/\s*\n\s*/g, ' ')}`))
  console.error(chalk.dim('   해제: vhk resume --confirm (사람이 직접 실행)'))
  process.exitCode = 1
  return false
}
```

해제 명령(`resume`)과 트립와이어를 *생성*하는 쪽은 의도적으로 가드 제외 — 그래야 잠긴 상태에서도 풀 수 있다(데드락 방지). 해제는 사람이 직접 명시 플래그로만.

### 4) 완전성 매핑 테스트로 누락을 FAIL 처리 — `tests/safety-coverage.test.ts`

"가드 대상 ↔ 핸들러" 매핑을 소스에서 정적으로 읽어 교차검증한다. 신규 위험 작업을 추가했는데 어느 입구가 가드를 안 거치면 테스트가 깨진다.

```ts
const GUARDED = new Set<string>([...HIGH_RISK_ACTIONS, ...STRICT_EXTRA_ACTIONS])

it('자연어 dispatch: 가드대상 핸들러 호출 case 는 전부 등록(caller 가 runGuarded)', () => {
  const src = readFileSync('src/lib/nlp-run.ts', 'utf-8')
  const cases = [...src.matchAll(/case\s+'([^']+)':\s*\n?\s*return\s+(\w+)\(/g)]
  for (const [, cmd, handler] of cases) {
    const action = HANDLER_ACTION[handler]
    if (action && GUARDED.has(action)) {
      expect(Object.keys(NL_GUARDED_ACTIONS), `NL '${cmd}'→${handler}() 가드 미경유`).toContain(cmd)
    }
  }
})

it('인라인 메뉴 switch 등: 가드대상 핸들러 직접 호출 없음(전부 chokepoint 경유)', () => {
  const idx = readFileSync('src/index.ts', 'utf-8')
  const direct = [...idx.matchAll(/return\s+(undo|save|sync|deploy|publish|migrate|env|cloudPull|resume)\(/g)]
  expect(direct.map((m) => m[1]), '가드 미경유 직접 호출 발견').toEqual([])
})

it('가드대상 action 은 전부 핸들러 매핑됨 (완전성 매핑 누락 방지)', () => {
  const mapped = new Set(Object.values(HANDLER_ACTION))
  for (const a of GUARDED) {
    if (a === 'delete') continue                  // 진입점 없는 예약 액션
    expect(mapped.has(a), `action '${a}' 핸들러 매핑 없음 → 드리프트`).toBe(true)
  }
})

it('high-risk 별도 나열 리스트는 정책 파일 외에 없음(드리프트 소스 감사)', () => {
  const files = ['src/lib/nlp-run.ts', 'src/index.ts', 'src/mcp/server.ts']
  const names = ['undo', 'deploy', 'publish', 'migrate', 'cloud-pull', 'resume', 'env-write']
  for (const f of files) {
    const src = readFileSync(f, 'utf-8')
    for (const lit of src.match(/\[[^\]]*\]/g) ?? []) {
      const hit = names.filter((n) => lit.includes(`'${n}'`))
      expect(hit.length, `${f} 에 별도 나열 의심: ${lit.slice(0, 60)}`).toBeLessThan(3)
    }
  }
})
```

이 테스트군이 핵심 게이트다: 정책 파일에 위험 작업을 추가하면, 모든 입구가 chokepoint를 경유하도록 강제되고, 별도 나열 리스트(드리프트 소스)도 차단된다.

## 적용 조건

- ✅ 같은 위험/파괴적 작업이 **2개 이상의 진입 경로**(CLI, API/에이전트 도구, 자연어/메뉴 등)에서 호출될 때.
- ✅ 작업이 되돌리기 어렵거나 외부 영향(배포·결제·삭제·시크릿/설정 파일 변경·외부 호출)을 줄 때.
- ✅ 비대화형/자동화(에이전트, CI, cron)에서도 호출 가능해 "프롬프트 우회 → 무인 실행" 위험이 있을 때.
- ✅ 안전장치 신호 파일/플래그(킬스위치·트립와이어)를 도입할 때 — 반드시 집행 호출과 짝으로.
- ❌ 단일 입구만 있고 영원히 그럴 것이 확실한 일회성 스크립트(과설계).
- ❌ 읽기 전용/부수효과 없는 조회 작업(`status` 류) — 가드 자체가 불필요(`allow`).
- ❌ 가드 자체를 해제하는 명령이나 트립와이어를 *생성*하는 쪽 — 의도적으로 chokepoint에서 제외해야 데드락을 피함.

## 검증

`tests/safety-coverage.test.ts` 가 핵심 완전성 게이트(정적 소스 교차검증). 그 외 동작 검증:

- `tests/safety-guard.test.ts` — chokepoint 동작 전 케이스. 특히 fail-safe 기본값:

```ts
it('CLI 비대화형(TTY 아님) + 미승인 → 안전하게 중단', async () => {
  const t = tracker()
  const { outcome } = await runGuarded('deploy', {
    channel: 'cli', mode: 'standard', isTTY: false,
  }, t.run)
  expect(outcome.ran).toBe(false)   // 막지 못하면 실행이 아니라, 확신 없으면 비실행
  expect(t.ran).toBe(false)
})
```

  또한 빌드 산출물을 비대화형 spawn 으로 실행해 실제 CLI가 위험 작업을 진짜로 막는지 e2e 검증(`vhk deploy` → 가드 차단 메시지 출력 + 배포 흐름 미진입).

- `tests/hard-stop-guard.test.ts` — 트립와이어가 장식이 아님을 보장. 신호 파일이 활성이면 자동화 진입부(예: harness/recap/ship)가 본문 진입 전 중단되고, 해제 명령만 예외로 통과:

```ts
it('HARD_STOP 활성이면 차단(false) + exitCode 1 + action·사유 출력', () => {
  writeHardStopFixture(dir, 'auto: 3 active blockers')
  expect(ensureNotHardStopped('publish')).toBe(false)
  expect(process.exitCode).toBe(1)
})

it('resume 는 가드 제외 — HARD_STOP 활성에서도 실행되어 해제', async () => {
  writeHardStopFixture(dir, 'manual stop')
  const { resume } = await import('../src/commands/agent.js')
  await resume({ confirm: true })
  expect(existsSync(join(dir, '.vhk', 'HARD_STOP'))).toBe(false)  // 데드락 방지
})
```
