import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { removeDirSync } from '../src/lib/fs-remove.js'

describe('gen-autonomy-morning-report JSONL append', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vhk-morning-script-'))
  })

  afterEach(() => removeDirSync(dir))

  it('lone CR 꼬리를 CRLF로 완성해 기존·신규 관측을 모두 보존한다', () => {
    const eventsDir = join(dir, '.vhk', 'events')
    const logPath = join(eventsDir, 'autonomy-run.jsonl')
    mkdirSync(eventsDir, { recursive: true })
    writeFileSync(logPath, `${JSON.stringify({
      kind: 'morning',
      ts: '2026-08-27T00:00:00.000Z',
      date: '2026-08-27',
    })}\r`, 'utf-8')

    const result = spawnSync(process.execPath, [
      join(process.cwd(), 'scripts', 'gen-autonomy-morning-report.mjs'),
      '--cwd',
      dir,
      '--date',
      '2026-08-28',
    ], { encoding: 'utf-8' })

    expect(result.status).toBe(0)
    const entries = readFileSync(logPath, 'utf-8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line) as Record<string, unknown>)
    expect(entries.map(entry => entry.date)).toEqual(['2026-08-27', '2026-08-28'])
  })
})
