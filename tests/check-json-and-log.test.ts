import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { check } from '../src/commands/check.js'
import { readCheckLog } from '../src/lib/check-log.js'

// #374 (evolve 효과측정): `vhk check --json` + 실행마다 check-log.jsonl 스냅샷 append.

function tmpProject(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-check-json-'))
  fs.mkdirSync(path.join(d, 'src'))
  fs.writeFileSync(path.join(d, 'RULES.md'), '## 코딩\n- `console.log` 금지\n')
  fs.writeFileSync(path.join(d, 'src', 'debug.ts'), 'console.log("test")\n')
  return d
}

describe('vhk check --json', () => {
  let origCwd: string
  let logSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    logSpy?.mockRestore()
    if (origCwd) process.chdir(origCwd)
    process.exitCode = 0
  })

  it('JSON 출력이 유효한 위반 요약 객체', async () => {
    const d = tmpProject()
    origCwd = process.cwd()
    process.chdir(d)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await check({ json: true })

    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    const parsed = JSON.parse(out) as {
      totalRules: number
      violations: unknown[]
      errors: number
      warnings: number
      declaredRules: number
      checkedRules: number
      uncheckedRules: number
      coveragePercent: number
    }
    expect(parsed.totalRules).toBeGreaterThan(0)
    expect(Array.isArray(parsed.violations)).toBe(true)
    expect(parsed.errors).toBeGreaterThan(0)
    expect(parsed.declaredRules).toBe(1)
    expect(parsed.checkedRules).toBe(1)
    expect(parsed.uncheckedRules).toBe(0)
    expect(parsed.coveragePercent).toBe(100)
    expect(process.exitCode).toBe(1)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('위반 있으면 --json 도 exit 1 유지(조용한 성공 위장 금지)', async () => {
    const d = tmpProject()
    origCwd = process.cwd()
    process.chdir(d)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await check({ json: true })
    expect(process.exitCode).toBe(1)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('RULES.md를 읽을 수 없으면 명시적인 JSON 오류와 exit 1', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-check-json-'))
    fs.mkdirSync(path.join(d, 'RULES.md'))
    origCwd = process.cwd()
    process.chdir(d)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await check({ json: true })

    const out = logSpy.mock.calls.map((call) => String(call[0])).join('\n')
    expect(JSON.parse(out)).toMatchObject({ error: 'rules-read-failed' })
    expect(process.exitCode).toBe(1)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('vhk check → check-log.jsonl 스냅샷', () => {
  let origCwd: string
  let logSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    logSpy?.mockRestore()
    if (origCwd) process.chdir(origCwd)
    process.exitCode = 0
  })

  it('실행마다 위반 총계 1줄 append', async () => {
    const d = tmpProject()
    origCwd = process.cwd()
    process.chdir(d)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await check({})
    let log = readCheckLog(d)
    expect(log).toHaveLength(1)
    expect(log[0].total).toBeGreaterThan(0)

    await check({})
    log = readCheckLog(d)
    expect(log).toHaveLength(2)

    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('자동 검사 연결이 없는 선언도 비율 기록에 남긴다', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-check-json-'))
    fs.writeFileSync(path.join(d, 'RULES.md'), '## 지침\n- 그냥 텍스트\n')
    origCwd = process.cwd()
    process.chdir(d)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await check({})
    const log = readCheckLog(d)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({
      declaredRules: 1,
      checkedRules: 0,
      uncheckedRules: 1,
      coveragePercent: 0,
    })
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
