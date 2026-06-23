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

// Goal 81: 제품 설명 단일 SoT — package.json.description 을 런타임 주입(index.ts .description 하드코딩 복제 제거).
//   getVhkVersion 과 동형(같은 폴백 경로 + BOM 안전). description 부재 시 빈 문자열(commander 가 무시).
export function getVhkDescription(): string {
  const dir = dirname(fileURLToPath(import.meta.url))
  for (const pkgPath of [
    join(dir, '../../package.json'),
    join(dir, '../package.json'),
  ]) {
    try {
      if (existsSync(pkgPath)) {
        const pkg = readJsonFile<{ description?: string }>(pkgPath)
        if (pkg.description) return pkg.description
      }
    } catch {
      continue
    }
  }
  return ''
}

// #342 #343: 제품 설명 안의 'MCP N tools' 토큰을 실 등록 도구 수(런타임 SoT)로 정규화.
//   package.json 정적 숫자가 어긋나도 CLI --help 표면은 자가 교정 → 드리프트 0.
//   MCP 의존(circular import) 회피를 위해 count 를 인자로 받는다(호출부 index.ts 가 getMcpToolCount() 주입).
export function normalizeMcpToolCount(description: string, count: number): string {
  return description.replace(/MCP\s+\d+\s+tools/g, `MCP ${count} tools`)
}
