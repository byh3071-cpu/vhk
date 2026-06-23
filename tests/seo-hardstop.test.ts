import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// #335/#336: seo init/submit HARD_STOP 가드 회귀 테스트.
// HARD_STOP 활성 시 config/IndexNow 키 등 산출물을 쓰면 안 된다(가드 누락 회귀 차단).

function tmpProject(label: string): string {
  const dir = join(tmpdir(), `vhk-seohs-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeHardStop(dir: string): void {
  mkdirSync(join(dir, '.vhk'), { recursive: true })
  writeFileSync(join(dir, '.vhk', 'HARD_STOP'), '2026-06-23T00:00:00Z\nauto: test\n', 'utf-8')
}

describe('seo 명령 HARD_STOP 가드 (#335/#336)', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = 0 // ensureNotHardStopped 가 설정한 exitCode 리셋
    vi.restoreAllMocks()
  })

  it('HARD_STOP 활성 → seoInit 가 config 를 쓰지 않는다 (#335)', async () => {
    const dir = tmpProject('init-blocked')
    writeHardStop(dir)
    process.chdir(dir)
    try {
      const { seoInit } = await import('../src/commands/seo/init.js')
      await seoInit({ domain: 'ex.com', yes: true }, dir)
      expect(existsSync(join(dir, '.vhk', 'seo', 'config.json'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('HARD_STOP 활성 → seoSubmit 가 IndexNow 키를 만들지 않는다 (#336)', async () => {
    const dir = tmpProject('submit-blocked')
    writeHardStop(dir)
    process.chdir(dir)
    try {
      const { seoSubmit } = await import('../src/commands/seo/submit.js')
      await seoSubmit({ yes: true }, dir)
      expect(existsSync(join(dir, '.vhk', 'seo', 'indexnow-key.txt'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
