import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Goal 35: memory 명령군(add/remove/archive/resolve/unarchive) HARD_STOP 가드 회귀 테스트.

function tmpProject(label: string): string {
  const dir = join(tmpdir(), `vhk-memhs-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(join(dir, '.vhk'), { recursive: true })
  return dir
}

function writeHardStop(dir: string): void {
  writeFileSync(join(dir, '.vhk', 'HARD_STOP'), '2026-06-07T00:00:00Z\nauto: test\n', 'utf-8')
}

function readMemoryRaw(dir: string): string {
  return readFileSync(join(dir, '.vhk', 'memory.json'), 'utf-8')
}

describe('memory 명령군 HARD_STOP 가드 (Goal 35)', () => {
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

  it('HARD_STOP 활성 → memoryAdd 가 memory.json 을 만들지 않는다', async () => {
    const dir = tmpProject('add-blocked')
    writeHardStop(dir)
    process.chdir(dir)
    try {
      const { memoryAdd } = await import('../src/commands/memory.js')
      await memoryAdd('차단되어야 할 기억', { type: 'decision' })
      // HARD_STOP 가드로 즉시 return → memory.json 생성 안 됨
      expect(() => readMemoryRaw(dir)).toThrow()
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('HARD_STOP 없으면 memoryAdd 정상(memory.json 생성) — 회귀 0', async () => {
    const dir = tmpProject('add-ok')
    process.chdir(dir)
    try {
      const { memoryAdd } = await import('../src/commands/memory.js')
      await memoryAdd('정상 저장 기억', { type: 'decision' })
      expect(readMemoryRaw(dir)).toContain('정상 저장 기억')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
