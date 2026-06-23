import { describe, it, expect, vi, beforeEach } from 'vitest'

// Goal 48: MCP↔CLI 단일 진실원. git-session 은 세션 git 동작(save/undo/status/diff +
// ship/recap/doctor)의 *유일한* git 인보케이션 SoT. CLI 명령과 MCP 핸들러가 동일 함수를
// 공유해 인라인 재구현(#150/#152/#161 드리프트 원천)을 제거한다.
//
// 이 테스트는 "같은 git 질문 = 함수 하나" 계약을 봉쇄한다: 각 함수가 정확한 git argv 로
// safeExecFile 을 호출하고, cwd 를 통과시키며, porcelain 은 raw 보존(trimOutput:false)함을 단언.

vi.mock('../src/lib/exec.js', () => ({
  safeExecFile: vi.fn(),
}))

import { safeExecFile } from '../src/lib/exec.js'
import * as session from '../src/lib/git-session.js'

const mockExec = vi.mocked(safeExecFile)

beforeEach(() => {
  mockExec.mockReset()
  mockExec.mockReturnValue({ ok: true, out: '' })
})

// 호출된 git argv(2번째 인자)만 추출 — opts(cwd/trim)는 별도 단언.
const lastArgv = () => mockExec.mock.calls.at(-1)?.[1]
const lastOpts = () => mockExec.mock.calls.at(-1)?.[2]
const lastBin = () => mockExec.mock.calls.at(-1)?.[0]

describe('git-session — git argv SoT (같은 질문 = 함수 하나)', () => {
  it('statusPorcelain → git status --porcelain (raw 보존)', () => {
    session.statusPorcelain('/repo')
    expect(lastBin()).toBe('git')
    expect(lastArgv()).toEqual(['status', '--porcelain'])
    // 선행 공백(" M file") 의미있음 → trimOutput:false 강제.
    expect(lastOpts()).toMatchObject({ cwd: '/repo', trimOutput: false })
  })

  it('currentBranch → git branch --show-current', () => {
    session.currentBranch('/repo')
    expect(lastArgv()).toEqual(['branch', '--show-current'])
    expect(lastOpts()).toMatchObject({ cwd: '/repo' })
  })

  it('recentCommits(n) → git log --oneline -n', () => {
    session.recentCommits(5, '/repo')
    expect(lastArgv()).toEqual(['log', '--oneline', '-5'])
  })

  it('stageAll → git add .', () => {
    session.stageAll('/repo')
    expect(lastArgv()).toEqual(['add', '.'])
  })

  it('commit(message) → git commit -m <message>', () => {
    session.commit('✨ msg', '/repo')
    expect(lastArgv()).toEqual(['commit', '-m', '✨ msg'])
  })

  it('push → git push', () => {
    session.push('/repo')
    expect(lastArgv()).toEqual(['push'])
  })

  it('softReset(n) → git reset --soft HEAD~n', () => {
    session.softReset(3, '/repo')
    expect(lastArgv()).toEqual(['reset', '--soft', 'HEAD~3'])
  })

  it('unstagedStat → git diff --stat', () => {
    session.unstagedStat('/repo')
    expect(lastArgv()).toEqual(['diff', '--stat'])
  })

  it('stagedStat → git diff --cached --stat', () => {
    session.stagedStat('/repo')
    expect(lastArgv()).toEqual(['diff', '--cached', '--stat'])
  })

  it('untrackedFiles → git ls-files --others --exclude-standard', () => {
    session.untrackedFiles('/repo')
    expect(lastArgv()).toEqual(['ls-files', '--others', '--exclude-standard'])
  })

  it('numstatHead → git diff --numstat HEAD', () => {
    session.numstatHead('/repo')
    expect(lastArgv()).toEqual(['diff', '--numstat', 'HEAD'])
  })

  it('diffUnified0 → git -c core.quotepath=false diff --unified=0 HEAD (raw 보존)', () => {
    session.diffUnified0('/repo')
    expect(lastBin()).toBe('git')
    // #319: core.quotepath=false 로 비ASCII(한글) 경로를 8진 이스케이프 없이 받는다.
    expect(lastArgv()).toEqual(['-c', 'core.quotepath=false', 'diff', '--unified=0', 'HEAD'])
    // 헌트 헤더(@@ -a,b +c,d @@) 라인번호 보존 위해 trimOutput:false.
    expect(lastOpts()).toMatchObject({ cwd: '/repo', trimOutput: false })
  })

  it('recapLog(n) → git log --format=%h %ad %s --date=short -n', () => {
    session.recapLog(10, '/repo')
    expect(lastArgv()).toEqual(['log', '--format=%h %ad %s', '--date=short', '-10'])
  })

  it('gitVersion → git --version', () => {
    session.gitVersion()
    expect(lastArgv()).toEqual(['--version'])
  })
})

describe('git-session — cwd 통과 + 기본값', () => {
  it('cwd 인자 미지정 시 process.cwd() 로 기본 (MCP 호출 파리티)', () => {
    session.statusPorcelain()
    expect(lastOpts()).toMatchObject({ cwd: process.cwd() })
  })

  it('명시 cwd 를 그대로 safeExecFile 에 전달 (CLI gitRoot 파리티)', () => {
    session.stageAll('/some/git/root')
    expect(lastOpts()).toMatchObject({ cwd: '/some/git/root' })
  })
})

describe('git-session — ExecResult 통과 + okOut swallow', () => {
  it('ExecResult 를 그대로 반환 (호출부가 .ok/.out/.err 검사)', () => {
    mockExec.mockReturnValue({ ok: false, err: 'boom', out: '', stderr: 'fatal' })
    const r = session.push('/repo')
    expect(r).toEqual({ ok: false, err: 'boom', out: '', stderr: 'fatal' })
  })

  it('okOut: ok 면 out, 실패면 빈 문자열 (diff 등 swallow 소비자용)', () => {
    expect(session.okOut({ ok: true, out: 'changes' })).toBe('changes')
    expect(session.okOut({ ok: false, err: 'no HEAD', out: '' })).toBe('')
  })
})
