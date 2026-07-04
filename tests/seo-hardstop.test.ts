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

  // 실전재검증 감사(2026-07-03)에서 발견 — report.ts 만 #335/#336 과 동일한 가드 누락 패턴을
  // 안 고치고 남아있었음(3번째 재발 후보). latest.json 이 있어야 report.ts 가 조기 종료 없이
  // 실제 쓰기 경로까지 도달하므로, 가드가 그 경로를 진짜로 차단하는지 검증 가능.
  it('HARD_STOP 활성 → seoReport 가 report.html 을 쓰지 않는다 (신규 발견)', async () => {
    const dir = tmpProject('report-blocked')
    writeHardStop(dir)
    mkdirSync(join(dir, '.vhk', 'seo'), { recursive: true })
    writeFileSync(
      join(dir, '.vhk', 'seo', 'latest.json'),
      JSON.stringify({ version: 1, collectedAt: '2026-07-03T00:00:00Z', domain: 'ex.com' }),
      'utf-8'
    )
    process.chdir(dir)
    try {
      const { seoReport } = await import('../src/commands/seo/report.js')
      await seoReport({ yes: true }, dir)
      expect(existsSync(join(dir, '.vhk', 'seo', 'report.html'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
