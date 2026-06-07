import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectPM, installCommandFor } from '../../src/worktree/pm.js'

describe('installCommandFor (PM별 dir 지정 플래그)', () => {
  it('pnpm → --dir', () => {
    expect(installCommandFor('pnpm', '/wt')).toEqual({ cmd: 'pnpm', args: ['--dir', '/wt', 'install'] })
  })
  it('yarn → --cwd', () => {
    expect(installCommandFor('yarn', '/wt')).toEqual({ cmd: 'yarn', args: ['--cwd', '/wt', 'install'] })
  })
  it('npm → --prefix', () => {
    expect(installCommandFor('npm', '/wt')).toEqual({ cmd: 'npm', args: ['--prefix', '/wt', 'install'] })
  })
})

describe('detectPM (lockfile 기반)', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'vhk-pm-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('pnpm-lock.yaml → pnpm', () => {
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '')
    expect(detectPM(dir)).toBe('pnpm')
  })
  it('yarn.lock → yarn', () => {
    writeFileSync(join(dir, 'yarn.lock'), '')
    expect(detectPM(dir)).toBe('yarn')
  })
  it('lockfile 없음 → npm 기본', () => {
    expect(detectPM(dir)).toBe('npm')
  })
})
