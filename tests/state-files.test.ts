import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  appendBlocker,
  appendLearning,
  countActiveBlockers,
  getRecentLearnings,
  writeHardStop,
  isHardStopActive,
  clearHardStop,
  readHardStopReason,
  HARD_STOP_BLOCKER_THRESHOLD,
  HARD_STOP_PATH,
  BLOCKERS_PATH,
  LEARNINGS_PATH,
} from '../src/lib/state-files.js'

function tmpProject(label: string): string {
  const dir = join(
    tmpdir(),
    `vhk-state-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('countActiveBlockers', () => {
  it('활성 항목만 카운트, ~~strikethrough~~ 항목 제외', () => {
    const md = [
      '# Blockers',
      '',
      '- [2026-05-01 goal-0] active 1',
      '- ~~[2026-05-02 goal-0] resolved item~~',
      '- [2026-05-03 goal-1] active 2',
      '',
    ].join('\n')
    expect(countActiveBlockers(md)).toBe(2)
  })

  it('빈 문서면 0', () => {
    expect(countActiveBlockers('# Blockers\n')).toBe(0)
  })
})

describe('appendBlocker — Forbidden append-only 보장', () => {
  let origCwd: string
  let dir: string
  beforeEach(() => {
    origCwd = process.cwd()
    dir = tmpProject('blocker')
    process.chdir(dir)
  })
  afterEach(() => {
    process.chdir(origCwd)
    rmSync(dir, { recursive: true, force: true })
  })

  it('파일 없으면 헤더 + 항목으로 생성', () => {
    const r = appendBlocker('첫 블로커', 1)
    expect(r.count).toBe(1)
    expect(r.hardStopTripped).toBe(false)
    const content = readFileSync(BLOCKERS_PATH, 'utf-8')
    expect(content).toContain('# Blockers')
    expect(content).toContain('goal-1] 첫 블로커')
  })

  it('기존 항목 보존 + 새 항목 append', () => {
    appendBlocker('first', 1)
    const before = readFileSync(BLOCKERS_PATH, 'utf-8')
    appendBlocker('second', 1)
    const after = readFileSync(BLOCKERS_PATH, 'utf-8')
    expect(after.startsWith(before.trimEnd())).toBe(true)
    expect(after).toContain('first')
    expect(after).toContain('second')
  })

  it('3건 누적 시 .vhk/HARD_STOP 자동 생성', () => {
    appendBlocker('b1', 2)
    appendBlocker('b2', 2)
    expect(existsSync(HARD_STOP_PATH)).toBe(false)
    const r = appendBlocker('b3', 2)
    expect(r.count).toBe(HARD_STOP_BLOCKER_THRESHOLD)
    expect(r.hardStopTripped).toBe(true)
    expect(existsSync(HARD_STOP_PATH)).toBe(true)
  })

  it('이미 HARD_STOP 있으면 재작성 안 함 (덮어쓰기 X)', () => {
    writeHardStop('original')
    const before = readFileSync(HARD_STOP_PATH, 'utf-8')
    appendBlocker('b1', 2)
    appendBlocker('b2', 2)
    appendBlocker('b3', 2)
    const after = readFileSync(HARD_STOP_PATH, 'utf-8')
    expect(after).toBe(before)
  })
})

describe('appendLearning + getRecentLearnings', () => {
  let origCwd: string
  let dir: string
  beforeEach(() => {
    origCwd = process.cwd()
    dir = tmpProject('learning')
    process.chdir(dir)
  })
  afterEach(() => {
    process.chdir(origCwd)
    rmSync(dir, { recursive: true, force: true })
  })

  it('append-only 누적', () => {
    appendLearning('A', 1)
    appendLearning('B', 2)
    appendLearning('C', 2)
    const content = readFileSync(LEARNINGS_PATH, 'utf-8')
    expect(content).toContain('A')
    expect(content).toContain('B')
    expect(content).toContain('C')
    expect(content.indexOf('A')).toBeLessThan(content.indexOf('B'))
    expect(content.indexOf('B')).toBeLessThan(content.indexOf('C'))
  })

  it('getRecentLearnings 가 마지막 N건 반환', () => {
    appendLearning('A')
    appendLearning('B')
    appendLearning('C')
    appendLearning('D')
    const recent = getRecentLearnings(3)
    expect(recent).toHaveLength(3)
    expect(recent[0]).toContain('B')
    expect(recent[1]).toContain('C')
    expect(recent[2]).toContain('D')
  })

  it('파일 없으면 빈 배열', () => {
    expect(getRecentLearnings(3)).toEqual([])
  })

  it('SoT 일관성 — appendLearning 은 .vhk/memory.json 에 쓰지 않음 (Forbidden 이중 기록)', () => {
    appendLearning('learning that should NOT enter memory.json')
    expect(existsSync(join('.vhk', 'memory.json'))).toBe(false)
  })
})

describe('HARD_STOP 트립와이어', () => {
  let origCwd: string
  let dir: string
  beforeEach(() => {
    origCwd = process.cwd()
    dir = tmpProject('hard-stop')
    process.chdir(dir)
  })
  afterEach(() => {
    process.chdir(origCwd)
    rmSync(dir, { recursive: true, force: true })
  })

  it('writeHardStop / isHardStopActive / readHardStopReason 사이클', () => {
    expect(isHardStopActive()).toBe(false)
    writeHardStop('테스트 사유')
    expect(isHardStopActive()).toBe(true)
    const reason = readHardStopReason()
    expect(reason).toContain('테스트 사유')
  })

  it('clearHardStop — 파일 제거', () => {
    writeHardStop('to be cleared')
    expect(clearHardStop()).toBe(true)
    expect(isHardStopActive()).toBe(false)
  })

  it('clearHardStop — 파일 없으면 false 반환', () => {
    expect(clearHardStop()).toBe(false)
  })
})

// Windows EPERM 회피: chdir 복원 → rmSync 순서 보장 (afterEach 에서 처리됨)
// 빈 라인 차단용 더미.
describe('module exports', () => {
  it('상수 export 검증', () => {
    expect(HARD_STOP_BLOCKER_THRESHOLD).toBe(3)
    expect(BLOCKERS_PATH).toMatch(/blockers\.md$/)
    expect(LEARNINGS_PATH).toMatch(/learnings\.md$/)
    expect(HARD_STOP_PATH).toMatch(/HARD_STOP$/)
  })
  it('writeFileSync 작동 (no-op 위한 임포트 보장)', () => {
    expect(typeof writeFileSync).toBe('function')
  })
})
