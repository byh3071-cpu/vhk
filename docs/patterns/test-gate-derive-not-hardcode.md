---
패턴명: 하드코딩 복제는 코드가 아니라 게이트(드리프트·완전성 테스트)로 막아라
카테고리: test
출처프로젝트: VHK (vhk-cli)
태그: [drift-guard, single-source-of-truth, introspection, completeness-test, registry, ci-gate]
발견일: 2026-05-31
출처DevLog: docs/log/2026-05-31-safety-batches.md
---

# 패턴: 명령/정책 목록을 손으로 복제하지 말고, 단일 소스에서 파생 + 드리프트 게이트로 강제하라

## 증상

같은 "목록"(명령 서브커맨드, 위험 작업 목록, 가드 대상 핸들러 등)이 여러 파일에 하드코딩으로 복제되어 있고, 한쪽만 수정되면서 서로 어긋나는 드리프트가 발생한다.

- 라우터/디스패처에 새 명령을 추가했지만 다른 곳의 하드코딩 목록에 등록하지 않아, 런타임에 명령이 엉뚱한 경로(예: 자연어 라우터)로 가로채진다.
- "위험 작업(high-risk)" 목록이 A 파일과 B 파일에 따로 나열되어, B 에만 새 작업을 추가하는 바람에 한 경로에서 가드(확인 프롬프트)를 우회한다.

```
# 흔한 잘못된 "게이트": 주석/문자열 grep
grep -q "// 새 명령 추가 시 여기도 추가" src/router.ts || echo "FAIL"
```

이런 grep 게이트는 주석이 그대로 있는 한 통과하므로, 실제로 목록이 어긋나도(드리프트) 아무것도 잡지 못한다. "통과"라는 거짓 신호만 준다.

## 원인

- **진실의 출처가 둘 이상이다.** 동일 정보를 사람이 두 군데 이상에 손으로 적으면, 한쪽 수정 시 다른 쪽 갱신은 "기억"에 의존한다 → 결국 빠진다.
- **게이트가 행동이 아니라 텍스트를 검사한다.** 주석·식별자 이름·문자열 존재 여부 grep 은 코드의 실제 구조나 런타임 동작과 무관하다. 복제본이 어긋나도 grep 은 초록불을 준다.
- **추가는 막지만 누락은 막지 못한다.** 단순 "존재 검사"는 "있어야 할 게 없는" 누락(완전성 위반)을 잡지 못한다.

## 해결

### 1) 목록을 단일 소스로 추출하고, 모든 소비자는 import 만 한다

복제 가능한 목록을 한 모듈에 정의하고 주석으로 그 계약을 못 박는다. (vhk: `src/lib/command-registry.ts`)

```ts
/**
 * 컨테이너 명령 → 서브커맨드의 **단일 소스**.
 * R1 가드(cli-args.ts)와 드리프트 가드 테스트가 같은 출처를 본다 —
 * commander 정의와 따로 노는 하드코딩 복제를 제거하기 위함.
 */
export const CONTAINER_SUBCOMMANDS: Record<string, readonly string[]> = {
  goal: ['list', 'next', 'check', 'init', 'done'],
  ref: ['add', 'list', 'open'],
  memory: ['add', 'list', 'remove'],
  // ...
}
```

위험 정책도 동일하게 단일 소스로. (vhk: `src/lib/risk-policy.ts`)

```ts
export const HIGH_RISK_ACTIONS = [
  'undo', 'deploy', 'publish', 'migrate',
  'cloud-pull', 'resume', 'env-write', 'delete',
] as const

/**
 * 자연어 → 가드 대상 action 의 **단일 소스**.
 * (별도 손관리 리스트 금지 — 소비자는 import 만. 완전성 가드 테스트가
 *  실제 dispatch 와 교차검증해 여기 누락 시 FAIL.)
 */
export const NL_GUARDED_ACTIONS: Readonly<Record<string, string>> = {
  undo: 'undo', deploy: 'deploy', publish: 'publish', /* ... */ sync: 'sync',
}
```

### 2) introspect 드리프트 테스트 — "실제 구조" vs "선언"을 코드로 대조

주석 grep 이 아니라, 프레임워크가 실제로 등록한 구조를 introspect 해 단일 소스와 비교한다. (vhk: `tests/command-registry.test.ts`)

```ts
import { program } from '../src/index.js'
import { CONTAINER_SUBCOMMANDS } from '../src/lib/command-registry.js'

it('commander 의 실제 서브커맨드가 모두 레지스트리에 있음 (누락 = 재발 위험)', () => {
  for (const [container, subs] of Object.entries(CONTAINER_SUBCOMMANDS)) {
    const cmd = program.commands.find((c) => c.name() === container)
    if (!cmd) continue
    const actual = cmd.commands.map((c) => c.name())  // 실제 등록된 구조
    for (const s of actual) {
      expect(subs, `${container}.${s} 가 registry 에 없음`).toContain(s)
    }
  }
})

it('새 컨테이너 명령(서브커맨드 보유)이 registry 에 누락되지 않음', () => {
  const containers = program.commands
    .filter((c) => c.commands.length > 0).map((c) => c.name())
  for (const name of containers) {
    expect(CONTAINER_SUBCOMMANDS[name], `새 컨테이너 '${name}' 누락`).toBeDefined()
  }
})
```

→ 새 명령을 프레임워크에 추가하고 레지스트리에 등록을 빠뜨리면, "실제 구조에는 있는데 선언에는 없음"으로 테스트가 **FAIL** 한다.

