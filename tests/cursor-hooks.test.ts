// RFC 0057 §7 — 트리거 계층 에이전트 불가지론화(Cursor 슬라이스).
// customization 인터뷰 넛지를 Claude Code 외 Cursor 에서도 자동 발동시킨다.
// 설계: 배출 스크립트는 인터뷰 페이로드 SoT 1개 + `--format` 으로 출력 직렬화만 분기
//       (claude 기본=하위호환 / cursor=additional_context). 배선 파일만 도구별.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { CUSTOMIZATION_HOOK_TEMPLATE } from '../src/templates/customization-hook.js'
import { ensureCursorSessionStartHook, CURSOR_HOOK_COMMAND } from '../src/lib/cursor-hooks.js'

describe('CUSTOMIZATION_HOOK_TEMPLATE — --format 분기 (실행 실측)', () => {
  let dir: string
  let script: string

  function run(needs: boolean, done: boolean, ...args: string[]) {
    fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
    if (needs) fs.writeFileSync(path.join(dir, '.vhk', 'NEEDS_CUSTOMIZATION'), '')
    if (done) fs.writeFileSync(path.join(dir, '.vhk', 'customization-done'), '')
    return spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf-8' })
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-cust-hook-'))
    script = path.join(dir, 'customization-check.mjs')
    fs.writeFileSync(script, CUSTOMIZATION_HOOK_TEMPLATE())
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('플래그 없음(기본) = Claude 포맷 hookSpecificOutput (하위호환)', () => {
    const r = run(true, false)
    const out = JSON.parse(r.stdout)
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart')
    expect(out.hookSpecificOutput.additionalContext).toContain('도메인 커스터마이징')
  })

  it('--format cursor = Cursor 포맷 additional_context', () => {
    const r = run(true, false, '--format', 'cursor')
    const out = JSON.parse(r.stdout)
    expect(typeof out.additional_context).toBe('string')
    expect(out.additional_context).toContain('도메인 커스터마이징')
    expect(out.hookSpecificOutput).toBeUndefined()
  })

  it('두 포맷의 인터뷰 페이로드 본문은 동일(SoT 1개)', () => {
    const claude = JSON.parse(run(true, false).stdout).hookSpecificOutput.additionalContext
    // 새 dir 로 cursor 실행(같은 조건)
    const r = spawnSync(process.execPath, [script, '--format', 'cursor'], { cwd: dir, encoding: 'utf-8' })
    const cursor = JSON.parse(r.stdout).additional_context
    expect(cursor).toBe(claude)
  })

  it('customization-done 있으면 어느 포맷이든 무출력(재넛지 없음)', () => {
    expect(run(true, true, '--format', 'cursor').stdout.trim()).toBe('')
    const r2 = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf-8' })
    expect(r2.stdout.trim()).toBe('')
  })

  it('NEEDS_CUSTOMIZATION 없으면 무출력', () => {
    expect(run(false, false, '--format', 'cursor').stdout.trim()).toBe('')
  })
})

describe('ensureCursorSessionStartHook (.cursor/hooks.json 병합)', () => {
  let dir: string
  const hookPath = () => path.join(dir, '.cursor', 'hooks.json')
  const read = () => JSON.parse(fs.readFileSync(hookPath(), 'utf-8'))

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-cursor-hooks-'))
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('없으면 생성 — version 1 + sessionStart 에 vhk 커맨드', () => {
    expect(ensureCursorSessionStartHook(dir)).toBe('created')
    const j = read()
    expect(j.version).toBe(1)
    expect(j.hooks.sessionStart[0].command).toBe(CURSOR_HOOK_COMMAND)
  })

  it('기존 다른 훅은 보존하며 sessionStart 병합', () => {
    fs.mkdirSync(path.join(dir, '.cursor'), { recursive: true })
    fs.writeFileSync(
      hookPath(),
      JSON.stringify({ version: 1, hooks: { stop: [{ command: 'my-stop.sh' }] } })
    )
    expect(ensureCursorSessionStartHook(dir)).toBe('merged')
    const j = read()
    expect(j.hooks.stop[0].command).toBe('my-stop.sh') // 보존
    expect(j.hooks.sessionStart[0].command).toBe(CURSOR_HOOK_COMMAND)
  })

  it('사용자 자신의 sessionStart 훅은 불가침 — 우리 것만 append', () => {
    fs.mkdirSync(path.join(dir, '.cursor'), { recursive: true })
    fs.writeFileSync(
      hookPath(),
      JSON.stringify({ version: 1, hooks: { sessionStart: [{ command: 'user-own.sh' }] } })
    )
    expect(ensureCursorSessionStartHook(dir)).toBe('merged')
    const cmds = read().hooks.sessionStart.map((h: { command: string }) => h.command)
    expect(cmds).toContain('user-own.sh')
    expect(cmds).toContain(CURSOR_HOOK_COMMAND)
  })

  it('이미 우리 커맨드 있으면 idempotent — unchanged', () => {
    ensureCursorSessionStartHook(dir)
    expect(ensureCursorSessionStartHook(dir)).toBe('unchanged')
    expect(read().hooks.sessionStart).toHaveLength(1) // 중복 안 됨
  })

  it('손상된 JSON 이면 skip — 파일 보존(fail-soft)', () => {
    fs.mkdirSync(path.join(dir, '.cursor'), { recursive: true })
    fs.writeFileSync(hookPath(), '{ this is not json')
    expect(ensureCursorSessionStartHook(dir)).toBe('skipped')
    expect(fs.readFileSync(hookPath(), 'utf-8')).toBe('{ this is not json')
  })
})
