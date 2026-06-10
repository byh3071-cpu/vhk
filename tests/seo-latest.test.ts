import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  emptyLatest,
  mergeLatest,
  readSeoLatest,
  writeSeoLatest,
  SEO_LATEST_REL,
  type SeoLatest,
} from '../src/commands/seo/types.js'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-seolatest-'))
}

describe('SEO latest.json 스키마·I/O', () => {
  it('emptyLatest — version/도메인/시각', () => {
    const l = emptyLatest('x.com', '2026-06-10T00:00:00Z')
    expect(l).toEqual({ version: 1, collectedAt: '2026-06-10T00:00:00Z', domain: 'x.com' })
  })

  it('write → read 라운드트립', () => {
    const d = tmp()
    const l = emptyLatest('x.com', 't')
    writeSeoLatest(l, d)
    expect(readSeoLatest(d)).toEqual(l)
    expect(fs.existsSync(path.join(d, SEO_LATEST_REL))).toBe(true)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('readSeoLatest — 없으면 null', () => {
    const d = tmp()
    expect(readSeoLatest(d)).toBeNull()
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('mergeLatest — 섹션 병합(Goal 24 revenue/bing 병합 패턴)', () => {
    const prev: SeoLatest = {
      version: 1, collectedAt: 't0', domain: 'x.com',
      index: { googleIndexed: 10 }, traffic: { clicks: 5 },
    }
    const merged = mergeLatest(prev, { revenue: { estimatedEarnings: 9 }, bing: { rank: 3 } }, 't1')
    expect(merged.collectedAt).toBe('t1')
    expect(merged.index?.googleIndexed).toBe(10) // 보존
    expect(merged.traffic?.clicks).toBe(5) // 보존
    expect(merged.revenue?.estimatedEarnings).toBe(9) // 병합
    expect(merged.bing?.rank).toBe(3) // 병합
  })

  it('mergeLatest — prev 없으면 patch 가 결과', () => {
    const merged = mergeLatest(null, { domain: 'y.com', index: { bingIndexed: 1 } }, 't')
    expect(merged.domain).toBe('y.com')
    expect(merged.index?.bingIndexed).toBe(1)
  })
})