### 3) 완전성 매핑 테스트 — "추가했는데 매핑 누락" 자동 FAIL

단일 소스의 모든 원소가 소비 측(핸들러 매핑·가드 경유)에 빠짐없이 연결됐는지 검사한다. (vhk: `tests/safety-coverage.test.ts`)

```ts
const GUARDED = new Set<string>([...HIGH_RISK_ACTIONS, ...STRICT_EXTRA_ACTIONS])

// 단일 소스의 모든 위험 action 이 핸들러 매핑에 존재해야 한다
it('가드대상 action 은 전부 HANDLER_ACTION 에 매핑됨 (완전성 매핑 누락 방지)', () => {
  const mapped = new Set(Object.values(HANDLER_ACTION))
  for (const a of GUARDED) {
    if (a === 'delete') continue // 진입점 없는 예약 액션
    expect(mapped.has(a), `action '${a}' 핸들러 매핑 없음 → 완전성 누락(드리프트)`).toBe(true)
  }
})
```

### 4) 게이트는 행동/구조 검증으로 — 디스패치 실제 케이스를 파싱해 교차검증

가드 우회 같은 동작 보장은, 실제 dispatch 소스를 파싱해 "위험 핸들러를 호출하는 케이스가 전부 가드 목록에 등록됐는지"까지 검사한다. (vhk: `tests/safety-coverage.test.ts`)

```ts
it('자연어 dispatch: 가드대상 핸들러 호출 case 는 전부 가드 목록 등록', () => {
  const src = readFileSync('src/lib/nlp-run.ts', 'utf-8')
  const cases = [...src.matchAll(/case\s+'([^']+)':\s*\n?\s*return\s+(\w+)\(/g)]
  for (const [, cmd, handler] of cases) {
    const action = HANDLER_ACTION[handler]
    if (action && GUARDED.has(action)) {
      expect(Object.keys(NL_GUARDED_ACTIONS), `'${cmd}'→${handler}() 가드 미경유`)
        .toContain(cmd)
    }
  }
})

// 드리프트 소스 감사: 단일 소스 밖에 위험 목록을 또 나열했는지 탐지
it('high-risk 별도 나열 리스트는 정책 모듈 외에 없음', () => {
  for (const f of ['src/lib/nlp-run.ts', 'src/index.ts', 'src/mcp/server.ts']) {
    const src = readFileSync(f, 'utf-8')
    for (const lit of src.match(/\[[^\]]*\]/g) ?? []) {
      const hit = names.filter((n) => lit.includes(`'${n}'`))
      expect(hit.length, `${f} 에 high-risk 별도 나열 의심`).toBeLessThan(3)
    }
  }
})
```

### 핵심 교훈

> 중복을 코드로(주석으로 "여기도 추가하세요") 막지 말고, **게이트로** 막아라.
> 단일 소스에서 파생 + introspect 드리프트 테스트 + 완전성 매핑 테스트 →
> "추가했는데 등록 누락하면 FAIL" 을 자동화하라. 게이트는 주석 grep 이 아니라
> 실제 구조·동작 검증이어야 한다.

## 적용 조건

- ✅ 같은 목록(명령·라우트·권한·위험 작업·기능 플래그)이 2곳 이상에서 참조되어 어긋날 수 있을 때
- ✅ 프레임워크가 등록 구조를 introspect 할 수 있을 때(commander `program.commands`, 라우트 테이블, DI 컨테이너 등)
- ✅ "X 를 추가하면 Y 에도 반드시 등록" 같은 사람 기억 의존 계약이 존재할 때
- ✅ 누락이 보안/안전(가드 우회) 또는 라우팅 오작동으로 직결될 때
- ❌ 목록이 진짜 1곳에서만 쓰이고 복제본이 없을 때(과도한 테스트)
- ❌ 런타임/소스 introspect 가 불가능해 검증이 추측에 그칠 때 — 그땐 단일 소스 추출(해결 1)만으로 충분
- ❌ "주석/문자열 존재"만 확인하는 grep 게이트로 대체하려 할 때(거짓 통과 유발 — 안티패턴)

## 검증

vhk 의 게이트 구성을 그대로 일반 템플릿으로 쓸 수 있다.

1. **introspect 드리프트 테스트** (`tests/command-registry.test.ts`): 프레임워크가 실제 등록한 구조 ↔ 단일 소스 선언을 대조. 새 컨테이너/서브커맨드 누락 시 FAIL.
2. **완전성 매핑 테스트** (`tests/safety-coverage.test.ts`): 위험 action 단일 소스의 모든 원소가 핸들러 매핑·가드 경유에 연결됐는지 확인. dispatch 소스를 파싱해 가드 미경유 케이스를 FAIL 처리.
3. **stray/구조 머지 게이트** (`scripts/check-no-stray.mjs`): grep 이 아니라 `git status --porcelain` 출력을 파싱해 소스 트리에 추적 안 된 무관 파일이 남았는지 행동 기반으로 검사.

```js
// scripts/check-no-stray.mjs — 텍스트 패턴이 아니라 VCS 실제 상태를 검증
const stray = out
  .split(/\r?\n/)
  .filter((l) => l.startsWith("?? "))
  .map((l) => l.slice(3).trim())
  .filter((p) => /^(src|tests)\//.test(p));
if (stray.length) process.exit(1);
```

세 게이트를 CI 의 `build && test` 단계에 묶으면, 복제·드리프트·잔여물을 사람 리뷰 이전에 자동 차단할 수 있다.
