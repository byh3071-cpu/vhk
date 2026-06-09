import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runGuarded } from '../src/lib/safety-guard.js'

interface SeedFail {
  id: string
  lesson: string
  tags: string[]
  status?: 'active' | 'resolved' | 'archived'
}

function seedMem(dir: string, failures: SeedFail[]): void {
  fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
  const full = failures.map((f) => ({
    id: f.id,
    content: '',
    tags: f.tags,
    createdAt: '2026-06-01T00:00:00Z',
    status: f.status ?? 'active',
    lesson: f.lesson,
  }))
  fs.writeFileSync(
    path.join(dir, '.vhk', 'memory.json'),
    JSON.stringify({ schemaVersion: 2, decisions: [], failures: full, successes: [], patterns: [] }),
    'utf-8'
  )
}

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-jit-'))
}

describe('runGuarded — just-in-time 기억 경고 (RFC 0049 ②)', () => {
  it('위험작업 직전 관련 과거 실패를 경고로 표출', async () => {
    const dir = tmp()
    seedMem(dir, [{ id: 'f1', lesson: 'publish 가드가 feature 브랜치 발행을 차단', tags: ['publish'] }])
    const logs: string[] = []
    await runGuarded('publish', { channel: 'cli', mode: 'standard', isTTY: false, cwd: dir, log: (m) => logs.push(m) }, async () => 'x')
    expect(logs.join('\n')).toContain('publish 가드')
  })

  it('관련 기억 없으면 침묵 (무관한 기억은 안 뜸)', async () => {
    const dir = tmp()
    seedMem(dir, [{ id: 'f1', lesson: '디자인 토큰 정리', tags: ['design'] }])
    const logs: string[] = []
    await runGuarded('publish', { channel: 'cli', mode: 'standard', isTTY: false, cwd: dir, log: (m) => logs.push(m) }, async () => 'x')
    expect(logs.join('\n')).not.toContain('디자인 토큰')
  })

  it('저위험(allow)은 회상하지 않음', async () => {
    const dir = tmp()
    seedMem(dir, [{ id: 'f1', lesson: 'publish 가드 발행 차단', tags: ['publish'] }])
    const logs: string[] = []
    await runGuarded('status', { channel: 'cli', mode: 'standard', cwd: dir, log: (m) => logs.push(m) }, async () => 'x')
    expect(logs.join('\n')).not.toContain('publish 가드')
  })

  it('resolved 기억은 just-in-time 에서 제외', async () => {
    const dir = tmp()
    seedMem(dir, [{ id: 'f1', lesson: 'publish 가드 발행 차단', tags: ['publish'], status: 'resolved' }])
    const logs: string[] = []
    await runGuarded('publish', { channel: 'cli', mode: 'standard', isTTY: false, cwd: dir, log: (m) => logs.push(m) }, async () => 'x')
    expect(logs.join('\n')).not.toContain('publish 가드')
  })
})
