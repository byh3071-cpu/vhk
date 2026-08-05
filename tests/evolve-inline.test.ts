import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { PatternEntryV19 } from '../src/commands/pattern.js'
import {
  EVOLVE_CANDIDATE_TTL_DAYS,
  generateInlineCandidates,
} from '../src/lib/evolve-candidates.js'

const NOW = '2026-08-05T00:00:00.000Z'

function pattern(
  id: string,
  createdAt: string,
  status: 'active' | 'archived' = 'active',
): PatternEntryV19 {
  return {
    id,
    kind: 'avoid',
    axis: 'tag',
    signal: `signal-${id}`,
    count: 3,
    sources: [],
    summary: '반복 실패',
    createdAt,
    status,
    tags: [],
    _sig: `avoid:tag:signal-${id}`,
  }
}

describe('큐 없는 인라인 진화 후보', () => {
  it('활성 패턴을 고정 ID 후보로 계산하며 파일 상태가 필요 없다', () => {
    const candidates = generateInlineCandidates(
      [pattern('p2', '2026-08-04T00:00:00.000Z'), pattern('p1', '2026-08-03T00:00:00.000Z')],
      new Set(),
      NOW,
    )

    expect(EVOLVE_CANDIDATE_TTL_DAYS).toBe(7)
    expect(candidates.map((candidate) => candidate.id)).toEqual(['p1:rule', 'p2:rule'])
    expect(candidates[0]).toMatchObject({
      patternId: 'p1',
      status: 'pending',
      dedupeKey: 'p1:rule',
      expiresAt: '2026-08-10T00:00:00.000Z',
    })
  })

  it('7일 경계부터 만료되고 잘못된 날짜와 보관 패턴은 제외한다', () => {
    const candidates = generateInlineCandidates(
      [
        pattern('p1', '2026-07-29T00:00:00.000Z'),
        pattern('p2', '잘못된 날짜'),
        pattern('p3', '2026-08-04T00:00:00.000Z', 'archived'),
      ],
      new Set(),
      NOW,
    )

    expect(candidates).toEqual([])
  })

  it('이미 승인하거나 기각한 patternId:targetLayer는 다시 제안하지 않는다', () => {
    const candidates = generateInlineCandidates(
      [pattern('p1', '2026-08-04T00:00:00.000Z'), pattern('p2', '2026-08-04T00:00:00.000Z')],
      new Set(['p1:rule']),
      NOW,
    )

    expect(candidates.map((candidate) => candidate.id)).toEqual(['p2:rule'])
  })
})

describe('evolve suggest는 후보를 큐에 저장하지 않는다', () => {
  let originalCwd = process.cwd()
  let tempDir: string | undefined

  afterEach(() => {
    process.chdir(originalCwd)
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true })
    tempDir = undefined
    process.exitCode = 0
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('--json은 실시간 후보를 출력하고 queue.json을 만들지 않는다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-evolve-inline-'))
    fs.mkdirSync(path.join(tempDir, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'RULES.md'), '# Rules\n', 'utf8')
    fs.writeFileSync(
      path.join(tempDir, '.vhk', 'memory.json'),
      JSON.stringify({
        schemaVersion: 2,
        decisions: [],
        failures: [],
        successes: [],
        patterns: [pattern('p1', '2026-08-04T00:00:00.000Z')],
      }),
      'utf8',
    )
    originalCwd = process.cwd()
    process.chdir(tempDir)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { evolveSuggest } = await import('../src/commands/evolve.js')
    await evolveSuggest({ json: true })

    const json = JSON.parse(String(output.mock.calls.at(-1)?.[0])) as Array<{ id: string }>
    expect(json.map((candidate) => candidate.id)).toEqual(['p1:rule'])
    expect(fs.existsSync(path.join(tempDir, '.vhk', 'evolve', 'queue.json'))).toBe(false)
    expect(fs.readFileSync(path.join(tempDir, 'RULES.md'), 'utf8')).toBe('# Rules\n')
  })

  it('pattern detect는 새 패턴 자리에서 승인·기각 명령을 바로 보여준다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-pattern-inline-'))
    fs.mkdirSync(path.join(tempDir, '.vhk'), { recursive: true })
    const failures = [1, 2, 3].map((n) => ({
      id: `f${n}`,
      content: '빌드 실패',
      tags: ['build'],
      createdAt: `2026-08-0${n}T00:00:00.000Z`,
      status: 'active',
      lesson: '빌드 전에 확인',
    }))
    fs.writeFileSync(
      path.join(tempDir, '.vhk', 'memory.json'),
      JSON.stringify({ schemaVersion: 2, decisions: [], failures, successes: [], patterns: [] }),
      'utf8',
    )
    originalCwd = process.cwd()
    process.chdir(tempDir)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { patternDetect } = await import('../src/commands/pattern.js')
    await patternDetect({ min: '3' })

    const text = output.mock.calls.map((call) => String(call[0])).join('\n')
    expect(text).toMatch(/바로 선택할 규칙 후보 \d+개/)
    expect(text).toContain('vhk evolve apply p1:rule')
    expect(text).toContain('vhk evolve reject p1:rule')
    expect(fs.existsSync(path.join(tempDir, '.vhk', 'evolve', 'queue.json'))).toBe(false)
  })
})
