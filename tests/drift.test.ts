import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  normalizeForCompare,
  extractContextSha,
  checkRuleDrift,
  CONTEXT_GIT_MARKER,
} from '../src/lib/drift.js'
import { parseRulesMd, deriveProjectName, SYNC_TARGETS } from '../src/commands/sync.js'

const SAMPLE_RULES = `# 드리프트데모 — Rules

## 코딩 규칙
- execSync 금지
- kebab-case

## 기록 규칙
- 세션 로그
`

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-drift-'))
  fs.writeFileSync(path.join(dir, 'RULES.md'), SAMPLE_RULES, 'utf-8')
  // sync 와 동일하게 SYNC_TARGETS 로 생성 (드리프트 없는 초기 상태)
  const sections = parseRulesMd(SAMPLE_RULES)
  const name = deriveProjectName(SAMPLE_RULES)
  for (const t of SYNC_TARGETS) {
    const full = path.join(dir, t.path)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, t.generate(sections, name), 'utf-8')
  }
  return dir
}

describe('normalizeForCompare', () => {
  it('CRLF→LF 통일 — autocrlf 거짓 드리프트 방지', () => {
    expect(normalizeForCompare('a\r\nb\r\n')).toBe(normalizeForCompare('a\nb\n'))
  })
  it('끝 공백/빈줄 차이 무시', () => {
    expect(normalizeForCompare('a\nb   \n\n\n')).toBe(normalizeForCompare('a\nb\n'))
  })
  it('내용 차이는 유지', () => {
    expect(normalizeForCompare('a\nb')).not.toBe(normalizeForCompare('a\nc'))
  })
})

describe('checkRuleDrift', () => {
  let dir: string
  beforeEach(() => { dir = makeProject() })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('갓 생성된 상태 = 전부 ok', () => {
    const r = checkRuleDrift(dir)
    expect(r.checked).toBe(true)
    expect(r.results.every(x => x.status === 'ok')).toBe(true)
    expect(r.results.length).toBe(SYNC_TARGETS.length)
  })

  it('CRLF 로 체크아웃돼도 ok (정규화)', () => {
    const cursor = path.join(dir, '.cursorrules')
    const crlf = fs.readFileSync(cursor, 'utf-8').replace(/\n/g, '\r\n')
    fs.writeFileSync(cursor, crlf, 'utf-8')
    const r = checkRuleDrift(dir)
    expect(r.results.find(x => x.path === '.cursorrules')?.status).toBe('ok')
  })

  it('생성 파일 직접 수정 = drifted', () => {
    fs.appendFileSync(path.join(dir, '.cursorrules'), '\n## 손으로 추가한 규칙\n- 멋대로\n', 'utf-8')
    const r = checkRuleDrift(dir)
    expect(r.results.find(x => x.path === '.cursorrules')?.status).toBe('drifted')
  })

  it('RULES.md 변경 후 sync 안 함 = drifted', () => {
    fs.writeFileSync(path.join(dir, 'RULES.md'), SAMPLE_RULES + '\n## 디자인\n- 새 규칙\n', 'utf-8')
    const r = checkRuleDrift(dir)
    // 코딩 섹션 키에 '디자인' 포함 → 생성물 바뀜 → 기존 파일과 어긋남
    expect(r.results.some(x => x.status === 'drifted')).toBe(true)
  })

  it('생성 파일 없으면 missing', () => {
    fs.rmSync(path.join(dir, '.cursorrules'))
    const r = checkRuleDrift(dir)
    expect(r.results.find(x => x.path === '.cursorrules')?.status).toBe('missing')
  })

  it('RULES.md 없으면 checked=false', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-norules-'))
    expect(checkRuleDrift(empty).checked).toBe(false)
    fs.rmSync(empty, { recursive: true, force: true })
  })
})

describe('extractContextSha', () => {
  it('마커에서 sha 추출', () => {
    const sha = 'abcdef0123456789abcdef0123456789abcdef01' // 40-hex
    expect(sha.length).toBe(40)
    expect(extractContextSha(`_생성: ...\n_${CONTEXT_GIT_MARKER}: ${sha}_\n`)).toBe(sha)
  })
  it('마커 없으면 null (옛 context.md)', () => {
    expect(extractContextSha('_생성: 2026-05-30_\n')).toBeNull()
  })
})
