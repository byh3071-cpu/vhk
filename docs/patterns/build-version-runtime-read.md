---
패턴명: 패키지 버전은 빌드타임 인라인 대신 런타임 package.json read
카테고리: build
출처프로젝트: VHK (vhk-cli)
태그: [TypeScript, tsup, commander, single-source-of-truth, npm]
발견일: 2026-05-24
출처DevLog: docs/log/2026-05-24-v0.8-release.md
---

# 패턴: 패키지 버전은 빌드타임 인라인 대신 런타임 `package.json` read

## 증상

자동 publish 워크플로(`vhk publish`, `release-it`, semantic-release 등)가 `package.json` version을 bump 후 빌드 → 테스트하면:

```
AssertionError: expected '0.8.0' to be '0.8.1'
 FAIL  tests/cli-args.test.ts > vhk --version
```

dist 출력이 package.json보다 한 단계 뒤처짐.

## 원인

`commander.version('0.8.0')` 같은 리터럴이 소스에 하드코딩 → 번들러(tsup/esbuild/rollup)가 dist에 인라인. publish가 package.json만 수정하면 dist는 stale.

```ts
// 문제 코드
program
  .name('mytool')
  .version('0.8.0')  // ← 소스 코드와 package.json 두 곳에서 관리 → drift
```

빌드 다시 돌려도 src/index.ts 안 바꾸면 dist도 그대로.

## 해결

런타임에 package.json 직접 읽기. ESM 환경에서 `import.meta.url` 기준 상대 경로 사용.

```ts
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function getVersion(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  // dist/index.js 기준 ../package.json (npm 글로벌 + 로컬 빌드 동일)
  // src/index.ts dev 기준 ../package.json (repo root)
  for (const pkgPath of [
    path.join(dir, '../package.json'),
    path.join(dir, '../../package.json'),
  ]) {
    try {
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string }
        if (pkg.version) return pkg.version
      }
    } catch { continue }
  }
  return '0.0.0'
}

program.version(getVersion())
```

## 핵심 원리

**Single Source of Truth** — version은 package.json에만 존재. 코드는 그것을 읽는다.

## 적용 조건

- ✅ CLI 도구 / npm 패키지에서 자체 버전 출력 (`--version`)
- ✅ tsup / esbuild / vite / rollup 등 번들러로 빌드
- ✅ publish 자동화 워크플로 (버전 자동 bump 단계 존재)
- ✅ ESM 환경 (import.meta.url 가능)
- ⚠️ CJS 환경에선 `__dirname` 사용 (동일 원리)
- ❌ webpack/vite에 `define`/`replace` 플러그인으로 빌드타임 주입하는 게 컨벤션인 경우 — 그건 그것대로 OK

## 대안 비교

| 방법 | 단점 |
|------|------|
| 소스에 리터럴 하드코딩 | publish 자동화와 drift |
| 번들러 define plugin (`__VERSION__`) | 빌드 설정 복잡 + 빌드 다시 안 돌리면 stale |
| 런타임 package.json read | 약간의 startup 비용 (수 ms), single source |

CLI 도구에선 런타임 read 비용 무시 가능 → 채택.

## 검증

```ts
it('vhk --version', () => {
  const r = spawnSync(process.execPath, [bin, '--version'])
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
  expect(r.stdout.trim()).toBe(pkg.version)
})
```

## 참고

- VHK `src/commands/doctor.ts`의 `getVhkVersion()` 동일 패턴
