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
  checkNextTaskFreshness,
  CONTEXT_GIT_MARKER,
} from '../src/lib/drift.js'
import { buildSyncPlan, parseRulesMd, deriveProjectName, SYNC_TARGETS } from '../src/commands/sync.js'

const SAMPLE_RULES = `# 드리프트데모 — Rules

## 코딩 규칙
- execSync 금지
- kebab-case

## 기록 규칙
- 세션 로그
`

type ProjectFixture = {
  compact: boolean
  ecosystem: boolean
}

function writeRulesAndSync(dir: string, rules: string): void {
  fs.writeFileSync(path.join(dir, 'RULES.md'), rules, 'utf-8')
  const sections = parseRulesMd(rules)
  const name = deriveProjectName(rules)
  for (const item of buildSyncPlan(dir, sections, name)) {
    const full = path.join(dir, item.path)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, item.newContent, 'utf-8')
  }
}

function makeProject(fixture: ProjectFixture = { compact: false, ecosystem: false }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-drift-'))
  fs.writeFileSync(path.join(dir, 'RULES.md'), SAMPLE_RULES, 'utf-8')
  if (fixture.compact) {
    const compactPath = path.join(dir, 'docs/context/agent-compact.md')
    fs.mkdirSync(path.dirname(compactPath), { recursive: true })
    fs.writeFileSync(compactPath, '# compact\n', 'utf-8')
  }
  if (fixture.ecosystem) {
    const ecosystemPath = path.join(dir, '.cursor/rules/ecosystem.mdc')
    fs.mkdirSync(path.dirname(ecosystemPath), { recursive: true })
    fs.writeFileSync(ecosystemPath, '# ecosystem\n', 'utf-8')
  }

  // 실제 sync 와 같은 buildSyncPlan 결과를 기록해 "sync 직후" 상태를 만든다.
  writeRulesAndSync(dir, SAMPLE_RULES)
  return dir
}

