import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// RFC 0047: inquirer(~212ms net = 콜드스타트 절반)는 top-level value import 금지.
// 반드시 lib/prompt.ts 의 lazy `await import('inquirer')` 경유 — 비대화형 핫패스(--version 등)서 미로드.
// import type 은 허용(런타임 무관, 빌드서 소거). 이 가드가 회귀(누가 다시 top-level import) 차단.

const FORBID = /^\s*import\s+inquirer\s+from\s+['"]inquirer['"]/m

function scan(dir: string): string[] {
  const offenders: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      offenders.push(...scan(p))
    } else if (p.endsWith('.ts')) {
      if (FORBID.test(readFileSync(p, 'utf-8'))) offenders.push(p)
    }
  }
  return offenders
}

describe('inquirer lazy 가드 (RFC 0047 콜드스타트)', () => {
  it('src/ 어디에도 top-level `import inquirer from` 없음 (lib/prompt.ts lazy 경유)', () => {
    expect(scan('src')).toEqual([])
  })

  it('FORBID 정규식이 default value import 만 잡고 import type 은 통과', () => {
    expect(FORBID.test("import inquirer from 'inquirer'")).toBe(true)
    expect(FORBID.test('import type { Answers } from \'inquirer\'')).toBe(false)
    expect(FORBID.test("const x = await import('inquirer')")).toBe(false)
  })
})
