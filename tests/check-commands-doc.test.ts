import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// tsc 는 tests/ 미검사 → .mjs 직접 import 안전(meta-gate.test.ts 선례).
import { findUndocumentedCommands } from '../scripts/check-commands-doc.mjs'

const SCRIPT = path.join(process.cwd(), 'scripts', 'check-commands-doc.mjs')

describe('findUndocumentedCommands', () => {
  it('COMMANDS.md 에 안 보이는 명령만 보고', () => {
    const doc = '| 검증 | `vhk verify` | "검증해" |\n| diff 커버리지 | `vhk diff-cover` | x |'
    expect(findUndocumentedCommands(['verify', 'diff-cover', 'recap'], doc)).toEqual(['recap'])
  })

  it('부분 문자열 오탐 방지 — diff-cover 등장이 diff 를 커버하지 않음', () => {
    const doc = '`vhk diff-cover` 만 문서화됨'
    expect(findUndocumentedCommands(['diff', 'diff-cover'], doc)).toEqual(['diff'])
  })
})

function fixture(files: string[], doc: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-cmdoc-'))
  const cmdDir = path.join(d, 'src', 'commands')
  fs.mkdirSync(cmdDir, { recursive: true })
  for (const f of files) fs.writeFileSync(path.join(cmdDir, `${f}.ts`), '')
  fs.writeFileSync(path.join(d, 'COMMANDS.md'), doc)
  return d
}

function run(dir: string, strict: boolean): number {
  try {
    const args = strict ? [SCRIPT, '--strict'] : [SCRIPT]
    execFileSync('node', args, { cwd: dir, encoding: 'utf-8', stdio: 'pipe' })
    return 0
  } catch (e) {
    return (e as { status?: number }).status ?? -1
  }
}

describe('check-commands-doc e2e', () => {
  it('전부 문서화 → exit 0 (strict 포함)', () => {
    const d = fixture(['verify', 'save'], '`vhk verify` 와 `vhk save`')
    expect(run(d, true)).toBe(0)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('누락 있으면 기본=리포트(exit 0), --strict=FAIL(exit 1)', () => {
    const d = fixture(['verify', 'ghost'], '`vhk verify` 만')
    expect(run(d, false)).toBe(0)
    expect(run(d, true)).toBe(1)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
