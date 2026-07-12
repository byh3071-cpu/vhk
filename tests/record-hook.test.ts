// RFC 0061 T1 — 기록 집행 커밋훅 이식.
// 배출 스크립트(.vhk/hooks/record-check.mjs)와 .git/hooks/commit-msg 배선을 검증한다.
// 통합 테스트는 실제 git 저장소 픽스처에서 배출 스크립트를 직접 실행해
// "차단/통과"를 종료코드로 실측한다 — 템플릿 문자열 존재검사만으로는 거짓완료 위험.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  RECORD_CHECK_TEMPLATE,
  COMMIT_MSG_HOOK_TEMPLATE,
  RECORD_HOOK_MARKER,
} from '../src/templates/record-hook.js'
import { installRecordCommitMsgHook } from '../src/lib/record-hook.js'

function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

describe('RECORD_CHECK_TEMPLATE (배출 스크립트 내용)', () => {
  const content = RECORD_CHECK_TEMPLATE()

  it('CRLF 없이 LF 만 쓴다 — 셔뱅+CRLF Windows 전멸 교훈(governance-v2)', () => {
    expect(content).not.toContain('\r')
  })

  it('[skip-record] 우회 토큰과 docs/log 글롭을 포함한다', () => {
    expect(content).toContain('[skip-record]')
    expect(content).toContain('docs/log/')
  })

  it('한글 경로 보호(core.quotepath=false)를 포함한다 — false block 교훈', () => {
    expect(content).toContain('core.quotepath=false')
  })

  it('fail-open 처리를 포함한다 — 게이트 자체 결함이 작업을 막지 않게', () => {
    expect(content).toContain('process.exit(0)')
  })
})

describe('COMMIT_MSG_HOOK_TEMPLATE (.git/hooks/commit-msg shim)', () => {
  const content = COMMIT_MSG_HOOK_TEMPLATE()

  it('sh 셔뱅으로 시작하고 LF 만 쓴다', () => {
    expect(content.startsWith('#!/bin/sh')).toBe(true)
    expect(content).not.toContain('\r')
  })

  it('vhk 관리 마커를 포함한다 — 재실행 시 자기 훅만 갱신하기 위한 식별자', () => {
    expect(content).toContain(RECORD_HOOK_MARKER)
  })

  it('커밋 메시지 파일($1)을 record-check 에 전달한다', () => {
    expect(content).toContain('.vhk/hooks/record-check.mjs')
    expect(content).toContain('"$1"')
  })
})

describe('installRecordCommitMsgHook (배선)', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-record-hook-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('.git 이 없으면 no-git — 아무것도 쓰지 않는다', () => {
    expect(installRecordCommitMsgHook(dir)).toBe('no-git')
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(false)
  })

  it('.git 있으면 installed — 마커 포함 LF 훅이 생긴다', () => {
    fs.mkdirSync(path.join(dir, '.git', 'hooks'), { recursive: true })
    expect(installRecordCommitMsgHook(dir)).toBe('installed')
    const hook = fs.readFileSync(path.join(dir, '.git', 'hooks', 'commit-msg'), 'utf-8')
    expect(hook).toContain(RECORD_HOOK_MARKER)
    expect(hook).not.toContain('\r')
  })

  it('기존 비-vhk commit-msg 훅은 불가침 — respected-existing, 내용 보존', () => {
    const hookPath = path.join(dir, '.git', 'hooks', 'commit-msg')
    fs.mkdirSync(path.dirname(hookPath), { recursive: true })
    fs.writeFileSync(hookPath, '#!/bin/sh\necho user-own-hook\n')
    expect(installRecordCommitMsgHook(dir)).toBe('respected-existing')
    expect(fs.readFileSync(hookPath, 'utf-8')).toContain('user-own-hook')
  })

  it('vhk 마커 있는 기존 훅은 갱신 — updated', () => {
    const hookPath = path.join(dir, '.git', 'hooks', 'commit-msg')
    fs.mkdirSync(path.dirname(hookPath), { recursive: true })
    fs.writeFileSync(hookPath, `#!/bin/sh\n# ${RECORD_HOOK_MARKER} (old)\nexit 0\n`)
    expect(installRecordCommitMsgHook(dir)).toBe('updated')
    expect(fs.readFileSync(hookPath, 'utf-8')).toContain('.vhk/hooks/record-check.mjs')
  })

  it('core.hooksPath 설정(husky 등)이면 hooks-path-set — .git/hooks 에 쓰지 않는다(거짓 배선 방지)', () => {
    execFileSync('git', ['init', '-q'], { cwd: dir })
    execFileSync('git', ['config', 'core.hooksPath', '.husky/_'], { cwd: dir })
    expect(installRecordCommitMsgHook(dir)).toBe('hooks-path-set')
    expect(fs.existsSync(path.join(dir, '.git', 'hooks', 'commit-msg'))).toBe(false)
  })
})

