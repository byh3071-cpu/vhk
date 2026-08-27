import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  changedPathsBetweenDetailed,
  classifyPath,
  deriveTaskKindDetailed,
  deriveTaskKind,
  normalizeTaskKind,
  stagedPaths,
} from '../src/lib/task-kind.js'
import { removeDirSync } from '../src/lib/fs-remove.js'

function git(cwd: string, args: string[], input?: string | Buffer): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

function gitTree(cwd: string, paths: readonly string[]): string {
  if (paths.length === 0) return git(cwd, ['mktree'], '')
  const blob = git(cwd, ['hash-object', '-w', '--stdin'], 'fixture')
  const sorted = [...paths].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
  const records = sorted.map((path) => `100644 blob ${blob}\t${path}\0`).join('')
  return git(cwd, ['mktree', '-z'], Buffer.from(records))
}

function gitCommit(cwd: string, paths: readonly string[], parent?: string): string {
  const tree = gitTree(cwd, paths)
  return git(cwd, ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', 'fixture'])
}

function gitFixtureRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'vhk-task-kind-'))
  git(cwd, ['init', '-q'])
  git(cwd, ['config', 'user.email', 'test@example.invalid'])
  git(cwd, ['config', 'user.name', 'VHK Test'])
  git(cwd, ['config', 'commit.gpgsign', 'false'])
  return cwd
}

// Goal 110-T3: 작업 유형은 에이전트 신고가 아니라 커밋 diff 경로에서 유도된다.
// 이 테스트가 지키는 계약 = "승인 경계를 우회할 수 있는 낙관 분류를 하지 않는다".

describe('classifyPath', () => {
  it('보안·집행 경계', () => {
    expect(classifyPath('.github/workflows/ci.yml')).toBe('security')
    expect(classifyPath('scripts/check-public-boundary.mjs')).toBe('security')
    expect(classifyPath('src/lib/exec.ts')).toBe('security')
    expect(classifyPath('.gitignore')).toBe('security')
    expect(classifyPath('certs/server.pem')).toBe('security')
  })

  it('기록 스키마', () => {
    expect(classifyPath('src/lib/autonomy-log.ts')).toBe('schema')
    expect(classifyPath('src/lib/receipt-ledger.ts')).toBe('schema')
    expect(classifyPath('db/migrations/001_init.sql')).toBe('schema')
    expect(classifyPath('prisma/schema.prisma')).toBe('schema')
  })

  it('의존성 — 매니페스트와 잠금 파일만', () => {
    expect(classifyPath('package.json')).toBe('deps')
    expect(classifyPath('pnpm-lock.yaml')).toBe('deps')
    expect(classifyPath('go.sum')).toBe('deps')
    expect(classifyPath('Cargo.toml')).toBe('deps')
  })

  it('잡무 — 테스트·빌드 스크립트·설정', () => {
    expect(classifyPath('tests/stats.test.ts')).toBe('chore')
    expect(classifyPath('src/lib/foo.test.ts')).toBe('chore')
    expect(classifyPath('scripts/build.mjs')).toBe('chore')
    expect(classifyPath('vitest.config.ts')).toBe('chore')
    expect(classifyPath('tsconfig.json')).toBe('chore')
  })

  it('문서 — docs/ 밖의 README 도 잡힌다', () => {
    expect(classifyPath('docs/adr/ADR-009.md')).toBe('docs')
    expect(classifyPath('README.md')).toBe('docs')
    expect(classifyPath('docs/assets/diagram.png')).toBe('docs')
  })

  it('나머지 소스', () => {
    expect(classifyPath('src/commands/stats.ts')).toBe('source')
    expect(classifyPath('app/page.tsx')).toBe('source')
    expect(classifyPath('main.py')).toBe('source')
  })

  it('어떤 규칙에도 안 걸리면 unknown — 안전한 유형으로 낙관 추정하지 않는다', () => {
    expect(classifyPath('assets/cover.png')).toBe('unknown')
    expect(classifyPath('')).toBe('unknown')
    expect(classifyPath('LICENSE')).toBe('unknown')
  })

  it('Windows 구분자와 ./ 접두사를 정규화', () => {
    expect(classifyPath('src\\lib\\autonomy-log.ts')).toBe('schema')
    expect(classifyPath('tests\\runner.ts')).toBe('chore')
    expect(classifyPath('./docs/README.md')).toBe('docs')
  })

  it('pathname의 선행·후행 공백을 지우지 않고 미분류로 닫는다', () => {
    expect(classifyPath(' package.json')).toBe('unknown')
    expect(classifyPath('README.md ')).toBe('unknown')
  })
})

