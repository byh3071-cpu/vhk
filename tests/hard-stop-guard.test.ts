import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ensureNotHardStopped } from '../src/lib/hard-stop-guard.js'

function tmpProject(label: string): string {
  const dir = join(
    tmpdir(),
    `vhk-hardstop-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  )
  mkdirSync(join(dir, '.vhk'), { recursive: true })
  return dir
}

function writeHardStopFixture(dir: string, reason: string): void {
  writeFileSync(join(dir, '.vhk', 'HARD_STOP'), `2026-05-31T00:00:00.000Z\n${reason}\n`, 'utf-8')
}

describe('HARD_STOP 가드 (VHK-020)', () => {
  let origCwd: string
  let origExitCode: number | string | undefined
  let dir: string
  let errSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    origCwd = process.cwd()
    origExitCode = process.exitCode
    dir = tmpProject('guard')
    process.chdir(dir)
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = origExitCode
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('HARD_STOP 없으면 통과(true) + exitCode 미설정', () => {
    expect(ensureNotHardStopped('save')).toBe(true)
    expect(process.exitCode).not.toBe(1)
  })

  it('HARD_STOP 활성이면 차단(false) + exitCode 1 + action·사유 출력', () => {
    writeHardStopFixture(dir, 'auto: 3 active blockers')
    expect(ensureNotHardStopped('publish')).toBe(false)
    expect(process.exitCode).toBe(1)
    const out = errSpy.mock.calls.flat().join(' ')
    expect(out).toContain('HARD STOP')
    expect(out).toContain('publish')
    expect(out).toContain('auto: 3 active blockers')
  })

  it('harness 는 HARD_STOP 시 본문 진입 전 중단(타이틀 미출력)', async () => {
    writeHardStopFixture(dir, 'manual stop')
    const { harness } = await import('../src/commands/harness.js')
    await harness()
    expect(process.exitCode).toBe(1)
    expect(logSpy).not.toHaveBeenCalled() // 본문 첫 console.log(타이틀) 도달 안 함
  })

  it('recap 은 HARD_STOP 시 본문 진입 전 중단', async () => {
    writeHardStopFixture(dir, 'manual stop')
    const { recap } = await import('../src/commands/recap.js')
    await recap({ since: '2026-05-30' })
    expect(process.exitCode).toBe(1)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('ship 은 HARD_STOP 시 본문 진입 전 중단', async () => {
    writeHardStopFixture(dir, 'manual stop')
    const { ship } = await import('../src/commands/ship.js')
    await ship()
    expect(process.exitCode).toBe(1)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('resume 는 가드 제외 — HARD_STOP 활성에서도 실행되어 해제(--confirm)', async () => {
    writeHardStopFixture(dir, 'manual stop')
    const { resume } = await import('../src/commands/agent.js')
    await resume({ confirm: true })
    // resume 은 ensureNotHardStopped 로 차단되지 않고 정상 실행 → HARD_STOP 제거됨
    expect(existsSync(join(dir, '.vhk', 'HARD_STOP'))).toBe(false)
  })
})
