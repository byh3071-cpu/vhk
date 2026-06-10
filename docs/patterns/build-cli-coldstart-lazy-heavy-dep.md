---
패턴명: CLI 콜드스타트 — dep별 비용 측정 후 최대 무게만 지연 로딩
카테고리: build
출처프로젝트: VHK (vhk-cli)
태그: [cli, coldstart, performance, lazy-load, dynamic-import, esm, bundling, measure-first, nodejs]
발견일: 2026-06-10
출처DevLog: docs/log/2026-06-10-diff-coverage.md
---

# 패턴: CLI 콜드스타트 — dep별 비용 측정 후 최대 무게만 지연 로딩

## 증상

CLI 의 가벼운 명령(`--version`, `status`)조차 체감상 느리다. 실제로 `node --version`(런타임 바닥 ~25ms)에 비해 `mycli --version` 이 수백 ms 걸린다.

```text
node --version          ~25ms   (런타임 바닥)
mycli --version        ~512ms   (CLI 콜드스타트)  ← 무엇을 찍든 항상 이만큼
```

원인이 "Node 가 느려서"가 아니라 **CLI 자기 코드의 즉시 로드(eager import)** 인데, 막연히 "전부 lazy 하게 바꾸자"는 충동으로 이어진다 — 엔트리(명령 등록 중앙 파일) 통째 재작성 = 고위험·대규모.

## 원인

ESM/CJS 엔트리가 명령 핸들러를 **top-level `import`** 로 전부 끌어오면, 그 핸들러들이 transitive 로 무거운 dep(프롬프트 라이브러리·템플릿 엔진·SDK 등)를 시작 시 한꺼번에 초기화한다. `--version` 한 줄을 찍어도 쓰지도 않을 모듈 그래프가 전부 파싱·실행된다.

핵심 오해: **무게가 균등하다고 가정**하는 것. 실제로는 한두 개 dep 가 비용의 절반 이상을 차지하는 경우가 흔하다(파워-로 분포). 측정 없이 전부 lazy 화하면 대부분 12~33ms짜리를 위해 중앙 파일을 통째 위험하게 바꾼다.

## 해결

**measure-first**: 먼저 dep별 import 비용을 *별도 프로세스로* 실측해 최대 레버를 찾고, **그것만** lazy 화한다.

### 1. dep별 비용 측정 (별도 프로세스, net)

```js
// .dep-cost.cjs — 각 dep import 비용을 빈 모듈 대비 net 으로
const { spawnSync } = require('node:child_process')
const { hrtime } = require('node:process')
const t = (code) => { const t0 = hrtime.bigint(); spawnSync('node', ['--input-type=module', '-e', code], { stdio: 'ignore' }); return Number(hrtime.bigint() - t0) / 1e6 }
const med = (code, n = 7) => { t(code); const xs = Array.from({ length: n }, () => t(code)).sort((a, b) => a - b); return xs[n >> 1] | 0 }
const base = med('void 0')
for (const d of ['inquirer', 'handlebars', '@notionhq/client', 'chalk']) console.log(d, med(`import('${d}')`) - base, 'ms')
```

VHK 실측 결과: **inquirer 212ms = 콜드스타트(434ms)의 절반**, 나머지는 12~33ms. → 레버 하나가 명백.

### 2. 최대 dep 만 lazy 래퍼로 (호출 시점까지 미룸)

```ts
// lib/prompt.ts — inquirer 를 *프롬프트 실호출* 시점까지 미룬다.
import type { Answers, QuestionCollection } from 'inquirer' // import type = 런타임 무관(빌드서 소거)

export async function prompt<T extends Answers = Answers>(q: QuestionCollection): Promise<T> {
  const inquirer = (await import('inquirer')).default // ESM dynamic import = 모듈 init 지연
  return inquirer.prompt<T>(q)
}
```

호출부는 `import inquirer from 'inquirer'` + `inquirer.prompt(...)` → `import { prompt }` + `prompt(...)` 로 코드모드(모든 호출이 async 문맥이라 무위험). **`await import()` 자체가 모듈 초기화를 지연**하므로 번들러 `splitting` 옵션은 불필요할 수 있다(엔트리 경로/청크 해석이 안 깨지는 게 더 안전).

### 3. 회귀 가드 (핵심 — 안 그러면 누가 다시 top-level import)

```ts
// 콜드스타트 win 을 잠근다: src/ 에 top-level `import inquirer from` 재등장 차단.
const FORBID = /^\s*import\s+inquirer\s+from\s+['"]inquirer['"]/m // import type 은 통과
it('top-level inquirer import 없음', () => { expect(scanSrcFor(FORBID)).toEqual([]) })
```

결과: VHK `--version` 512→**323ms (−37%)**, 22파일 코드모드, 전체 테스트 green(테스트 import 시간도 23s→12s 부수 단축).

## 적용 조건

- ✅ top-level import 로 명령 핸들러를 끌어오는 모든 CLI 엔트리(Node ESM/CJS).
- ✅ 무거운 dep(대화형 프롬프트·템플릿 엔진·클라우드 SDK·큰 파서)를 *일부 경로만* 쓰는 경우 — 안 쓰는 명령에서 비용이 새는 구조.
- ✅ dep별 비용이 불균등할 때(거의 항상). 측정으로 80/20 레버 식별 후 그것만.
- ❌ 측정 없이 "전부 lazy" — 12~33ms짜리 위해 중앙 파일 통째 재작성은 ROI↓·고위험.
- ❌ 모든 dep 가 모든 경로에서 쓰이는 경우(지연 이득 없음).
- ❌ `--help` 전체 출력처럼 모든 명령 메타가 필관리자 경로(지연 이득 작음 — 명령 *실행* 경로가 이득 큼).

## 검증

- before/after 를 같은 측정 하네스로(`node dist/index.js --version` n회 warmup 후 중앙값) 기록 — 절대 수치는 OS별 상이하나 비율은 불문.
- 전체 테스트 green 확인(특히 lazy 화한 dep 를 `vi.mock` 하는 테스트 — vitest 는 dynamic import 도 가로채므로 정상).
- 회귀 가드 테스트로 win 을 잠금(top-level import 재등장 = 콜드스타트 복귀).
