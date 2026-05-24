import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJsonFile } from './read-json.js'

// 런타임에 package.json에서 버전 읽기 — src와 dist 둘 다 동작 + BOM 안전.
// dist/lib/version.js → ../../package.json
// src/lib/version.ts → ../../package.json
// dist/index.js (tsup 번들) → ../package.json
export function getVhkVersion(): string {
  const dir = dirname(fileURLToPath(import.meta.url))
  for (const pkgPath of [
    join(dir, '../../package.json'),
    join(dir, '../package.json'),
  ]) {
    try {
      if (existsSync(pkgPath)) {
        const pkg = readJsonFile<{ version?: string }>(pkgPath)
        if (pkg.version) return pkg.version
      }
    } catch {
      continue
    }
  }
  return '0.0.0'
}
