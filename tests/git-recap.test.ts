import { describe, it, expect } from 'vitest'
import {
  isNoiseRecapPath,
  filterRecapFiles,
  inferFileStatusFromDiff,
  buildSessionDiffFromSummary,
  withMidnight,
} from '../src/lib/git.js'

describe('git recap filters', () => {
  it('쓰레기 경로를 걸러낸다', () => {
    expect(isNoiseRecapPath('${MAX_SCAN_FILE_BYTES')).toBe(true)
    expect(isNoiseRecapPath('4081.9')).toBe(true)
    expect(isNoiseRecapPath('vhk')).toBe(true)
    expect(isNoiseRecapPath('pnpm-lock.yaml')).toBe(false)
    expect(isNoiseRecapPath('src/app/page.tsx')).toBe(false)
  })

  it('inferFileStatusFromDiff — 커밋 diff 기준 상태', () => {
    expect(inferFileStatusFromDiff(10, 0)).toBe('new')
    expect(inferFileStatusFromDiff(0, 5)).toBe('deleted')
    expect(inferFileStatusFromDiff(3, 2)).toBe('modified')
  })

  it('buildSessionDiffFromSummary — diffSummary만 사용', () => {
    const diff = buildSessionDiffFromSummary({
      insertions: 10,
      deletions: 2,
      files: [
        { file: 'src/a.ts', insertions: 10, deletions: 2 },
        { file: '4081.9', insertions: 1, deletions: 0 },
      ],
    })
    expect(diff.filesChanged).toBe(1)
    expect(diff.files[0].file).toBe('src/a.ts')
    expect(diff.insertions).toBe(10)
  })

  it('withMidnight — 시각 없는 날짜에 자정 보강(git approxidate 함정 방지)', () => {
    // git 은 `--since=2026-06-06`(시각 없음)을 자정이 아니라 '현재 시각'으로 채워
    // 그날 커밋을 전부 누락시킨다(특히 밤에 recap). 시각 없으면 00:00:00 명시해야 한다.
    expect(withMidnight('2026-06-06')).toBe('2026-06-06 00:00:00')
    expect(withMidnight('2026-06-06 14:30')).toBe('2026-06-06 14:30') // 시각 있으면 그대로
    expect(withMidnight('2026-06-06 23:05:08')).toBe('2026-06-06 23:05:08')
  })

  it('filterRecapFiles가 noise를 제거한다', () => {
    const filtered = filterRecapFiles([
      { file: '4081.9', insertions: 0, deletions: 0, status: 'new' },
      { file: 'docs/log/foo.md', insertions: 1, deletions: 0, status: 'new' },
    ])
    expect(filtered.some(f => f.file === '4081.9')).toBe(false)
    expect(filtered.some(f => f.file === 'docs/log/foo.md')).toBe(false)
  })
})