describe('deriveTaskKind — 혼합이면 가장 위험한 쪽 (fail-closed)', () => {
  it('문서 + 스키마 → schema', () => {
    expect(deriveTaskKind(['README.md', 'src/lib/autonomy-log.ts'])).toBe('schema')
  })

  it('스키마 + 보안 → security', () => {
    expect(deriveTaskKind(['src/lib/autonomy-log.ts', '.github/workflows/ci.yml'])).toBe('security')
  })

  it('잡무만 → chore', () => {
    expect(deriveTaskKind(['tests/a.test.ts', 'tests/b.test.ts'])).toBe('chore')
  })

  it('소스 + 잡무 → source (테스트만 고쳤다고 낮춰 잡지 않는다)', () => {
    expect(deriveTaskKind(['tests/a.test.ts', 'src/commands/stats.ts'])).toBe('source')
  })

  it('빈 목록·전부 미분류 → unknown', () => {
    expect(deriveTaskKind([])).toBe('unknown')
    expect(deriveTaskKind(['assets/x.png'])).toBe('unknown')
  })

  it('미분류가 섞여도 분류된 것 중 최댓값을 쓴다', () => {
    expect(deriveTaskKind(['assets/x.png', 'README.md'])).toBe('docs')
  })

  it('Git pathname의 literal backslash를 디렉터리 구분자로 바꾸지 않는다', () => {
    const path = 'tests\\runner.ts'
    expect(deriveTaskKind([path])).toBe('source')
    expect(deriveTaskKindDetailed([path])).toEqual({ kind: 'source', total: 1, unclassified: 0 })
  })
})

describe('normalizeTaskKind — 닫힌집합 대조 (PAT-001)', () => {
  it('유효 값은 통과', () => {
    expect(normalizeTaskKind('security')).toBe('security')
    expect(normalizeTaskKind('  DOCS  ')).toBe('docs')
  })

  it('집합 밖·비문자열은 unknown', () => {
    expect(normalizeTaskKind('chore; rm -rf')).toBe('unknown')
    expect(normalizeTaskKind(undefined)).toBe('unknown')
    expect(normalizeTaskKind(null)).toBe('unknown')
    expect(normalizeTaskKind('')).toBe('unknown')
  })
})

describe('changedPathsBetweenDetailed — 성공한 빈 diff와 조회 실패 구분', () => {
  it('같은 커밋 범위는 성공한 빈 목록이다', () => {
    expect(changedPathsBetweenDetailed(process.cwd(), 'HEAD', 'HEAD')).toEqual({
      ok: true,
      paths: [],
    })
  })

  it('잘못된 커밋 범위는 유도 실패다', () => {
    expect(changedPathsBetweenDetailed(process.cwd(), 'not-a-real-sha', 'HEAD')).toEqual({
      ok: false,
      paths: [],
    })
  })

  it('NUL 경계로 pathname의 공백·개행·따옴표를 그대로 보존한다', () => {
    const cwd = gitFixtureRepo()
    try {
      const base = gitCommit(cwd, [])
      git(cwd, ['update-ref', 'HEAD', base])
      const paths = [' package.json', 'README.md ', 'line\nbreak.ts', 'quote"name.ts', 'tests\\runner.ts']
      const head = gitCommit(cwd, paths, base)

      expect(changedPathsBetweenDetailed(cwd, base, head)).toEqual({
        ok: true,
        paths: [...paths].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))),
      })
      expect(deriveTaskKindDetailed(paths)).toEqual({ kind: 'source', total: 5, unclassified: 2 })

      // Windows Git은 유효한 POSIX tree 이름이어도 후행 공백·개행 항목을 index에 거부한다.
      // staged 수집기는 전 플랫폼에서 가능한 선행 공백 fixture로 같은 NUL/no-trim 계약을 고정한다.
      const stagedHead = gitCommit(cwd, [' package.json'], base)
      git(cwd, ['read-tree', stagedHead])
      expect(stagedPaths(cwd)).toEqual([' package.json'])
    } finally {
      removeDirSync(cwd)
    }
  })

  it('rename의 따옴표·개행 pathname을 Git quoting 없이 반환한다', () => {
    const cwd = gitFixtureRepo()
    try {
      git(cwd, ['config', 'diff.renames', 'true'])
      const beforePath = 'old "name"\n.ts'
      const afterPath = 'new "name"\n.ts'
      const before = gitCommit(cwd, [beforePath])
      const after = gitCommit(cwd, [afterPath], before)

      expect(changedPathsBetweenDetailed(cwd, before, after)).toEqual({
        ok: true,
        paths: [afterPath],
      })
    } finally {
      removeDirSync(cwd)
    }
  })
})
