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

  // #324: 미래 날짜 createdAt 이 recency 점수를 무한 증폭(e+127) → '약한 보너스(상한 1.0)' 무력화.
  //        미래 날짜는 '최신'으로 간주해 recency 를 1.0 으로 clamp 해야 한다.
  it('미래 날짜 createdAt → recency 1.0 으로 clamp (무한증폭·과학표기 차단)', () => {
    const m = mem([
      fail('f1', '배포 파이프라인 설정', ['publish'], { createdAt: '2099-01-01T00:00:00Z' }),
    ])
    const [hit] = recallMemories(m, '배포 파이프라인 설정', 5, NOW)
    expect(hit.signals.recency).toBeLessThanOrEqual(1)
    // 점수도 e+127 같은 폭증값이 아니어야 한다(과학표기 노출 차단).
    expect(hit.score).toBeLessThan(100)
    expect(Number.isFinite(hit.score)).toBe(true)
  })

  it('가벼운 미래 날짜(+5일)도 recency ≤ 1.0 (설계 상한 초과 금지)', () => {
    const future = new Date(NOW + 5 * 86_400_000).toISOString()
    const m = mem([fail('f1', 'publish 차단', ['publish'], { createdAt: future })])
    const [hit] = recallMemories(m, 'publish', 5, NOW)
    expect(hit.signals.recency).toBeLessThanOrEqual(1)
  })

  it('과거 날짜 recency 회귀 — 정상 반감기 유지 (0<recency≤1)', () => {
    const m = mem([
      fail('f1', 'publish 차단', ['publish'], { createdAt: '2025-01-01T00:00:00Z' }),
    ])
    const [hit] = recallMemories(m, 'publish', 5, NOW)
    expect(hit.signals.recency).toBeGreaterThan(0)
    expect(hit.signals.recency).toBeLessThanOrEqual(1)
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

// #313: 쿼리 본문에 NLP 트리거 단어(어떻게·보안·롤백 등)가 섞여도 recall 은 자유형식 검색이므로
// NL 라우터에 가로채이지 않고 항상 commander 로 위임돼야 한다 (learn/blocker 와 동일 — #147 패턴).
describe('recall 명령 자유형식 쿼리 가드 (#313 — 트리거 단어 포함)', () => {
  it('recall "이거 어떻게 해"(status 트리거)도 NL 라우팅 안 됨 (null)', () => {
    expect(
      detectNaturalLanguageInput(['node', 'vhk', 'recall', '이거', '어떻게', '해'])
    ).toBeNull()
  })

  it('recall "보안 이슈"(secure 트리거)도 NL 라우팅 안 됨 (null)', () => {
    expect(
      detectNaturalLanguageInput(['node', 'vhk', 'recall', '보안', '이슈'])
    ).toBeNull()
  })

  it('recall "롤백 방법"(undo 트리거)도 NL 라우팅 안 됨 (null)', () => {
    expect(
      detectNaturalLanguageInput(['node', 'vhk', 'recall', '롤백', '방법'])
    ).toBeNull()
  })

  it('회상 "어떻게 하지"(한글 별칭 + status 트리거)도 NL 라우팅 안 됨 (null)', () => {
    expect(
      detectNaturalLanguageInput(['node', 'vhk', '회상', '어떻게', '하지'])
    ).toBeNull()
  })

  it('대조군 recall "publish"(트리거 없음) 회귀 0 (null)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'recall', 'publish'])).toBeNull()
  })

  it('learn/blocker 자유형식 쿼리 회귀 0 (트리거 단어 포함도 null)', () => {
    expect(
      detectNaturalLanguageInput(['node', 'vhk', 'learn', '보안', '롤백'])
    ).toBeNull()
    expect(
      detectNaturalLanguageInput(['node', 'vhk', 'blocker', '어떻게', '해'])
    ).toBeNull()
  })
})
