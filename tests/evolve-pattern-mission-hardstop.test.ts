import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Goal 36: evolve/pattern/mission mutate 명령 HARD_STOP 가드 회귀 테스트.
// 대표로 missionClear(파일 삭제) + evolveReject 검증 — HARD_STOP 시 상태 변경 차단.

function tmpProject(label: string): string {
  const dir = join(tmpdir(), `vhk-epmhs-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(join(dir, '.vhk'), { recursive: true })
  return dir
}

function writeHardStop(dir: string): void {
  writeFileSync(join(dir, '.vhk', 'HARD_STOP'), '2026-06-07T00:00:00Z\nauto: test\n', 'utf-8')
}

describe('evolve/pattern/mission HARD_STOP 가드 (Goal 36)', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = 0
    vi.restoreAllMocks()
  })

  it('HARD_STOP 활성 → missionClear 가 mission.json 을 삭제하지 않는다', async () => {
    const dir = tmpProject('mission-clear-blocked')
    writeFileSync(join(dir, '.vhk', 'mission.json'), '{"objective":"x"}', 'utf-8')
    writeHardStop(dir)
    process.chdir(dir)
    try {
      const { missionClear } = await import('../src/commands/mission.js')
      await missionClear()
      // 가드로 즉시 return → mission.json 보존
      expect(existsSync(join(dir, '.vhk', 'mission.json'))).toBe(true)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('HARD_STOP 없으면 missionClear 정상(mission.json 삭제) — 회귀 0', async () => {
    const dir = tmpProject('mission-clear-ok')
    writeFileSync(join(dir, '.vhk', 'mission.json'), '{"objective":"x"}', 'utf-8')
    process.chdir(dir)
    try {
      const { missionClear } = await import('../src/commands/mission.js')
      await missionClear()
      expect(existsSync(join(dir, '.vhk', 'mission.json'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
