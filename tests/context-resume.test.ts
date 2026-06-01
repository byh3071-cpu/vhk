import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Goal 10(a): `vhk context` 발견성 — 세션 진입 시 복원/생성/갱신 안내 한 줄.
// stale 판정은 checkContextDrift(drift.ts, 자체 테스트 보유)에 위임 → 여기선 mock 으로 분기만 검증.
vi.mock('../src/lib/drift.js', () => ({
  checkContextDrift: vi.fn(() => ({ checked: false, stale: false })),
}))

import { printContextResumeHint } from '../src/lib/next-step.js'
import { checkContextDrift } from '../src/lib/drift.js'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-ctxhint-'))
}
function writeCtx(dir: string): void {
  fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.vhk/context.md'), '# ctx', 'utf-8')
}

describe('printContextResumeHint (goal 10)', () => {
  let logs: string[]
  beforeEach(() => {
    logs = []
    vi.mocked(checkContextDrift).mockReturnValue({ checked: false, stale: false })
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.map(String).join(' '))
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('.vhk/context.md 없으면 생성 안내 + vhk context 노출', () => {
    const dir = tmp()
    try {
      printContextResumeHint(dir)
      const out = logs.join('\n')
      expect(out).toMatch(/없음|생성/)
      expect(out).toContain('vhk context')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('context.md 존재 + 드리프트 아님 → 복원(읽기) 안내', () => {
    const dir = tmp()
    try {
      writeCtx(dir)
      vi.mocked(checkContextDrift).mockReturnValue({ checked: true, stale: false })
      printContextResumeHint(dir)
      expect(logs.join('\n')).toContain('vhk context-show')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('context.md 존재 + checkContextDrift stale → 갱신 안내', () => {
    const dir = tmp()
    try {
      writeCtx(dir)
      vi.mocked(checkContextDrift).mockReturnValue({ checked: true, stale: true })
      printContextResumeHint(dir)
      expect(logs.join('\n')).toMatch(/오래됨|갱신/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
