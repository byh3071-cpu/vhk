import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// #455: 풀사이클 뒷단 4명령(content/launch/ops/sell) HARD_STOP 가드 회귀 테스트.
// 트립와이어 활성 시 프롬프트 산출물(.vhk/*-prompt.md)을 쓰면 안 되고 exit 1 이어야 한다.
// (#335/#336/seo-report 와 동일한 "신규 명령 가드 누락" 클래스 — 4번째 재발 차단.)

function tmpProject(label: string): string {
  const dir = join(tmpdir(), `vhk-behs-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeHardStop(dir: string): void {
  mkdirSync(join(dir, '.vhk'), { recursive: true })
  writeFileSync(join(dir, '.vhk', 'HARD_STOP'), '2026-07-13T00:00:00Z\nauto: test\n', 'utf-8')
}

// 명령 이름 → { 로더(리터럴 import — vite 변수 동적 import 미지원), 차단 확인 대상 산출물 }.
const TRACKS = [
  { name: 'content', file: 'content-prompt.md', load: async () => (await import('../src/commands/content.js')).content },
  { name: 'launch', file: 'launch-prompt.md', load: async () => (await import('../src/commands/launch.js')).launch },
  { name: 'ops', file: 'ops-prompt.md', load: async () => (await import('../src/commands/ops.js')).ops },
  { name: 'sell', file: 'sell-prompt.md', load: async () => (await import('../src/commands/sell.js')).sell },
] as const

describe('뒷단 4명령 HARD_STOP 가드 (#455)', () => {
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

  for (const { name, file, load } of TRACKS) {
    it(`HARD_STOP 활성 → ${name} 이 ${file} 을 쓰지 않고 exitCode 1`, async () => {
      const dir = tmpProject(name)
      writeHardStop(dir)
      process.chdir(dir)
      try {
        const run = await load()
        run()
        expect(existsSync(join(dir, '.vhk', file)), `${file} 이 생성됨 — 가드 누락`).toBe(false)
        expect(process.exitCode, 'exitCode 1 이어야 함(차단 신호)').toBe(1)
      } finally {
        process.chdir(origCwd)
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})
