import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// tsconfig include=src/** 라 tsc --noEmit(M.1)는 tests/ 미검사 → .mjs 직접 import 가 게이트를 깨지 않음(meta-gate.test.ts 선례).
import { isGitCommitCommand, evaluateRecords, localToday } from '../scripts/check-records.mjs'

const SCRIPT = path.join(process.cwd(), 'scripts', 'check-records.mjs')
const TODAY = '2026-06-10'

describe('isGitCommitCommand — git commit 명령 감지', () => {
  it('기본/rtk/체인/전역플래그 변형을 모두 감지', () => {
    expect(isGitCommitCommand('git commit -m "feat: x"')).toBe(true)
    expect(isGitCommitCommand('rtk git commit -m "x"')).toBe(true)
    expect(isGitCommitCommand('git add -A; git commit -m "x"')).toBe(true)
    expect(isGitCommitCommand('git add . && git commit -m "x"')).toBe(true)
    expect(isGitCommitCommand('git -C ../other commit -m "x"')).toBe(true)
    expect(isGitCommitCommand('git -c core.editor=true commit --amend')).toBe(true)
  })

  it('커밋 아닌 git/일반 명령은 비감지 (read-only 명령 오차단 방지)', () => {
    expect(isGitCommitCommand('git log --grep commit')).toBe(false)
    expect(isGitCommitCommand('git status')).toBe(false)
    expect(isGitCommitCommand('pnpm test:run')).toBe(false)
    expect(isGitCommitCommand('echo "git commit 하지마"')).toBe(false)
    expect(isGitCommitCommand('')).toBe(false)
  })
})

describe('evaluateRecords — 기록 집행 판정 (spec 4케이스)', () => {
  it('코드변경 + devlog 없음 → 차단', () => {
    const r = evaluateRecords({
      stagedFiles: ['src/commands/work.ts'],
      commandText: 'git commit -m "feat: x"',
      today: TODAY,
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('dev log')
  })

  it('코드변경 + 오늘자 devlog 스테이지 → 통과', () => {
    const r = evaluateRecords({
      stagedFiles: ['src/lib/git.ts', `docs/log/${TODAY}-governance.md`],
      commandText: 'git commit -m "feat: x"',
      today: TODAY,
    })
    expect(r.ok).toBe(true)
  })

  it('[skip-record] 토큰 → 통과 (의도된 우회)', () => {
    const r = evaluateRecords({
      stagedFiles: ['src/commands/work.ts'],
      commandText: 'git commit -m "chore: tiny [skip-record]"',
      today: TODAY,
    })
    expect(r.ok).toBe(true)
  })

  it('문서만 변경 → 통과 (코드변경 아님)', () => {
    const r = evaluateRecords({
      stagedFiles: ['docs/adr/ADR-0001-x.md', 'README.md', 'goals/README.md'],
      commandText: 'git commit -m "docs: x"',
      today: TODAY,
    })
    expect(r.ok).toBe(true)
  })

  it('어제자 devlog 만 스테이지 → 차단 (오늘 기록 아님)', () => {
    const r = evaluateRecords({
      stagedFiles: ['src/commands/work.ts', 'docs/log/2026-06-09-old.md'],
      commandText: 'git commit -m "feat: x"',
      today: TODAY,
    })
    expect(r.ok).toBe(false)
  })

  it('scripts/check-goal-*.mjs 변경도 코드변경으로 본다', () => {
    const r = evaluateRecords({
      stagedFiles: ['scripts/check-goal-62.mjs'],
      commandText: 'git commit -m "feat: gate"',
      today: TODAY,
    })
    expect(r.ok).toBe(false)
  })
})

describe('localToday — 로컬 날짜 형식', () => {
  it('YYYY-MM-DD 형식', () => {
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ─── e2e: 실제 git repo + hook stdin JSON ────────────────────────────────────
function makeRepo(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-records-'))
  execFileSync('git', ['init', '-q'], { cwd: d })
  execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: d })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: d })
  return d
}

function stage(repo: string, rel: string, content = 'x') {
  const fp = path.join(repo, rel)
  fs.mkdirSync(path.dirname(fp), { recursive: true })
  fs.writeFileSync(fp, content, 'utf-8')
  execFileSync('git', ['add', rel], { cwd: repo })
}

/** hook stdin JSON 으로 게이트 실행 → exit code. */
function runHook(repo: string, command: string): number {
  try {
    execFileSync('node', [SCRIPT], {
      cwd: repo,
      encoding: 'utf-8',
      stdio: 'pipe',
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    })
    return 0
  } catch (e) {
    return (e as { status?: number }).status ?? -1
  }
}

describe('check-records e2e — 실제 staged + hook stdin', () => {
  it('코드 스테이지 + devlog 없음 + git commit → exit 2 (차단)', () => {
    const repo = makeRepo()
    stage(repo, 'src/commands/foo.ts')
    expect(runHook(repo, 'git commit -m "feat: x"')).toBe(2)
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('코드 + 오늘 devlog 스테이지 → exit 0', () => {
    const repo = makeRepo()
    stage(repo, 'src/commands/foo.ts')
    stage(repo, `docs/log/${localToday()}-work.md`)
    expect(runHook(repo, 'git commit -m "feat: x"')).toBe(0)
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('커밋 아닌 명령(hook 경유) → exit 0 (조기 통과 — 모든 Bash 호출에 발동되므로)', () => {
    const repo = makeRepo()
    stage(repo, 'src/commands/foo.ts')
    expect(runHook(repo, 'pnpm test:run')).toBe(0)
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('[skip-record] 커밋 → exit 0', () => {
    const repo = makeRepo()
    stage(repo, 'src/lib/foo.ts')
    expect(runHook(repo, 'git commit -m "chore: x [skip-record]"')).toBe(0)
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('git add 체인이면 미스테이지 코드도 평가에 포함 (add 후 상태 선반영)', () => {
    const repo = makeRepo()
    // 코드 파일을 만들되 스테이지하지 않음 — `git add -A; git commit` 체인이면 잡혀야 함
    const fp = path.join(repo, 'src/commands/foo.ts')
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, 'x', 'utf-8')
    expect(runHook(repo, 'git add -A; git commit -m "feat: x"')).toBe(2)
    fs.rmSync(repo, { recursive: true, force: true })
  })
})
