import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// tsconfig include=src/** 라 tsc --noEmit(M.1)는 tests/ 미검사 → .mjs 직접 import 가 게이트를 깨지 않음(meta-gate.test.ts 선례).
import { isGitCommitCommand, findGitSubcommand, evaluateRecords, localToday } from '../scripts/check-records.mjs'

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

  it('PS 권장 체인·서브셸 래퍼도 감지 (리뷰 발견 — 우회 차단)', () => {
    expect(isGitCommitCommand('git add .; if ($?) { git commit -m "x" }')).toBe(true)
    expect(isGitCommitCommand('(git commit -m "x")')).toBe(true)
  })

  it('env 할당 접두·명령 래퍼·git.exe/풀경로도 감지 (적대검증 D1-1)', () => {
    expect(isGitCommitCommand('GIT_COMMITTER_DATE="2020-01-01" git commit -m x')).toBe(true)
    expect(isGitCommitCommand('command git commit -m x')).toBe(true)
    expect(isGitCommitCommand('env nohup git commit -m x')).toBe(true)
    expect(isGitCommitCommand('git.exe commit -m x')).toBe(true)
    expect(isGitCommitCommand('/usr/bin/git commit -m x')).toBe(true)
    expect(isGitCommitCommand('cmd /d /s /c git commit -m x')).toBe(true)
  })

  it('줄연속(백슬래시/백틱+개행)으로 쪼개진 명령도 감지 (적대검증 D1-3)', () => {
    expect(isGitCommitCommand('git \\\ncommit -m "x"')).toBe(true)
    expect(isGitCommitCommand('git `\r\ncommit -m "x"')).toBe(true)
  })

  it('findGitSubcommand — -C 경로 추출(공백 포함 따옴표 경로 포함, 적대검증 D1-2)', () => {
    expect(findGitSubcommand('git -C ../other commit -m "x"', 'commit')).toMatchObject({
      found: true,
      cPath: '../other',
    })
    expect(findGitSubcommand('git -C "C:/a b/repo" commit -m "x"', 'commit')).toMatchObject({
      found: true,
      cPath: 'C:/a b/repo',
    })
  })

  it('add 감지도 토크나이저 — 커밋 메시지 속 "add" 단어는 오매칭 안 함 (리뷰 발견)', () => {
    expect(findGitSubcommand('git commit -m "docs: add README"', 'add').found).toBe(false)
    expect(findGitSubcommand('git add -A; git commit -m "x"', 'add').found).toBe(true)
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

  it('scripts/check-*.mjs·src/mcp 변경도 코드변경으로 본다 (글롭 확대 — 리뷰 발견)', () => {
    expect(
      evaluateRecords({
        stagedFiles: ['scripts/check-goal-62.mjs'],
        commandText: 'git commit -m "feat: gate"',
        today: TODAY,
      }).ok
    ).toBe(false)
    expect(
      evaluateRecords({
        stagedFiles: ['src/mcp/server.ts'],
        commandText: 'git commit -m "feat: tool"',
        today: TODAY,
      }).ok
    ).toBe(false)
  })

  it('자정 넘긴 연속 세션 — 어제자 devlog 가 staged 면 통과 (실제 오늘 기준)', () => {
    const today = localToday()
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const p = (n: number) => String(n).padStart(2, '0')
    const yesterday = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    const r = evaluateRecords({
      stagedFiles: ['src/lib/git.ts', `docs/log/${yesterday}-governance.md`],
      commandText: 'git commit -m "feat: x"',
      today,
    })
    expect(r.ok).toBe(true)
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
    execFileSync('node', [SCRIPT, '--hook'], {
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

  it('메시지에 "add" 단어 + 더티 코드 워킹트리 + docs 만 staged → exit 0 (오매칭 제거)', () => {
    const repo = makeRepo()
    const dirty = path.join(repo, 'src/lib/dirty.ts')
    fs.mkdirSync(path.dirname(dirty), { recursive: true })
    fs.writeFileSync(dirty, 'x', 'utf-8') // 미스테이지 잔재
    stage(repo, 'docs/adr/ADR-009-x.md')
    expect(runHook(repo, 'git commit -m "docs: add usage section"')).toBe(0)
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('pathspec add 체인은 그 범위만 합산 — 무관 더티 코드로 오차단 안 함 (적대검증 D1-4)', () => {
    const repo = makeRepo()
    const dirty = path.join(repo, 'src/lib/dirty.ts')
    fs.mkdirSync(path.dirname(dirty), { recursive: true })
    fs.writeFileSync(dirty, 'x', 'utf-8') // 미스테이지 잔재 — add 대상 아님
    const doc = path.join(repo, 'docs/adr/ADR-009-x.md')
    fs.mkdirSync(path.dirname(doc), { recursive: true })
    fs.writeFileSync(doc, 'x', 'utf-8')
    expect(runHook(repo, 'git add docs/adr/ADR-009-x.md; git commit -m "docs: x"')).toBe(0)
    // 같은 상태에서 광역 add 는 여전히 차단 (헛통과 방지 유지)
    expect(runHook(repo, 'git add -A; git commit -m "docs: x"')).toBe(2)
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('한글 devlog 파일명도 인식 (core.quotepath 이스케이프 — 리뷰 발견)', () => {
    const repo = makeRepo()
    stage(repo, 'src/commands/foo.ts')
    stage(repo, `docs/log/${localToday()}-거버넌스.md`)
    expect(runHook(repo, 'git commit -m "feat: x"')).toBe(0)
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('손상된 hook 페이로드 → fail-open exit 0 (전 명령 차단 방지 — 리뷰 발견)', () => {
    const repo = makeRepo()
    stage(repo, 'src/commands/foo.ts')
    let status = 0
    try {
      execFileSync('node', [SCRIPT, '--hook'], { cwd: repo, encoding: 'utf-8', stdio: 'pipe', input: '{broken json' })
    } catch (e) {
      status = (e as { status?: number }).status ?? -1
    }
    expect(status).toBe(0)
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('git -C <다른 레포> commit — 대상 레포 기준으로 평가 (리뷰 발견)', () => {
    const repoA = makeRepo()
    const repoB = makeRepo()
    stage(repoB, 'src/commands/foo.ts') // B 에 코드 staged, devlog 없음
    const bPath = repoB.replace(/\\/g, '/')
    expect(runHook(repoA, `git -C ${bPath} commit -m "feat: x"`)).toBe(2)
    fs.rmSync(repoA, { recursive: true, force: true })
    fs.rmSync(repoB, { recursive: true, force: true })
  })

  it('HARD_STOP 활성 → 커밋 차단 exit 2 (.vhk/README 보장 이행)', () => {
    const repo = makeRepo()
    stage(repo, 'docs/x.md') // 코드변경 없어도 HARD_STOP 이면 차단
    fs.mkdirSync(path.join(repo, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(repo, '.vhk/HARD_STOP'), '')
    expect(runHook(repo, 'git commit -m "docs: x"')).toBe(2)
    fs.rmSync(repo, { recursive: true, force: true })
  })
})
