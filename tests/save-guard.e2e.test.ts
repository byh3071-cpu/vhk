import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { removeDirSync } from '../src/lib/fs-remove.js'

// #611/ADR-021 — save 가드의 **실배선** 회귀 테스트.
// 단위 테스트(resolveGuard·save({noPush}))만으로는 commander 옵션 환원(--no-push → opts.push===false),
// guardSave 의 exit code, NL 차단 exit 이 검증되지 않아 배선을 통째로 되돌려도 green 이었다(critic P2-2).
// 여기서는 빌드된 CLI 를 실 temp git repo(+file 경로 bare 원격)에서 spawn 해 계약을 잠근다.

const bin = path.join(process.cwd(), 'dist', 'index.js')
const tempDirs: string[] = []

interface Repo {
  dir: string
  bare: string
}

function makeRepo(): Repo {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-save-guard-'))
  tempDirs.push(root)
  const bare = path.join(root, 'bare.git')
  const dir = path.join(root, 'repo')
  fs.mkdirSync(dir, { recursive: true })
  const git = (args: string[], cwd = dir) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf-8' })
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
    return r.stdout
  }
  git(['init', '--bare', bare], root)
  git(['init', '-b', 'main'])
  git(['config', 'user.email', 'sample@example.invalid'])
  git(['config', 'user.name', 'sample'])
  fs.writeFileSync(path.join(dir, 'f.txt'), 'hello\n')
  git(['add', '-A'])
  git(['commit', '-m', 'init'])
  git(['remote', 'add', 'origin', bare])
  git(['push', '-u', 'origin', 'main'])
  return { dir, bare }
}

function headOf(cwd: string, ref = 'HEAD'): string {
  return spawnSync('git', ['rev-parse', ref], { cwd, encoding: 'utf-8' }).stdout.trim()
}

function bareHead(bare: string): string {
  return spawnSync('git', ['rev-parse', 'main'], { cwd: bare, encoding: 'utf-8' }).stdout.trim()
}

function runCli(dir: string, args: string[], extraEnv: Record<string, string> = {}) {
  const env = { ...process.env, CI: '1' }
  delete env.VHK_FORCE_INTERACTIVE // 기본 케이스는 탈출구 없는 순수 비-TTY — 켠 채 검증하는 케이스는 extraEnv 로 명시
  Object.assign(env, extraEnv)
  const r = spawnSync(process.execPath, [bin, ...args], { cwd: dir, encoding: 'utf-8', env })
  return { ...r, output: String(r.stdout ?? '') + String(r.stderr ?? '') }
}

function touch(dir: string) {
  fs.appendFileSync(path.join(dir, 'f.txt'), 'change\n')
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) removeDirSync(dir)
  }
})

describe('save 가드 실배선 (#611/ADR-021 e2e)', () => {
  it('비-TTY 미승인 save → 차단 + exit 1 + 커밋/푸시 0', () => {
    const { dir, bare } = makeRepo()
    const before = headOf(dir)
    touch(dir)
    const r = runCli(dir, ['save'])
    expect(r.status, r.output).toBe(1)
    expect(r.output).toContain('실행하지 않았습니다')
    expect(headOf(dir)).toBe(before)
    expect(bareHead(bare)).toBe(before)
  })

  it('--no-push 만으로 승인 인정(반출 0) → 커밋 생성, push 없음', () => {
    const { dir, bare } = makeRepo()
    const before = headOf(dir)
    touch(dir)
    const r = runCli(dir, ['save', '--no-push', '-m', 'test: no-push'])
    expect(r.status, r.output).toBe(0)
    expect(headOf(dir)).not.toBe(before) // commander --no-push → opts.push===false 환원 검증
    expect(bareHead(bare)).toBe(before)
  })

  it('--yes -m → 커밋 + 원격 push 실행 (승인 경로 회귀 가드)', () => {
    const { dir, bare } = makeRepo()
    const before = headOf(dir)
    touch(dir)
    const r = runCli(dir, ['save', '--yes', '-m', 'test: approved push'])
    expect(r.status, r.output).toBe(0)
    const after = headOf(dir)
    expect(after).not.toBe(before)
    expect(bareHead(bare)).toBe(after)
  })

  it('자연어 "저장해줘" 비-TTY → 미리보기 + exit 1 + 커밋 0 (감사 P0 시나리오)', () => {
    const { dir, bare } = makeRepo()
    const before = headOf(dir)
    touch(dir)
    const r = runCli(dir, ['저장해줘'])
    expect(r.status, r.output).toBe(1)
    expect(r.output).toContain('미리보기')
    expect(headOf(dir)).toBe(before)
    expect(bareHead(bare)).toBe(before)
  })

  it('VHK_FORCE_INTERACTIVE=1 켠 채 비-TTY save -m → 환경변수가 승인을 대신 못 함 (P1-NEW)', () => {
    const { dir, bare } = makeRepo()
    const before = headOf(dir)
    touch(dir)
    const r = runCli(dir, ['save', '-m', 'test: env bypass'], { VHK_FORCE_INTERACTIVE: '1' })
    expect(r.status, r.output).toBe(1)
    expect(headOf(dir)).toBe(before)
    expect(bareHead(bare)).toBe(before)
  })

  it('strict 모드 + 미승인 비-TTY → 차단 + exit 1 (y/N 계약 잠금, P2-d)', () => {
    const { dir, bare } = makeRepo()
    fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.vhk', 'config.json'), JSON.stringify({ safetyMode: 'strict' }))
    const before = headOf(dir)
    touch(dir)
    const r = runCli(dir, ['save', '-m', 'test: strict unapproved'])
    expect(r.status, r.output).toBe(1)
    expect(headOf(dir)).toBe(before)
    expect(bareHead(bare)).toBe(before)
  })

  it('strict 모드 + --yes → guardCli 경로에서도 실행·push (반환값 배선 회귀 가드)', () => {
    const { dir, bare } = makeRepo()
    fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.vhk', 'config.json'), JSON.stringify({ safetyMode: 'strict' }))
    const before = headOf(dir)
    touch(dir)
    const r = runCli(dir, ['save', '--yes', '-m', 'test: strict approved'])
    expect(r.status, r.output).toBe(0)
    const after = headOf(dir)
    expect(after).not.toBe(before)
    expect(bareHead(bare)).toBe(after)
  })
})
