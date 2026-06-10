import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { saveBackup } from '../src/lib/backup.js'
import { restore } from '../src/commands/restore.js'

// Goal 52: restore 커맨드 셸 테스트(backup 헬퍼는 backup.test.ts 에 이미 있음 — 여기선 명령 경로만).
// 명령은 process.cwd() 기준 → tmpdir 로 chdir. id 인자 주면 TTY 가드/prompt 우회.

let dir: string
let origCwd: string
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-restore-'))
  origCwd = process.cwd()
  process.chdir(dir)
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  process.exitCode = 0
})

afterEach(() => {
  process.chdir(origCwd)
  logSpy.mockRestore()
  process.exitCode = 0
  fs.rmSync(dir, { recursive: true, force: true })
})

function write(rel: string, content: string): void {
  const full = path.join(dir, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}
function read(rel: string): string {
  return fs.readFileSync(path.join(dir, rel), 'utf-8')
}

describe('restore 커맨드', () => {
  it('정상 복원 — id 지정 시 백업 내용으로 파일 복원 (:48)', async () => {
    write('.cursorrules', 'orig')
    saveBackup(['.cursorrules'], dir, '2026-01-01T00-00-00-000Z')
    write('.cursorrules', 'user-modified')

    await restore('2026-01-01T00-00-00-000Z')

    expect(read('.cursorrules')).toBe('orig')
    expect(process.exitCode).toBe(0)
  })

  it('미존재 id → exitCode=1 + notFound 안내 (:56-59)', async () => {
    // 백업 1개 존재해야 early-return(빈 목록) 안 타고 try/catch 경로 진입
    write('.cursorrules', 'x')
    saveBackup(['.cursorrules'], dir, '2026-01-01T00-00-00-000Z')

    await restore('does-not-exist')

    expect(process.exitCode).toBe(1)
    // notFound 메시지 출력 확인(id 포함)
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(printed).toContain('does-not-exist')
  })
})
