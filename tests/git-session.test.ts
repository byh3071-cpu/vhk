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

// commitPaths — 명시 경로만 stage·commit 하는 저소음 커밋(멀티PC dirty-block B축).
// stageAll(git add .) 금지 — 의도치 않은 파일 휩쓸기 방지. 변경 없으면 commit skip(잡음 0).
describe('git-session — commitPaths (명시 경로 저소음 커밋)', () => {
  const PATHS = ['.vhk/events/ai-actions.jsonl', '.vhk/ledger.jsonl']

  it('명시 경로만 stage (git add -- ...paths, "." 금지)', () => {
    // add ok → diff --cached --quiet 변경 있음(ok:false) → commit
    mockExec
      .mockReturnValueOnce({ ok: true, out: '' }) // add
      .mockReturnValueOnce({ ok: false, err: '', out: '' }) // diff --cached --quiet → 변경 있음
      .mockReturnValueOnce({ ok: true, out: '' }) // commit
    session.commitPaths('msg', PATHS, '/repo')
    expect(mockExec.mock.calls[0][1]).toEqual(['add', '--', ...PATHS])
    expect(mockExec.mock.calls[0][1]).not.toContain('.')
  })

  it('staged 변경 없으면 commit skip (diff --cached --quiet ok → 잡음 0)', () => {
    mockExec
      .mockReturnValueOnce({ ok: true, out: '' }) // add
      .mockReturnValueOnce({ ok: true, out: '' }) // diff --cached --quiet ok=변경 없음
    const r = session.commitPaths('msg', PATHS, '/repo')
    // commit 은 호출되지 않음 (add + diff 만 = 2회).
    expect(mockExec).toHaveBeenCalledTimes(2)
    expect(mockExec.mock.calls.some((c) => c[1][0] === 'commit')).toBe(false)
    expect(r.ok).toBe(true) // 변경 없음도 정상(비치명).
  })

  it('staged 변경 있으면 명시 경로로 commit (git commit -m <msg> -- ...paths)', () => {
    mockExec
      .mockReturnValueOnce({ ok: true, out: '' }) // add
      .mockReturnValueOnce({ ok: false, err: '', out: '' }) // diff --cached --quiet → 변경 있음
      .mockReturnValueOnce({ ok: true, out: '' }) // commit
    session.commitPaths('chore: ledger', PATHS, '/repo')
    const commitCall = mockExec.mock.calls.find((c) => c[1][0] === 'commit')
    expect(commitCall?.[1]).toEqual(['commit', '-m', 'chore: ledger', '--', ...PATHS])
  })

  it('add 실패 시 즉시 반환 (diff/commit 호출 안 함, 비치명)', () => {
    mockExec.mockReturnValueOnce({ ok: false, err: 'add boom', out: '' }) // add 실패
    const r = session.commitPaths('msg', PATHS, '/repo')
    expect(mockExec).toHaveBeenCalledTimes(1) // add 만.
    expect(r.ok).toBe(false)
  })

  it('cwd 를 모든 git 호출에 통과', () => {
    mockExec
      .mockReturnValueOnce({ ok: true, out: '' })
      .mockReturnValueOnce({ ok: false, err: '', out: '' })
      .mockReturnValueOnce({ ok: true, out: '' })
    session.commitPaths('msg', PATHS, '/some/root')
    for (const call of mockExec.mock.calls) {
      expect(call[2]).toMatchObject({ cwd: '/some/root' })
    }
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
