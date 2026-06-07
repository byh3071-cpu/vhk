import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runWorktreeCheck } from '../../src/worktree/check.js'

describe('runWorktreeCheck (worktree-env 재사용)', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'vhk-wt-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('.env.example 없음 → skip (강제 안 함)', () => {
    expect(runWorktreeCheck(dir).status).toBe('skip')
  })

  it('필수 키 모두 있으면 pass', () => {
    writeFileSync(join(dir, '.env.example'), 'A=\nB=')
    writeFileSync(join(dir, '.env'), 'A=1\nB=2')
    expect(runWorktreeCheck(dir).status).toBe('pass')
  })

  it('필수 키 누락 → fail, 개수만(값은 절대 미노출)', () => {
    writeFileSync(join(dir, '.env.example'), 'A=\nB=\nC=')
    writeFileSync(join(dir, '.env'), 'A=super-secret-value-xyz')
    const r = runWorktreeCheck(dir)
    expect(r.status).toBe('fail')
    expect(r.detail).not.toContain('super-secret-value-xyz')
    expect(r.detail).toContain('2') // 누락 B, C = 2개
  })
})
