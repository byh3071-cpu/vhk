import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { devLogDate, devLogTitle, devLogLesson, parseDevLog, readDevLogs } from '../../src/daily/devlog.js'

const SAMPLE = `---
date: 2026-06-07
project: VHK
type: 세션로그
---

# 2026-06-07 — doctor Phase 2 출시

## 요약
진단 3종 추가.

## 교훈
게이트 grep 가드는 주석 리터럴도 잡으니 조심.
`

describe('devLogDate', () => {
  it('frontmatter date 우선', () => {
    expect(devLogDate('2026-01-01-x.md', SAMPLE)).toBe('2026-06-07')
  })
  it('frontmatter 없으면 파일명에서', () => {
    expect(devLogDate('2026-06-05-foo.md', '# 제목')).toBe('2026-06-05')
  })
})

describe('devLogTitle', () => {
  it('첫 # 제목에서 날짜 접두사 제거', () => {
    expect(devLogTitle(SAMPLE)).toBe('doctor Phase 2 출시')
  })
})

describe('devLogLesson', () => {
  it('## 교훈 섹션 첫 줄', () => {
    expect(devLogLesson(SAMPLE)).toContain('주석 리터럴')
  })
  it('교훈 없으면 undefined', () => {
    expect(devLogLesson('# 제목\n## 요약\n내용')).toBeUndefined()
  })
})

describe('parseDevLog', () => {
  it('date·title·lesson 추출', () => {
    const e = parseDevLog('2026-06-07-x.md', SAMPLE, '2026-06-07')
    expect(e.date).toBe('2026-06-07')
    expect(e.title).toBe('doctor Phase 2 출시')
    expect(e.lesson).toBeTruthy()
  })
})

describe('readDevLogs', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vhk-log-'))
    writeFileSync(join(dir, '2026-06-05-a.md'), '# 2026-06-05 — A\n## 교훈\n교훈A')
    writeFileSync(join(dir, '2026-06-07-b.md'), '# 2026-06-07 — B\n내용')
    writeFileSync(join(dir, 'not-a-log.txt'), 'ignore')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('range 안의 .md dev log 만', () => {
    const r = readDevLogs(dir, { start: '2026-06-07', end: '2026-06-07' })
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('B')
  })
  it('넓은 range → 전부', () => {
    expect(readDevLogs(dir, { start: '2000-01-01', end: '2026-06-07' })).toHaveLength(2)
  })
  it('디렉터리 없으면 빈 배열', () => {
    expect(readDevLogs(join(dir, 'nope'), { start: '2000-01-01', end: '2026-06-07' })).toEqual([])
  })
})
