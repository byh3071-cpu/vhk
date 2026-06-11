import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// tsc 는 tests/ 미검사 → .mjs 직접 import 안전(meta-gate.test.ts 선례).
import { uncommittedCodeChanges, hasTodayDevlog } from '../scripts/record-reminder.mjs'
import { localToday } from '../scripts/check-records.mjs'

const SCRIPT = path.join(process.cwd(), 'scripts', 'record-reminder.mjs')

describe('record-reminder 순수부', () => {
  it('porcelain 에서 실질 코드변경만 추출 (docs/tests 제외, 리네임은 new 쪽)', () => {
    const lines = [
      ' M src/commands/work.ts',
      '?? docs/log/2026-06-10-x.md',
      ' M tests/work.test.ts',
      'R  src/lib/old.ts -> src/lib/new.ts',
    ]
    expect(uncommittedCodeChanges(lines)).toEqual(['src/commands/work.ts', 'src/lib/new.ts'])
  })

  it('hasTodayDevlog — 오늘자 파일 있을 때만 true', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-rem-'))
    expect(hasTodayDevlog(d, '2026-06-10')).toBe(false)
    fs.writeFileSync(path.join(d, '2026-06-10-work.md'), 'x')
    expect(hasTodayDevlog(d, '2026-06-10')).toBe(true)
    expect(hasTodayDevlog(d, '2026-06-11')).toBe(false)
    expect(hasTodayDevlog(path.join(d, 'nope'), '2026-06-10')).toBe(false)
    fs.rmSync(d, { recursive: true, force: true })
  })
})

function makeRepo(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-rem-e2e-'))
  execFileSync('git', ['init', '-q'], { cwd: d })
  return d
}

function run(repo: string): { status: number; stdout: string } {
  const stdout = execFileSync('node', [SCRIPT], { cwd: repo, encoding: 'utf-8', stdio: 'pipe' })
  return { status: 0, stdout } // execFileSync 가 안 던지면 exit 0
}

describe('record-reminder e2e — 항상 exit 0 (자문 전용)', () => {
  it('코드변경 + devlog 없음 → 안내 출력, exit 0', () => {
    const repo = makeRepo()
    const fp = path.join(repo, 'src/commands/foo.ts')
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, 'x')
    const r = run(repo)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('dev log')
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('코드변경 + 오늘 devlog 존재 → 침묵, exit 0', () => {
    const repo = makeRepo()
    const fp = path.join(repo, 'src/commands/foo.ts')
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, 'x')
    const logDir = path.join(repo, 'docs/log')
    fs.mkdirSync(logDir, { recursive: true })
    fs.writeFileSync(path.join(logDir, `${localToday()}-work.md`), 'log')
    const r = run(repo)
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe('')
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('git repo 아님(내부 오류) → fail-open, exit 0', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-rem-nogit-'))
    const r = run(d)
    expect(r.status).toBe(0)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
