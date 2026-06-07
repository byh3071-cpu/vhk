import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Goal 39: 나머지 상태쓰기 명령(design/theme/env/refAdd/cloudPush) HARD_STOP 가드 회귀.
// 대표로 env(.env.example) + refAdd(refs.json) 차단/정상 검증.

function tmpProject(label: string): string {
  const dir = join(tmpdir(), `vhk-rem-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(join(dir, '.vhk'), { recursive: true })
  return dir
}
function writeHardStop(dir: string): void {
  writeFileSync(join(dir, '.vhk', 'HARD_STOP'), '2026-06-07T00:00:00Z\nauto: test\n', 'utf-8')
}

describe('나머지 명령 HARD_STOP 가드 (Goal 39)', () => {
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

  it('HARD_STOP 활성 → env 가 .env.example 을 만들지 않는다', async () => {
    const dir = tmpProject('env-blocked')
    // 실제 .env 가 있어야 가드 없을 때 .env.example 을 *쓰는* 경로에 도달 → 차별적 테스트.
    writeFileSync(join(dir, '.env'), 'FOO=bar\n', 'utf-8')
    writeHardStop(dir)
    process.chdir(dir)
    try {
      const { env } = await import('../src/commands/env.js')
      await env()
      expect(existsSync(join(dir, '.env.example'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('HARD_STOP 없으면 env 정상(.env.example 생성) — 회귀 0', async () => {
    const dir = tmpProject('env-ok')
    writeFileSync(join(dir, '.env'), 'FOO=bar\n', 'utf-8')
    process.chdir(dir)
    try {
      const { env } = await import('../src/commands/env.js')
      await env()
      expect(existsSync(join(dir, '.env.example'))).toBe(true)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('HARD_STOP 활성 → refAdd 가 refs.json 을 만들지 않는다', async () => {
    const dir = tmpProject('ref-blocked')
    writeHardStop(dir)
    process.chdir(dir)
    try {
      const { refAdd } = await import('../src/commands/ref.js')
      await refAdd('https://example.com', '메모')
      expect(existsSync(join(dir, '.vhk', 'refs.json'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('HARD_STOP 없으면 refAdd 정상(refs.json 생성) — 회귀 0', async () => {
    const dir = tmpProject('ref-ok')
    process.chdir(dir)
    try {
      const { refAdd } = await import('../src/commands/ref.js')
      await refAdd('https://example.com', '메모')
      expect(existsSync(join(dir, '.vhk', 'refs.json'))).toBe(true)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
