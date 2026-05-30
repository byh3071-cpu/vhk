import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  normalizeForCompare,
  extractContextSha,
  checkRuleDrift,
  checkContextDrift,
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

describe('checkContextDrift — file-change 기반 정밀화', () => {
  let dir: string
  const git = (args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  const head = () =>
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim()
  const writeCtx = (sha: string) => {
    fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.vhk/context.md'),
      `# ctx\n\n---\n_생성: x_\n_${CONTEXT_GIT_MARKER}: ${sha}_\n`,
      'utf-8'
    )
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-ctxdrift-'))
    git(['init'])
    git(['config', 'user.email', 't@t.com'])
    git(['config', 'user.name', 't'])
    git(['config', 'commit.gpgsign', 'false'])
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x","version":"1.0.0"}', 'utf-8')
    fs.writeFileSync(path.join(dir, 'README.md'), 'hello\n', 'utf-8')
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const a = 1\n', 'utf-8')
    git(['add', '-A'])
    git(['commit', '-m', 'init'])
  })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('같은 HEAD = not stale', () => {
    writeCtx(head())
    const r = checkContextDrift(dir)
    expect(r.checked).toBe(true)
    expect(r.stale).toBe(false)
  })

  it('README 오타 커밋(무관 내용수정) = not stale', () => {
    writeCtx(head())
    fs.writeFileSync(path.join(dir, 'README.md'), 'helllo\n', 'utf-8')
    git(['commit', '-am', 'fix typo'])
    const r = checkContextDrift(dir)
    expect(r.checked).toBe(true)
    expect(r.stale).toBe(false) // HEAD 앞섰어도 context 소스 안 바뀜 → not stale
  })

  it('src 코드 내용수정(content·트리 무관) = not stale', () => {
    writeCtx(head())
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const a = 2\n', 'utf-8')
    git(['commit', '-am', 'edit src'])
    expect(checkContextDrift(dir).stale).toBe(false)
  })

  it('package.json 변경(기술스택 영향) = stale', () => {
    writeCtx(head())
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x","version":"2.0.0"}', 'utf-8')
    git(['commit', '-am', 'bump'])
    expect(checkContextDrift(dir).stale).toBe(true)
  })

  it('새 파일 추가(구조변동 ADR) = stale', () => {
    writeCtx(head())
    fs.writeFileSync(path.join(dir, 'src', 'new.ts'), 'export const b = 1\n', 'utf-8')
    git(['add', '-A'])
    git(['commit', '-m', 'add file'])
    expect(checkContextDrift(dir).stale).toBe(true)
  })

  it('마커 없는 옛 context.md = checked false', () => {
    fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.vhk', 'context.md'), '_생성: x_\n', 'utf-8')
    expect(checkContextDrift(dir).checked).toBe(false)
  })

  it('git 아님 = checked false', () => {
    const nogit = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-nogit-'))
    fs.mkdirSync(path.join(nogit, '.vhk'), { recursive: true })
    fs.writeFileSync(
      path.join(nogit, '.vhk', 'context.md'),
      `_${CONTEXT_GIT_MARKER}: abc1234_\n`,
      'utf-8'
    )
    expect(checkContextDrift(nogit).checked).toBe(false)
    fs.rmSync(nogit, { recursive: true, force: true })
  })
})
