import { describe, it, expect } from 'vitest'
import {
  tokenize,
  recallMemories,
  recallForAction,
  type MemoryFileV2,
  type FailEntry,
} from '../src/commands/memory.js'
import { detectNaturalLanguageInput } from '../src/lib/cli-args.js'

const NOW = Date.parse('2026-06-09T00:00:00Z')

function fail(id: string, lesson: string, tags: string[], opts: Partial<FailEntry> = {}): FailEntry {
  return {
    id,
    content: '',
    tags,
    createdAt: '2026-06-01T00:00:00Z',
    status: 'active',
    lesson,
    ...opts,
  }
}

function mem(failures: FailEntry[]): MemoryFileV2 {
  return { schemaVersion: 2, decisions: [], failures, successes: [], patterns: [] }
}

describe('tokenize (순수)', () => {
  it('한국어·영어 분리 + 소문자', () => {
    const t = tokenize('Publish 배포 막힘')
    expect(t).toContain('publish')
    expect(t).toContain('배포')
    expect(t).toContain('막힘')
  })

  it('긴 단어의 짧은 조사 제거', () => {
    expect(tokenize('배포가')).toEqual(['배포'])
  })

  it('빈 문자열 → 빈 배열', () => {
    expect(tokenize('')).toEqual([])
  })

  it('1글자 토큰 제거', () => {
    expect(tokenize('a 그 배포')).toEqual(['배포'])
  })
})

describe('recallMemories (순수)', () => {
  it('쿼리 토큰 매칭 항목만 반환', () => {
    const m = mem([
      fail('f1', 'publish 가드가 feature 브랜치 발행 차단', ['publish']),
      fail('f2', 'CHANGELOG 드리프트 발생', ['changelog']),
    ])
    const hits = recallMemories(m, 'publish', 5, NOW)
    expect(hits.map((h) => h.entry.id)).toEqual(['f1'])
  })

  it('태그 정확매치가 본문만 매치보다 상위', () => {
    const m = mem([
      fail('f1', '본문에 publish 단어만 있음', ['misc']),
      fail('f2', '관련 없는 본문', ['publish']),
    ])
    const hits = recallMemories(m, 'publish', 5, NOW)
    expect(hits[0].entry.id).toBe('f2') // 태그 매치가 더 강함
  })

  it('archived 항목은 강등 (active 가 상위)', () => {
    const m = mem([
      fail('f1', 'publish 차단', ['publish'], { status: 'archived' }),
      fail('f2', 'publish 차단', ['publish'], { status: 'active' }),
    ])
    const hits = recallMemories(m, 'publish', 5, NOW)
    expect(hits[0].entry.id).toBe('f2')
  })

  it('빈 쿼리 → 빈 배열', () => {
    const m = mem([fail('f1', 'publish 차단', ['publish'])])
    expect(recallMemories(m, '', 5, NOW)).toEqual([])
  })

  it('무매칭 → 빈 배열', () => {
    const m = mem([fail('f1', 'publish 차단', ['publish'])])
    expect(recallMemories(m, '데이터베이스 마이그레이션', 5, NOW)).toEqual([])
  })

  it('4신호를 분리 노출 (한 숫자로 안 땋음)', () => {
    const m = mem([fail('f1', 'publish 차단', ['publish'])])
    const [hit] = recallMemories(m, 'publish', 5, NOW)
    expect(hit.signals).toEqual(
      expect.objectContaining({
        keyword: expect.any(Number),
        tagMatch: expect.any(Number),
        recency: expect.any(Number),
        status: expect.any(Number),
      })
    )
  })

  it('결정적 — 동일 입력 동일 출력', () => {
    const m = mem([
      fail('f1', 'publish 차단', ['publish']),
      fail('f2', 'publish 인증', ['publish', 'auth']),
    ])
    const a = recallMemories(m, 'publish', 5, NOW).map((h) => h.entry.id)
    const b = recallMemories(m, 'publish', 5, NOW).map((h) => h.entry.id)
    expect(a).toEqual(b)
  })
})

describe('recallForAction (just-in-time · precision 우선)', () => {
  it('약매칭은 침묵 → 빈 배열', () => {
    const m = mem([fail('f1', '디자인 토큰 정리', ['design'])])
    expect(recallForAction(m, 'publish', '', NOW)).toEqual([])
  })

  it('강매칭은 반환', () => {
    const m = mem([
      fail('f1', 'publish 가드가 feature 브랜치 발행을 차단', ['publish']),
    ])
    const hits = recallForAction(m, 'publish', '', NOW)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].entry.id).toBe('f1')
  })

  it('archived/resolved 항목은 just-in-time 에서 제외', () => {
    const m = mem([
      fail('f1', 'publish 가드 발행 차단', ['publish'], { status: 'resolved' }),
    ])
    expect(recallForAction(m, 'publish', '', NOW)).toEqual([])
  })
})

// 통합 드리프트 가드: recall 명령이 NL 선라우터에 자연어로 오판돼 commander 로 안 가는 사고 재발 차단.
// (유닛 테스트가 못 잡고 도그푸딩이 잡았던 갭 — KNOWN_COMMAND_TOKENS 누락 시 여기서 FAIL.)
describe('recall 명령 NL 라우팅 가드 (RFC 0049)', () => {
  it('recall <쿼리> 는 자연어로 오판되지 않고 commander 로 위임된다 (null)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'recall', 'publish'])).toBeNull()
  })

  it('회상 <쿼리>(한국어 별칭)도 commander 로 위임된다 (null)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '회상', '배포'])).toBeNull()
  })
})
