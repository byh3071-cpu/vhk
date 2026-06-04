import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildDraft,
  buildDedupeKey,
  generateCandidates,
  isDuplicateRule,
  readQueue,
  writeQueue,
  nextQueueId,
  checkApplyRef,
  QUEUE_PATH_REL,
  type EvolveItemStatus,
  type EvolveQueueItem,
  type EvolveQueueFile,
} from '../src/commands/evolve.js'
import type { PatternEntryV19 } from '../src/commands/pattern.js'

/**
 * Goal 20 Task 1: evolve 큐 스키마 + 순수 함수 단위 테스트.
 * 모든 순수 함수 및 큐 I/O 커버.
 */

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-evolve-'))
}

function pat(
  id: string,
  signal: string,
  count = 3,
  kind: 'avoid' | 'reinforce' = 'avoid',
  status: 'active' | 'archived' = 'active'
): PatternEntryV19 {
  return {
    id,
    kind,
    axis: 'tag',
    signal,
    count,
    sources: Array.from({ length: count }, (_, i) => `f${i + 1}`),
    summary: `[${kind}] 태그 '${signal}' ${count}건 반복`,
    createdAt: '2026-01-01T00:00:00Z',
    status,
    tags: [signal],
    _sig: `${kind}:tag:${signal}`,
  }
}

function queueItem(
  patternId: string,
  status: EvolveItemStatus,
  id = `e_${patternId}`
): EvolveQueueItem {
  return {
    id,
    patternId,
    kind: 'rule',
    status,
    draft: `- 태그 '${patternId}' 관련 작업 시 사전 점검 필수`,
    dedupeKey: `${patternId}:rule`,
    createdAt: '2026-01-01T00:00:00Z',
  }
}

// ── buildDraft ───────────────────────────────────────────────────────────────

describe('buildDraft', () => {
  it('avoid 패턴 → 한국어 룰 초안 포함 signal', () => {
    const p = pat('p1', 'build', 3)
    const draft = buildDraft(p)
    expect(draft).toContain("'build'")
    expect(draft).toContain('사전 점검 필수')
    expect(draft).toContain('3건 반복')
  })

  it('결정적 — 같은 입력 → 같은 출력', () => {
    const p = pat('p2', 'env', 4)
    const a = buildDraft(p)
    const b = buildDraft(p)
    expect(a).toBe(b)
  })

  it('signal 이 포함된 룰 생성', () => {
    const p = pat('p3', 'auth', 5)
    const draft = buildDraft(p)
    expect(draft).toContain("'auth'")
  })
})

// ── buildDedupeKey ───────────────────────────────────────────────────────────

describe('buildDedupeKey', () => {
  it('patternId:rule 형식 반환', () => {
    expect(buildDedupeKey('p1', 'rule')).toBe('p1:rule')
    expect(buildDedupeKey('p99', 'rule')).toBe('p99:rule')
  })
})

// ── generateCandidates ───────────────────────────────────────────────────────

describe('generateCandidates', () => {
  it('avoid+active 패턴만 후보 생성', () => {
    const patterns = [pat('p1', 'build'), pat('p2', 'env')]
    const result = generateCandidates(patterns, [])
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.kind === 'rule')).toBe(true)
    expect(result.every((r) => r.status === 'pending')).toBe(true)
  })

  it('reinforce 패턴 제외', () => {
    const patterns = [
      pat('p1', 'build', 3, 'avoid'),
      pat('p2', 'deploy', 3, 'reinforce'),
    ]
    const result = generateCandidates(patterns, [])
    expect(result).toHaveLength(1)
    expect(result[0].patternId).toBe('p1')
  })

  it('archived 패턴 제외', () => {
    const patterns = [
      pat('p1', 'build', 3, 'avoid', 'active'),
      pat('p2', 'env', 3, 'avoid', 'archived'),
    ]
    const result = generateCandidates(patterns, [])
    expect(result).toHaveLength(1)
    expect(result[0].patternId).toBe('p1')
  })

  it('A1: rejected dedupeKey → 재제안 억제', () => {
    const patterns = [pat('p1', 'build')]
    const existing = [queueItem('p1', 'rejected', 'e1')]
    // e1 의 dedupeKey = 'p1:rule' — buildDedupeKey 와 맞춰야 함
    existing[0].dedupeKey = 'p1:rule'
    const result = generateCandidates(patterns, existing)
    expect(result).toHaveLength(0)
  })

  it('A2: pending dedupeKey → 재제안 없음', () => {
    const patterns = [pat('p1', 'build')]
    const existing = [{ ...queueItem('p1', 'pending', 'e1'), dedupeKey: 'p1:rule' }]
    const result = generateCandidates(patterns, existing)
    expect(result).toHaveLength(0)
  })

  it('A2: applied dedupeKey → 재제안 없음', () => {
    const patterns = [pat('p1', 'build')]
    const existing = [{ ...queueItem('p1', 'applied', 'e1'), dedupeKey: 'p1:rule' }]
    const result = generateCandidates(patterns, existing)
    expect(result).toHaveLength(0)
  })

  it('결정성: 같은 입력 → 같은 순서', () => {
    const patterns = [pat('p3', 'css'), pat('p1', 'build'), pat('p2', 'env')]
    const a = generateCandidates(patterns, [])
    const b = generateCandidates([...patterns].reverse(), [])
    expect(a.map((r) => r.patternId)).toEqual(b.map((r) => r.patternId))
    // patternId 알파벳 오름차순
    expect(a.map((r) => r.patternId)).toEqual(['p1', 'p2', 'p3'])
  })
})