describe('normalizeForCompare', () => {
  it('CRLF→LF 통일 — autocrlf 거짓 드리프트 방지', () => {
    expect(normalizeForCompare('a\r\nb\r\n')).toBe(normalizeForCompare('a\nb\n'))
  })
  it('끝 공백/빈줄 차이 무시', () => {
    expect(normalizeForCompare('a\nb   \n\n\n')).toBe(normalizeForCompare('a\nb\n'))
  })
  it('파일 끝 개행 유무 차이 무시', () => {
    expect(normalizeForCompare('a')).toBe(normalizeForCompare('a\n'))
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

  it.each([
    ['compact 없음 + ecosystem 있음', { compact: false, ecosystem: true }],
    ['compact 있음 + ecosystem 없음', { compact: true, ecosystem: false }],
    ['둘 다 없음', { compact: false, ecosystem: false }],
    ['둘 다 있음', { compact: true, ecosystem: true }],
  ] as const)('sync 직후 AGENTS.md drift 없음 — %s', (_name, fixture) => {
    const fixtureDir = makeProject(fixture)
    try {
      const result = checkRuleDrift(fixtureDir).results.find(x => x.path === 'AGENTS.md')
      expect(result?.status).toBe('ok')
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
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

  it('drifted 결과에 첫 상이 지점과 전체 줄 차이를 담는다', () => {
    const cursorPath = path.join(dir, '.cursorrules')
    const expected = fs.readFileSync(cursorPath, 'utf-8')
    const expectedLines = expected.split('\n')
    expectedLines[0] = '# 손상된 헤더'
    fs.writeFileSync(cursorPath, expectedLines.join('\n'), 'utf-8')

    const result = checkRuleDrift(dir, { fullDiff: true }).results.find(x => x.path === '.cursorrules')
    expect(result?.status).toBe('drifted')
    expect(result?.differences?.[0]).toEqual({
      line: 1,
      expected: expected.split('\n')[0],
      actual: '# 손상된 헤더',
    })
  })

  it('한 줄 삽입은 후속 줄 전체가 아니라 삽입 1건으로 정렬한다', () => {
    const cursorPath = path.join(dir, '.cursorrules')
    const actualLines = fs.readFileSync(cursorPath, 'utf-8').split('\n')
    actualLines.splice(1, 0, '# 손으로 삽입')
    fs.writeFileSync(cursorPath, actualLines.join('\n'), 'utf-8')

    const result = checkRuleDrift(dir, { fullDiff: true }).results.find(x => x.path === '.cursorrules')
    expect(result?.differences).toEqual([
      { line: 2, expected: null, actual: '# 손으로 삽입' },
    ])
  })

  it('대규모 전체 차이도 동일한 후속 줄을 오탐하지 않는다', () => {
    const rules = [
      '# 대규모 규칙 — Rules',
      '',
      '## 코딩 규칙',
      ...Array.from({ length: 1_100 }, (_, index) => `- 고유 규칙 ${index + 1}`),
      '',
    ].join('\n')
    writeRulesAndSync(dir, rules)

    const cursorPath = path.join(dir, '.cursorrules')
    const expectedLines = fs.readFileSync(cursorPath, 'utf-8').split('\n')
    expect(expectedLines.length).toBeGreaterThan(1_000)
    const firstLine = 100
    const secondLine = 1_000
    const firstExpected = expectedLines[firstLine - 1]
    const secondExpected = expectedLines[secondLine - 1]
    expectedLines[firstLine - 1] = '- 첫 번째 손상'
    expectedLines[secondLine - 1] = '- 두 번째 손상'
    fs.writeFileSync(cursorPath, expectedLines.join('\n'), 'utf-8')

    const result = checkRuleDrift(dir, { fullDiff: true }).results.find(x => x.path === '.cursorrules')
    expect(result?.differences).toEqual([
      { line: firstLine, expected: firstExpected, actual: '- 첫 번째 손상' },
      { line: secondLine, expected: secondExpected, actual: '- 두 번째 손상' },
    ])
  })

  it('반복 줄이 많은 대규모 파일도 삽입·삭제 연쇄 오탐 없이 정렬한다', () => {
    const rules = [
      '# 반복 규칙 — Rules',
      '',
      '## 코딩 규칙',
      ...Array.from({ length: 1_200 }, (_, index) => `- 반복 ${index % 2 === 0 ? 'A' : 'B'}`),
      '',
    ].join('\n')
    writeRulesAndSync(dir, rules)

    const cursorPath = path.join(dir, '.cursorrules')
    const actualLines = fs.readFileSync(cursorPath, 'utf-8').split('\n')
    actualLines.splice(10, 0, '- INSERT_X')
    actualLines.splice(1_190, 1)
    fs.writeFileSync(cursorPath, actualLines.join('\n'), 'utf-8')

    const result = checkRuleDrift(dir, { fullDiff: true }).results.find(x => x.path === '.cursorrules')
    expect(result?.fullDiffLimited).toBeUndefined()
    expect(result?.differences).toHaveLength(2)
    expect(result?.differences).toContainEqual({ line: 11, expected: null, actual: '- INSERT_X' })
    expect(result?.differences?.some(difference => difference.expected !== null && difference.actual === null)).toBe(true)
  })

  it('전체 차이 안전 상한을 넘으면 첫 차이만 반환하고 제한을 명시한다', () => {
    const rules = [
      '# 초대형 규칙 — Rules',
      '',
      '## 코딩 규칙',
      ...Array.from({ length: 2_100 }, (_, index) => `- 고유 초대형 규칙 ${index + 1}`),
      '',
    ].join('\n')
    writeRulesAndSync(dir, rules)

    const cursorPath = path.join(dir, '.cursorrules')
    const actualLines = fs.readFileSync(cursorPath, 'utf-8').split('\n')
    actualLines[9] = '- 손상'
    fs.writeFileSync(cursorPath, actualLines.join('\n'), 'utf-8')

    const result = checkRuleDrift(dir, { fullDiff: true }).results.find(x => x.path === '.cursorrules')
    expect(result?.fullDiffLimited).toBe(true)
    expect(result?.differences).toHaveLength(1)
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

describe('checkNextTaskFreshness', () => {
  it('next-task 파생본보다 연결된 goal 원본이 새로우면 stale', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-next-fresh-'))
    try {
      const goal = path.join(dir, 'goals', '7-sample.md')
      const derived = path.join(dir, 'docs', 'state', 'next-task.md')
      fs.mkdirSync(path.dirname(goal), { recursive: true })
      fs.mkdirSync(path.dirname(derived), { recursive: true })
      fs.writeFileSync(goal, '# Goal 7\n', 'utf-8')
      fs.writeFileSync(derived, `# Next Task\n  file: ${goal}\n`, 'utf-8')
      fs.utimesSync(derived, new Date('2026-08-01T00:00:00Z'), new Date('2026-08-01T00:00:00Z'))
      fs.utimesSync(goal, new Date('2026-08-02T00:00:00Z'), new Date('2026-08-02T00:00:00Z'))
      expect(checkNextTaskFreshness(dir)).toMatchObject({ checked: true, stale: true })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('레포 밖 경로는 원본으로 읽지 않는다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-next-boundary-'))
    try {
      const derived = path.join(dir, 'docs', 'state', 'next-task.md')
      fs.mkdirSync(path.dirname(derived), { recursive: true })
      fs.writeFileSync(derived, '# Next Task\n  file: C:\\outside\\goal.md\n', 'utf-8')
      expect(checkNextTaskFreshness(dir).checked).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
