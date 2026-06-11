import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { syncCheck, syncCore, SYNC_TARGETS } from '../src/commands/sync.js'

const RULES = [
  '# 데모 — 테스트',
  '',
  '## 코딩 규칙',
  '',
  '- A 규칙',
  '',
  '## 기록 규칙',
  '',
  '- 로그 남기기',
  '',
].join('\n')

let dir: string

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-synccheck-'))
  fs.writeFileSync(path.join(dir, 'RULES.md'), RULES, 'utf-8')
  // 실제 sync 로 8타겟 생성 — check 의 기준 상태(동기화 완료)
  await syncCore(dir, { yes: true }, async () => true)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('syncCheck — 8타겟 drift 검사 (Goal 63)', () => {
  it('동기화 직후 → ok, drift/missing 0', () => {
    const r = syncCheck(dir)
    expect(r.ok).toBe(true)
    expect(r.drifted).toEqual([])
    expect(r.missing).toEqual([])
  })

  it('타겟 직접 수정(.cursorrules) → drifted 감지', () => {
    const p = path.join(dir, '.cursorrules')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf-8') + '\n- 몰래 추가\n', 'utf-8')
    const r = syncCheck(dir)
    expect(r.ok).toBe(false)
    expect(r.drifted).toContain('.cursorrules')
  })

  it('RULES.md 만 수정(sync 미실행) → 전 타겟급 drift', () => {
    fs.writeFileSync(path.join(dir, 'RULES.md'), RULES.replace('- A 규칙', '- A2 규칙'), 'utf-8')
    const r = syncCheck(dir)
    expect(r.ok).toBe(false)
    expect(r.drifted.length).toBeGreaterThanOrEqual(SYNC_TARGETS.length) // 코딩 섹션은 전 코딩 타겟에 전파
  })

  it('타겟 삭제 → missing 감지', () => {
    fs.rmSync(path.join(dir, 'AGENTS.md'))
    const r = syncCheck(dir)
    expect(r.ok).toBe(false)
    expect(r.missing).toContain('AGENTS.md')
  })

  it('CLAUDE.md 블록 변조 → drifted 에 CLAUDE.md', () => {
    const p = path.join(dir, 'CLAUDE.md')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf-8').replace('- 로그 남기기', '- 변조'), 'utf-8')
    const r = syncCheck(dir)
    expect(r.drifted).toContain('CLAUDE.md')
  })

  it('CRLF-only 차이는 drift 아님 (normalizeForCompare 거짓경보 방지 보존)', () => {
    const p = path.join(dir, '.windsurfrules')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf-8').replace(/\n/g, '\r\n'), 'utf-8')
    const r = syncCheck(dir)
    expect(r.drifted).not.toContain('.windsurfrules')
  })

  it('검사 자체는 쓰기 0 — 파일 mtime/내용 불변', () => {
    const p = path.join(dir, '.cursorrules')
    const before = fs.readFileSync(p, 'utf-8')
    syncCheck(dir)
    expect(fs.readFileSync(p, 'utf-8')).toBe(before)
  })
})
