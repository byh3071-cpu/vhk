import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildDiffCoverEntries,
  appendDiffCoverLog,
  readDiffCoverLog,
  DIFF_COVER_LOG_REL,
  type DiffCoverLogEntry,
} from '../src/lib/diff-cover-log.js'
import type { DiffCoverageResult } from '../src/lib/diff-coverage.js'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-diffcoverlog-'))
}

const SHA = 'a'.repeat(40)
const COMMIT = { sha: SHA, shortSha: SHA.slice(0, 7), dirty: false }

function result(): DiffCoverageResult {
  return {
    files: [
      { file: 'src/lib/a.ts', added: 4, covered: 2, uncoveredNew: [3, 4], ratio: 0.5, inCoverage: true },
      { file: 'src/lib/b.ts', added: 2, covered: 2, uncoveredNew: [], ratio: 1, inCoverage: true },
    ],
    totalAdded: 6,
    totalCovered: 4,
    totalUncovered: 2,
    ratio: 4 / 6,
  }
}

describe('buildDiffCoverEntries — DiffCoverageResult → 파일별 로그 엔트리(순수)', () => {
  it('파일 1개당 엔트리 1개, 측정 필드(added·uncovered·ratio·inCoverage) 보존', () => {
    const entries = buildDiffCoverEntries(result(), COMMIT, '2026-06-23T00:00:00.000Z')
    expect(entries).toHaveLength(2)
    const a = entries.find((e) => e.file === 'src/lib/a.ts')!
    expect(a).toMatchObject({
      ts: '2026-06-23T00:00:00.000Z',
      sha: SHA,
      shortSha: SHA.slice(0, 7),
      dirty: false,
      file: 'src/lib/a.ts',
      added: 4,
      uncovered: 2,
      inCoverage: true,
    })
    expect(a.ratio).toBeCloseTo(0.5)
  })

  it('커밋 정보 없음(비-git) → sha 계열 null', () => {
    const entries = buildDiffCoverEntries(result(), null, '2026-06-23T00:00:00.000Z')
    expect(entries[0].sha).toBeNull()
    expect(entries[0].shortSha).toBeNull()
    expect(entries[0].dirty).toBeNull()
  })

  it('uncovered 는 uncoveredNew.length 와 일치(라인 원문은 안 남김 — 측정치만)', () => {
    const a = buildDiffCoverEntries(result(), COMMIT, 't').find((e) => e.file === 'src/lib/a.ts')!
    expect(a.uncovered).toBe(2)
    // 사적 경로/라인 원문(uncoveredNew 배열)은 엔트리에 노출하지 않는다(측정 추세에 불필요).
    expect((a as unknown as Record<string, unknown>).uncoveredNew).toBeUndefined()
  })
})

describe('appendDiffCoverLog / readDiffCoverLog — append-only JSONL', () => {
  const mk = (file: string, ts: string): DiffCoverLogEntry => ({
    ts,
    sha: SHA,
    shortSha: SHA.slice(0, 7),
    dirty: false,
    file,
    added: 4,
    uncovered: 2,
    ratio: 0.5,
    inCoverage: true,
  })

  it('빈 로그 → append 시 .vhk/events/diff-cover.jsonl 생성 + N줄', () => {
    const d = tmp()
    const n = appendDiffCoverLog(d, [mk('src/lib/a.ts', 't1'), mk('src/lib/b.ts', 't1')])
    expect(n).toBe(2)
    expect(fs.existsSync(path.join(d, DIFF_COVER_LOG_REL))).toBe(true)
    expect(readDiffCoverLog(d)).toHaveLength(2)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('append-only — 두 번째 실행분이 누적된다(기존 줄 보존)', () => {
    const d = tmp()
    appendDiffCoverLog(d, [mk('src/lib/a.ts', 't1')])
    appendDiffCoverLog(d, [mk('src/lib/a.ts', 't2')])
    const all = readDiffCoverLog(d)
    expect(all).toHaveLength(2)
    expect(all.map((e) => e.ts)).toEqual(['t1', 't2'])
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('빈 배열 append → 파일 미생성, 0 반환(측정 대상 없을 때 churn 0)', () => {
    const d = tmp()
    expect(appendDiffCoverLog(d, [])).toBe(0)
    expect(fs.existsSync(path.join(d, DIFF_COVER_LOG_REL))).toBe(false)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('손상 줄은 skip 하고 정상 줄만 읽는다(원장이 한 줄 깨져도 안 죽음)', () => {
    const d = tmp()
    appendDiffCoverLog(d, [mk('src/lib/a.ts', 't1')])
    const p = path.join(d, DIFF_COVER_LOG_REL)
    fs.appendFileSync(p, '{ broken json\n', 'utf-8')
    appendDiffCoverLog(d, [mk('src/lib/b.ts', 't2')])
    const all = readDiffCoverLog(d)
    expect(all).toHaveLength(2)
    expect(all.map((e) => e.file)).toEqual(['src/lib/a.ts', 'src/lib/b.ts'])
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('파일 부재 → readDiffCoverLog 는 빈 배열', () => {
    const d = tmp()
    expect(readDiffCoverLog(d)).toEqual([])
    fs.rmSync(d, { recursive: true, force: true })
  })
})