describe('record-check.mjs 실행 통합 (실제 git 픽스처)', () => {
  let repo: string
  let script: string
  let msgFile: string

  function git(...args: string[]) {
    execFileSync('git', args, { cwd: repo, stdio: 'pipe' })
  }

  function runCheck(message: string): number {
    fs.writeFileSync(msgFile, message)
    const r = spawnSync(process.execPath, [script, msgFile], { cwd: repo, encoding: 'utf-8' })
    return r.status ?? -1
  }

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-record-int-'))
    git('init', '-q')
    git('config', 'user.email', 't@t.t')
    git('config', 'user.name', 't')
    fs.mkdirSync(path.join(repo, '.vhk', 'hooks'), { recursive: true })
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true })
    fs.mkdirSync(path.join(repo, 'docs', 'log'), { recursive: true })
    script = path.join(repo, '.vhk', 'hooks', 'record-check.mjs')
    fs.writeFileSync(script, RECORD_CHECK_TEMPLATE())
    msgFile = path.join(repo, '.git', 'COMMIT_EDITMSG')
  })
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('src 변경 스테이지 + 세션일지 없음 → 차단(비0)', () => {
    fs.writeFileSync(path.join(repo, 'src', 'a.ts'), 'export const a = 1\n')
    git('add', 'src/a.ts')
    expect(runCheck('feat: something')).not.toBe(0)
  })

  it('[skip-record] 메시지면 통과', () => {
    fs.writeFileSync(path.join(repo, 'src', 'a.ts'), 'export const a = 1\n')
    git('add', 'src/a.ts')
    expect(runCheck('chore: tiny [skip-record]')).toBe(0)
  })

  it('오늘자 세션일지가 같이 스테이지되면 통과', () => {
    fs.writeFileSync(path.join(repo, 'src', 'a.ts'), 'export const a = 1\n')
    fs.writeFileSync(path.join(repo, 'docs', 'log', `${today()}-work.md`), '# log\n')
    git('add', 'src/a.ts', `docs/log/${today()}-work.md`)
    expect(runCheck('feat: with log')).toBe(0)
  })

  it('문서만 스테이지면 통과 — 과안정화 경계', () => {
    fs.mkdirSync(path.join(repo, 'docs', 'adr'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'docs', 'adr', 'x.md'), '# adr\n')
    git('add', 'docs/adr/x.md')
    expect(runCheck('docs: adr only')).toBe(0)
  })

  it('HARD_STOP 활성이면 차단', () => {
    fs.writeFileSync(path.join(repo, '.vhk', 'HARD_STOP'), '')
    fs.writeFileSync(path.join(repo, 'src', 'a.ts'), 'export const a = 1\n')
    git('add', 'src/a.ts')
    expect(runCheck('feat: during hard stop [skip-record]')).not.toBe(0)
  })

  it('merge 진행 상태(MERGE_HEAD)면 통과 — 병합은 새 세션일지가 없는 게 정상(critic #1)', () => {
    // base 커밋 → feat 브랜치에서 src 변경 커밋 → main 에서 --no-commit merge 로 MERGE_HEAD 상태 재현.
    fs.writeFileSync(path.join(repo, 'README.md'), '# base\n')
    git('add', 'README.md')
    git('commit', '-q', '-m', 'base')
    git('checkout', '-q', '-b', 'feat')
    fs.writeFileSync(path.join(repo, 'src', 'a.ts'), 'export const a = 1\n')
    git('add', 'src/a.ts')
    git('commit', '-q', '-m', 'feat: src change')
    git('checkout', '-q', '-')
    git('merge', '--no-commit', '--no-ff', 'feat')
    expect(runCheck("Merge branch 'feat'")).toBe(0)
  })

  it('오늘 일지가 이미 HEAD 커밋에 있으면 후속/amend 스테이지도 통과(critic #2)', () => {
    fs.writeFileSync(path.join(repo, 'src', 'a.ts'), 'export const a = 1\n')
    fs.writeFileSync(path.join(repo, 'docs', 'log', `${today()}-work.md`), '# log\n')
    git('add', 'src/a.ts', `docs/log/${today()}-work.md`)
    git('commit', '-q', '-m', 'feat: with log')
    fs.writeFileSync(path.join(repo, 'src', 'b.ts'), 'export const b = 2\n')
    git('add', 'src/b.ts')
    expect(runCheck('feat: follow-up or amend')).toBe(0)
  })

  it('차단 사유는 AI 작업지시서 형태(stderr) — 일지 작성·재커밋 지시 포함', () => {
    fs.writeFileSync(path.join(repo, 'src', 'a.ts'), 'export const a = 1\n')
    git('add', 'src/a.ts')
    fs.writeFileSync(msgFile, 'feat: x')
    const r = spawnSync(process.execPath, [script, msgFile], { cwd: repo, encoding: 'utf-8' })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('docs/log/')
    expect(r.stderr).toContain('[skip-record]')
  })
})
