import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sync, syncCore } from '../src/commands/sync.js'

const RULES = [
  '# 데모 — 테스트',
  '',
  '## 코딩 규칙',
  '- 파일명은 kebab-case',
  '',
  '## 안전 약속 <!-- vhk:sync=all -->',
  '- 배포는 사람이 승인',
  '',
].join('\n')

describe('sync 실행·미리보기 출력 어휘', () => {
  const originalCwd = process.cwd()
  let dir: string

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-sync-output-'))
    fs.writeFileSync(path.join(dir, 'RULES.md'), RULES, 'utf-8')
    await syncCore(dir, { yes: true }, async () => true)
    process.chdir(dir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    process.exitCode = 0
    vi.restoreAllMocks()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('실행 출력도 미리보기와 같은 변경됨·동일 어휘를 쓴다', async () => {
    const changedPath = path.join(dir, '.cursorrules')
    fs.writeFileSync(changedPath, fs.readFileSync(changedPath, 'utf-8') + '\n- 손수정\n', 'utf-8')

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await sync({ dryRun: true, yes: true })
    const preview = log.mock.calls.map((call) => String(call[0])).join('\n')
    log.mockClear()

    await sync({ yes: true })
    const executed = log.mock.calls.map((call) => String(call[0])).join('\n')

    expect(preview).toContain('변경됨 : .cursorrules')
    expect(preview).toContain('동일 : .windsurfrules')
    expect(executed).toContain('변경됨 : .cursorrules')
    expect(executed).toContain('동일 : .windsurfrules')
  })

  it('sync --check가 불일치와 필수 섹션 누락을 따로 센다', async () => {
    const targetPath = path.join(dir, '.cursorrules')
    const content = fs.readFileSync(targetPath, 'utf-8')
    fs.writeFileSync(targetPath, content.replace('## 안전 약속\n- 배포는 사람이 승인\n', ''), 'utf-8')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await sync({ check: true })

    const output = log.mock.calls.map((call) => String(call[0])).join('\n')
    expect(output).toContain('재생성 결과 불일치 1건')
    expect(output).toContain('필수 섹션 누락 1건')
    expect(output).toContain('.cursorrules — 필수 섹션 「안전 약속」 누락')
    expect(process.exitCode).toBe(1)
  })
})
