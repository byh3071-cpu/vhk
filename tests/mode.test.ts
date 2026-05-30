import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readConfig } from '../src/lib/config.js'
import { mode } from '../src/commands/mode.js'
import { verificationChecklist } from '../src/commands/verify.js'

function tmp(): string {
  const dir = join(tmpdir(), `vhk-mode-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('vhk mode — 조회/변경', () => {
  let origCwd: string
  let dir: string
  let logs: string[]
  beforeEach(() => {
    origCwd = process.cwd()
    dir = tmp()
    process.chdir(dir)
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
    process.exitCode = 0
  })
  afterEach(() => {
    process.chdir(origCwd)
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
    process.exitCode = 0
  })

  it('인자 없으면 현재 모드 출력 (파일 없으면 standard)', async () => {
    await mode()
    expect(logs.join('\n')).toContain('standard')
  })

  it('mode strict → config.json 에 strict 기록', async () => {
    await mode('strict')
    expect(readConfig().safetyMode).toBe('strict')
  })

  it('알 수 없는 모드 → 에러 + 기록 안 함', async () => {
    await mode('garbage')
    expect(readConfig().safetyMode).toBe('standard') // 변경 안 됨
    expect(process.exitCode).toBe(1)
  })

  it('세 모드 모두 설정 가능', async () => {
    await mode('lite')
    expect(readConfig().safetyMode).toBe('lite')
    await mode('standard')
    expect(readConfig().safetyMode).toBe('standard')
  })
})

describe('vhk verify (lite — 메타러너 자리)', () => {
  it('검증 묶음 체크리스트에 핵심 게이트 포함', () => {
    const joined = verificationChecklist().join(' ')
    expect(joined).toMatch(/tsc|타입/)
    expect(joined).toMatch(/test|테스트/)
    expect(joined).toMatch(/build|빌드/)
  })
})
