import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Goal 56: vhk cost — 자문형 비용 가드. vitest 는 비-TTY → check 의 비대화형 차단 경로 검증.
vi.mock('inquirer')

describe('vhk cost', () => {
  let dir = ''
  let orig = ''
  beforeEach(() => {
    orig = process.cwd()
    dir = mkdtempSync(join(tmpdir(), 'vhk-cost-cmd-'))
    process.chdir(dir)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(orig)
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = ''
    process.exitCode = 0
    delete process.env.VHK_COST_USD
    delete process.env.VHK_COST_MODEL
    delete process.env.VHK_COST_INPUT_TOKENS
    delete process.env.VHK_COST_OUTPUT_TOKENS
  })

  it('budget 설정 + add(--usd) → cost.jsonl 기록', async () => {
    const { cost } = await import('../src/commands/cost.js')
    await cost('budget', '100')
    await cost('add', undefined, { usd: 50 })
    const p = join(dir, '.vhk', 'cost.jsonl')
    expect(existsSync(p)).toBe(true)
    expect(readFileSync(p, 'utf-8')).toContain('"usd":50')
  })

  it('check: 예산 초과(100%+) + 비대화형 + 미승인 → exitCode 1 (block)', async () => {
    const { cost } = await import('../src/commands/cost.js')
    await cost('budget', '100')
    await cost('add', undefined, { usd: 120 })
    process.exitCode = 0
    await cost('check')
    expect(process.exitCode).toBe(1)
  })

  it('check: 예산 초과 + --yes(승인) → 차단 안 함(exitCode 0)', async () => {
    const { cost } = await import('../src/commands/cost.js')
    await cost('budget', '100')
    await cost('add', undefined, { usd: 120 })
    process.exitCode = 0
    await cost('check', undefined, { yes: true })
    expect(process.exitCode).toBe(0)
  })

  it('check: warn(80~99%) → 차단 안 함(exitCode 0)', async () => {
    const { cost } = await import('../src/commands/cost.js')
    await cost('budget', '100')
    await cost('add', undefined, { usd: 85 })
    process.exitCode = 0
    await cost('check')
    expect(process.exitCode).toBe(0)
  })

  it('check: 예산 미설정 → 가드 없음(exitCode 0)', async () => {
    const { cost } = await import('../src/commands/cost.js')
    await cost('add', undefined, { usd: 9999 })
    process.exitCode = 0
    await cost('check')
    expect(process.exitCode).toBe(0)
  })

  it('env 주입(VHK_COST_USD) → add 기록(source=env)', async () => {
    process.env.VHK_COST_USD = '7'
    const { cost } = await import('../src/commands/cost.js')
    await cost('add')
    const txt = readFileSync(join(dir, '.vhk', 'cost.jsonl'), 'utf-8')
    expect(txt).toContain('"usd":7')
    expect(txt).toContain('"source":"env"')
  })

  it('budget: 유효하지 않은 값 → exitCode 1', async () => {
    const { cost } = await import('../src/commands/cost.js')
    await cost('budget', 'abc')
    expect(process.exitCode).toBe(1)
  })
})
