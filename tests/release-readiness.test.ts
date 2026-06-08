import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  parseReleasedSections,
  isPlaceholderBody,
  findEmptyReleasedSections,
  isUnreleasedEmpty,
  checkReleaseReadiness,
} from '../src/lib/release-readiness.js'

const CLEAN = `# Changelog

## [Unreleased]

### Changed

- 뭔가 바꿈

## [1.2.0] - 2026-06-08

### Added

- 진짜 기능 추가

## [1.1.0] - 2026-06-01

> 테마 한 줄

### Fixed

- 버그 수정
`

const PLACEHOLDER = `# Changelog

## [Unreleased]

## [1.2.0] - 2026-06-08

_변경 내역 작성 필요._

## [1.1.0] - 2026-06-01

### Added

- 실제 내용
`

describe('parseReleasedSections', () => {
  it('릴리즈 섹션만(Unreleased 제외) 파싱', () => {
    const s = parseReleasedSections(CLEAN)
    expect(s.map((x) => x.version)).toEqual(['1.2.0', '1.1.0'])
    expect(s[0].body).toContain('진짜 기능 추가')
  })
})

describe('isPlaceholderBody', () => {
  it('빈 본문 → true', () => {
    expect(isPlaceholderBody('\n\n')).toBe(true)
    expect(isPlaceholderBody('\n### Added\n\n')).toBe(true) // 소제목만, 내용 0
  })
  it('플레이스홀더 스텁 → true', () => {
    expect(isPlaceholderBody('\n_변경 내역 작성 필요._\n')).toBe(true)
    expect(isPlaceholderBody('\nTBD\n')).toBe(true)
  })
  it('실제 불릿 있으면 → false', () => {
    expect(isPlaceholderBody('\n### Added\n\n- 기능\n')).toBe(false)
    expect(isPlaceholderBody('\n> 테마\n\n### Fixed\n\n- 수정\n')).toBe(false)
  })
})

describe('findEmptyReleasedSections / checkReleaseReadiness', () => {
  it('placeholder 릴리즈 → 잡힘 + not ok', () => {
    expect(findEmptyReleasedSections(PLACEHOLDER)).toEqual(['1.2.0'])
    const r = checkReleaseReadiness(PLACEHOLDER)
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('1.2.0')
  })
  it('깨끗한 CHANGELOG → [] + ok', () => {
    expect(findEmptyReleasedSections(CLEAN)).toEqual([])
    expect(checkReleaseReadiness(CLEAN).ok).toBe(true)
  })
})

describe('isUnreleasedEmpty', () => {
  it('내용 있으면 false', () => {
    expect(isUnreleasedEmpty(CLEAN)).toBe(false)
  })
  it('비었으면 true', () => {
    expect(isUnreleasedEmpty(PLACEHOLDER)).toBe(true) // Unreleased 본문 0
  })
})

describe('실제 repo CHANGELOG 회귀 가드', () => {
  it('릴리즈 섹션에 빈/플레이스홀더 본문 0건', () => {
    expect(findEmptyReleasedSections(readFileSync('CHANGELOG.md', 'utf-8'))).toEqual([])
  })
})
