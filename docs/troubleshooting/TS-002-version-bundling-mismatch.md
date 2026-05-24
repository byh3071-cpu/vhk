---
id: TS-002
date: 2026-05-24
project: VHK
category: build
severity: MEDIUM
---

# TS-002 — `vhk --version`이 publish 자동 bump 후 이전 버전 출력

## 증상

```
AssertionError: expected '0.8.0' to be '0.8.1' // Object.is equality
 FAIL  tests/cli-args.test.ts > cli NL e2e > vhk --version
```

`vhk publish`가 package.json을 0.8.0 → 0.8.1로 bump하고 `pnpm build` + `pnpm test:run` 실행. 테스트 단계에서 `node dist/index.js --version` 출력이 여전히 0.8.0이라 fail.

## 원인

`src/index.ts`에 `.version('0.8.0')` 리터럴 하드코딩 → tsup 번들 시 dist/index.js에 인라인. publish가 package.json만 bump하면 dist는 여전히 이전 버전.

```ts
program
  .name('vhk')
  .version('0.8.0')   // ← 하드코딩, package.json과 분리됨
```

## 해결

런타임에 package.json에서 버전 읽기. `src/commands/doctor.ts`의 `getVhkVersion()` 패턴 재사용.

```ts
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function getVersion(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  for (const pkgPath of [
    path.join(dir, '../package.json'),       // dist/index.js → repo root
    path.join(dir, '../../package.json'),    // dev fallback
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

## 적용 조건

- 패키지 버전이 빌드 산출물에 인라인되는 경우 (tsup/esbuild/vite/webpack 등)
- CLI 도구가 자체 publish를 자동화하는 경우
- 테스트가 package.json 버전과 dist 출력을 비교하는 경우

## 관련 파일

- `src/index.ts` (`getVersion()` 함수)
- `src/commands/doctor.ts` (기존 `getVhkVersion()` 동일 패턴)
- `tests/cli-args.test.ts` (`vhk --version` e2e)

## 참고

- PR #8 (60d8017)
- Single source of truth 원칙
