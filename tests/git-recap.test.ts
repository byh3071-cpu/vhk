import { describe, it, expect } from 'vitest'
import {
  isNoiseRecapPath,
  filterRecapFiles,
  inferFileStatusFromDiff,
  buildSessionDiffFromSummary,
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

  it('filterRecapFiles가 noise를 제거한다', () => {
    const filtered = filterRecapFiles([
      { file: '4081.9', insertions: 0, deletions: 0, status: 'new' },
      { file: 'docs/log/foo.md', insertions: 1, deletions: 0, status: 'new' },
    ])
    expect(filtered.some(f => f.file === '4081.9')).toBe(false)
    expect(filtered.some(f => f.file === 'docs/log/foo.md')).toBe(true)
  })
})
