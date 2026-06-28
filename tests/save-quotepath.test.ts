import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { statusPorcelain } from '../src/lib/git-session.js'
import { parsePorcelainLines } from '../src/lib/git-porcelain.js'
import { formatChangeSummaryMessage } from '../src/commands/save.js'

// #286 회귀: 한글(비ASCII) 파일명이 변경요약 커밋 메시지에 git 8진 이스케이프(`\355...`)로
// 깨져 박히지 않는지 실 git repo 로 고정한다. 원인은 statusPorcelain 이 core.quotepath=false
// 없이 호출되어 git 기본(quotepath=true)이 비ASCII 경로를 따옴표+8진으로 출력하던 것(#319 계열).
//
// 정리(rmSync) 안 함: Windows 에서 .git objects 핸들 점유 중 rmSync(recursive) 가 try/catch 를
// 우회해 vitest worker 를 통째로 죽인다(TS-004 — "Worker exited unexpectedly"). temp 디렉터리는
// os.tmpdir() 에 남겨 OS/CI(ephemeral) 가 회수하게 둔다. chdir 도 미사용(cwd 명시 전달).
describe('#286 한글 경로 커밋 메시지 (core.quotepath)', () => {
  function newRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'vhk-qp-'))
    const opt = { cwd: dir, stdio: 'pipe' as const }
    execFileSync('git', ['init'], opt)
    execFileSync('git', ['config', 'user.email', 't@t.dev'], opt)
    execFileSync('git', ['config', 'user.name', 'tester'], opt)
    // 저장소 설정이 fix 를 가리지 않게 git 기본(quotepath=true) 을 명시 — 그래도 statusPorcelain
    // 의 `-c core.quotepath=false`(명령 레벨)가 이를 덮어 raw 경로를 내야 한다.
    execFileSync('git', ['config', 'core.quotepath', 'true'], opt)
    return dir
  }

  it('한글 파일명이 8진 이스케이프 없이 raw 경로로 메시지에 들어감', () => {
    const dir = newRepo()
    writeFileSync(join(dir, '한글파일.ts'), 'x\n', 'utf-8')

    const res = statusPorcelain(dir)
    expect(res.ok).toBe(true)
    const msg = formatChangeSummaryMessage(parsePorcelainLines(res.out))

    expect(msg).toContain('한글파일.ts') // raw UTF-8 경로
    expect(msg).not.toMatch(/\\\d{3}/) // 8진 이스케이프(\355 등) 없음
    expect(msg).not.toContain('"') // quotepath 따옴표 래핑 없음
  })

  it('한글 단일 파일 — fallback 고정문자열로 회귀하지 않고 경로 반영', () => {
    const dir = newRepo()
    writeFileSync(join(dir, '메모.txt'), 'y\n', 'utf-8')

    const msg = formatChangeSummaryMessage(parsePorcelainLines(statusPorcelain(dir).out))
    expect(msg).toBe('chore: vhk save — 메모.txt')
  })
})
