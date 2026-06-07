import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { callTool } from './helpers/mcp-introspect.js'

// Goal 41: MCP surface HARD_STOP 가드. CLI guardCli 를 우회해 상태를 *재구현*하는
// MCP 전용 핸들러(save/undo/env)가 HARD_STOP 활성 시 차단되는지 회귀 검증.
// 실제 fs 사용(node:fs mock 안 함) — isHardStopActive 가 cwd 의 .vhk/HARD_STOP 를 읽음.

function tmpProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vhk-mcphs-'))
  mkdirSync(join(dir, '.vhk'), { recursive: true })
  return dir
}
function writeHardStop(dir: string): void {
  writeFileSync(join(dir, '.vhk', 'HARD_STOP'), '2026-06-07T00:00:00Z\nauto: test\n', 'utf-8')
}
const text = (r: { content: Array<{ text: string }> }) => r.content.map((c) => c.text).join('\n')

describe('MCP surface HARD_STOP 가드 (Goal 41)', () => {
  let origCwd: string
  let dir: string
  beforeEach(() => {
    origCwd = process.cwd()
    dir = tmpProject()
  })
  afterEach(() => {
    process.chdir(origCwd)
    rmSync(dir, { recursive: true, force: true })
  })

  it('env — HARD_STOP 활성 시 .env.example 미생성 + 안내 반환', async () => {
    // 실제 .env 가 있어야 가드 없을 때 쓰기 경로 도달 → 차별적.
    writeFileSync(join(dir, '.env'), 'FOO=bar\n', 'utf-8')
    writeHardStop(dir)
    process.chdir(dir)
    const r = await callTool('env')
    expect(text(r)).toContain('HARD STOP')
    expect(existsSync(join(dir, '.env.example'))).toBe(false)
  })

  it('env — HARD_STOP 없으면 .env.example 생성 (회귀 0)', async () => {
    writeFileSync(join(dir, '.env'), 'FOO=bar\n', 'utf-8')
    process.chdir(dir)
    const r = await callTool('env')
    expect(text(r)).not.toContain('HARD STOP')
    expect(existsSync(join(dir, '.env.example'))).toBe(true)
  })

  it('save — HARD_STOP 활성 시 commit 전 차단(안내 반환)', async () => {
    writeHardStop(dir)
    process.chdir(dir)
    // 가드가 함수 첫 줄(isGitRepo·commit 전) → git repo 없이도 안내만 반환.
    const r = await callTool('save', { message: 'x' })
    expect(text(r)).toContain('HARD STOP')
  })

  it('undo — HARD_STOP 활성 시 reset 전 차단(confirm:true 여도)', async () => {
    writeHardStop(dir)
    process.chdir(dir)
    const r = await callTool('undo', { confirm: true })
    expect(text(r)).toContain('HARD STOP')
  })
})
