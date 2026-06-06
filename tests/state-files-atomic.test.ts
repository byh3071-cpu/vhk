import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeHardStop, appendBlocker } from '../src/lib/state-files.js'

// Goal 38: state-files 영속 쓰기를 atomicWriteFile 로 — 결과 동일 + temp 잔여 0 회귀 가드.
describe('state-files atomic 쓰기 (Goal 38)', () => {
  let origCwd: string
  let dir: string
  beforeEach(() => {
    origCwd = process.cwd()
    dir = mkdtempSync(join(tmpdir(), 'vhk-sf-'))
    process.chdir(dir)
  })
  afterEach(() => {
    process.chdir(origCwd)
    rmSync(dir, { recursive: true, force: true })
  })

  it('writeHardStop — HARD_STOP 내용 정확 + temp 파일 잔여 0', () => {
    writeHardStop('auto: 3 active blockers')
    expect(readFileSync(join(dir, '.vhk', 'HARD_STOP'), 'utf-8')).toContain('auto: 3 active blockers')
    expect(readdirSync(join(dir, '.vhk')).filter((f) => f.includes('.tmp-'))).toHaveLength(0)
  })

  it('appendBlocker 첫 생성 — blockers.md 헤더+항목 정확 + temp 잔여 0', () => {
    appendBlocker('첫 블로커 증상')
    const c = readFileSync(join(dir, 'docs', 'state', 'blockers.md'), 'utf-8')
    expect(c).toContain('# Blockers')
    expect(c).toContain('첫 블로커 증상')
    expect(readdirSync(join(dir, 'docs', 'state')).filter((f) => f.includes('.tmp-'))).toHaveLength(0)
  })
})
