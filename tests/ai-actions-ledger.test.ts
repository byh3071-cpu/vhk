import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readAiActions, AI_ACTIONS_PATH_REL, type AiActionEntry } from '../src/lib/ai-actions-ledger.js'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-aiact-'))
}

function writeJsonl(dir: string, lines: string[]): void {
  const p = path.join(dir, AI_ACTIONS_PATH_REL)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, lines.join('\n') + '\n', 'utf-8')
}

const entry = (action: string, ran: boolean, reason = ''): AiActionEntry => ({
  ts: '2026-06-10T00:00:00Z', action, channel: 'cli', guard: 'risk', ran, reason,
})

describe('readAiActions', () => {
  it('파일 없으면 [] (55 미연동 안전)', () => {
    const d = tmp()
    expect(readAiActions(d)).toEqual([])
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('유효 JSONL → 항목 파싱', () => {
    const d = tmp()
    writeJsonl(d, [
      JSON.stringify(entry('publish', true)),
      JSON.stringify(entry('undo', false, 'no-confirm')),
    ])
    const out = readAiActions(d)
    expect(out).toHaveLength(2)
    expect(out[0].action).toBe('publish')
    expect(out[1].ran).toBe(false)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('손상 라인 skip (읽기 안 죽음)', () => {
    const d = tmp()
    writeJsonl(d, [
      JSON.stringify(entry('publish', true)),
      '{ broken json <<<',
      JSON.stringify(entry('deploy', true)),
    ])
    expect(readAiActions(d)).toHaveLength(2)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('스키마 안 맞는 줄(action/ran 누락) skip', () => {
    const d = tmp()
    writeJsonl(d, [
      JSON.stringify({ ts: 'x', foo: 'bar' }),
      JSON.stringify(entry('deploy', true)),
    ])
    const out = readAiActions(d)
    expect(out).toHaveLength(1)
    expect(out[0].action).toBe('deploy')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('BOM 있는 파일도 정상 파싱', () => {
    const d = tmp()
    const p = path.join(d, AI_ACTIONS_PATH_REL)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '﻿' + JSON.stringify(entry('publish', true)) + '\n', 'utf-8')
    expect(readAiActions(d)).toHaveLength(1)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