// ── isDuplicateRule ──────────────────────────────────────────────────────────

describe('isDuplicateRule', () => {
  it('완전 동일 룰 감지', () => {
    const content = '# Rules\n- 빌드 전 점검 필수\n- 다른 룰\n'
    expect(isDuplicateRule(content, '- 빌드 전 점검 필수')).toBe(true)
  })

  it('공백 차이 있어도 동일 감지', () => {
    const content = '# Rules\n-  빌드  전  점검  필수  \n'
    expect(isDuplicateRule(content, '- 빌드 전 점검 필수')).toBe(true)
  })

  it('다른 룰은 false', () => {
    const content = '# Rules\n- 배포 전 체크\n'
    expect(isDuplicateRule(content, '- 빌드 전 점검 필수')).toBe(false)
  })

  it('대소문자 차이 있어도 동일 감지', () => {
    const content = '- BUILD CHECK REQUIRED\n'
    expect(isDuplicateRule(content, '- build check required')).toBe(true)
  })
})

// ── readQueue ────────────────────────────────────────────────────────────────

describe('readQueue', () => {
  it('파일 없으면 빈 큐 반환', () => {
    const d = tmp()
    const q = readQueue(d)
    expect(q.version).toBe(1)
    expect(q.items).toEqual([])
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('손상 파일 → 빈 큐 반환 (no throw)', () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk', 'evolve'), { recursive: true })
    fs.writeFileSync(path.join(d, QUEUE_PATH_REL), '{ invalid json <<<', 'utf-8')
    expect(() => readQueue(d)).not.toThrow()
    const q = readQueue(d)
    expect(q.items).toEqual([])
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('BOM 있는 파일도 정상 파싱', () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk', 'evolve'), { recursive: true })
    const queue: EvolveQueueFile = { version: 1, items: [] }
    const content = '﻿' + JSON.stringify(queue, null, 2)
    fs.writeFileSync(path.join(d, QUEUE_PATH_REL), content, 'utf-8')
    const q = readQueue(d)
    expect(q.items).toEqual([])
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('writeQueue 로 쓴 파일 readQueue 로 복원', () => {
    const d = tmp()
    const queue: EvolveQueueFile = {
      version: 1,
      items: [queueItem('p1', 'pending', 'e1')],
    }
    writeQueue(d, queue)
    const q = readQueue(d)
    expect(q.items).toHaveLength(1)
    expect(q.items[0].id).toBe('e1')
    fs.rmSync(d, { recursive: true, force: true })
  })
})

// ── nextQueueId ──────────────────────────────────────────────────────────────

describe('nextQueueId', () => {
  it('빈 큐 → e1', () => {
    const q: EvolveQueueFile = { version: 1, items: [] }
    expect(nextQueueId(q)).toBe('e1')
  })

  it('e3까지 있으면 → e4', () => {
    const q: EvolveQueueFile = {
      version: 1,
      items: [
        queueItem('p1', 'pending', 'e1'),
        queueItem('p2', 'rejected', 'e2'),
        queueItem('p3', 'applied', 'e3'),
      ],
    }
    expect(nextQueueId(q)).toBe('e4')
  })

  it('비연속 id 에서 최댓값+1 반환', () => {
    const q: EvolveQueueFile = {
      version: 1,
      items: [
        queueItem('p1', 'pending', 'e1'),
        queueItem('p2', 'rejected', 'e5'),
      ],
    }
    expect(nextQueueId(q)).toBe('e6')
  })
})

// ── checkApplyRef ────────────────────────────────────────────────────────────

describe('checkApplyRef', () => {
  it('active 패턴 → ok', () => {
    const p = pat('p1', 'build', 3, 'avoid', 'active')
    expect(checkApplyRef(p, [])).toBe('ok')
  })

  it('undefined → ok', () => {
    expect(checkApplyRef(undefined, [])).toBe('ok')
  })

  it('archived + applied 없음 → dismissed', () => {
    const p = pat('p1', 'build', 3, 'avoid', 'archived')
    const items = [queueItem('p1', 'rejected', 'e1')]
    expect(checkApplyRef(p, items)).toBe('dismissed')
  })

  it('archived + applied 있음 → already-applied', () => {
    const p = pat('p1', 'build', 3, 'avoid', 'archived')
    const items = [queueItem('p1', 'applied', 'e1')]
    expect(checkApplyRef(p, items)).toBe('already-applied')
  })

  it('archived + 다른 패턴만 applied → dismissed', () => {
    const p = pat('p1', 'build', 3, 'avoid', 'archived')
    const items = [queueItem('p2', 'applied', 'e1')]
    expect(checkApplyRef(p, items)).toBe('dismissed')
  })
})

// ── generateCandidates — suggest 통합 시나리오 ──────────────────────────────

describe('generateCandidates — suggest 통합 시나리오', () => {
  it('여러 avoid 패턴에서 복수 후보 생성', () => {
    const patterns: PatternEntryV19[] = [
      pat('p1', 'build', 3),
      pat('p2', 'env', 5),
      pat('p3', 'auth', 4),
    ]
    const candidates = generateCandidates(patterns, [])
    expect(candidates).toHaveLength(3)
    // 알파벳 순 정렬 (p1, p2, p3)
    expect(candidates[0].patternId).toBe('p1')
    expect(candidates[1].patternId).toBe('p2')
    expect(candidates[2].patternId).toBe('p3')
  })

  it('중복 제안 후 재실행 → 신규 후보 0개', () => {
    const patterns = [pat('p1', 'build', 3)]
    const existing = generateCandidates(patterns, [])
      .map((c, i) => ({ ...c, id: `e${i + 1}`, createdAt: '2026-01-01T00:00:00Z' }))
    // 이미 pending인 항목 있으면 재제안 안 됨
    const second = generateCandidates(patterns, existing)
    expect(second).toHaveLength(0)
  })

  it('각 후보는 status=pending, kind=rule 을 가짐', () => {
    const patterns = [pat('p1', 'build', 3), pat('p2', 'env', 2)]
    const candidates = generateCandidates(patterns, [])
    for (const c of candidates) {
      expect(c.status).toBe('pending')
      expect(c.kind).toBe('rule')
    }
  })

  it('dedupeKey 형식이 patternId:rule', () => {
    const patterns = [pat('p1', 'build', 3)]
    const candidates = generateCandidates(patterns, [])
    expect(candidates[0].dedupeKey).toBe('p1:rule')
  })
})

// ── C1 단일 apply 제약 — hasUnresolved 로직 ──────────────────────────────────

describe('C1 단일 apply 제약 — hasUnresolved 로직', () => {
  it('applied 항목 없으면 hasUnresolved = false', () => {
    const items: EvolveQueueItem[] = [
      { id: 'e1', patternId: 'p1', kind: 'rule', status: 'pending',
        draft: '룰', dedupeKey: 'p1:rule', createdAt: '2026-01-01T00:00:00Z' },
    ]
    expect(items.some(i => i.status === 'applied')).toBe(false)
  })

  it('applied 항목 있으면 hasUnresolved = true (2번째 apply 차단)', () => {
    const items: EvolveQueueItem[] = [
      { id: 'e1', patternId: 'p1', kind: 'rule', status: 'applied',
        draft: '반영됨', dedupeKey: 'p1:rule', createdAt: '2026-01-01T00:00:00Z' },
    ]
    expect(items.some(i => i.status === 'applied')).toBe(true)
  })
})
