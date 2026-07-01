import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { recordSuccess, readMemory } from '../src/commands/memory.js'
import { KNOWN_COMMAND_TOKENS } from '../src/lib/cli-args.js'

// N3: vhk win — learn 의 성공 쌍둥이. memory v2 successes 에 기록.
// successes.content 는 pattern.ts reinforce 감지 입력 → evolve reinforce 후보(N2)로 복리.

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-win-'))
}

describe('recordSuccess', () => {
  it('successes 버킷에 content + goal 태그로 기록', () => {
    const d = tmp()
    const entry = recordSuccess(d, '  worktree 병렬로 충돌 0 머지  ', 42)
    expect(entry).not.toBeNull()
    expect(entry!.content).toBe('worktree 병렬로 충돌 0 머지')
    expect(entry!.tags).toContain('goal-42')
    const mem = readMemory(d)
    expect(mem.successes).toHaveLength(1)
    expect(mem.successes[0].content).toBe('worktree 병렬로 충돌 0 머지')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('goalId 없으면 no-goal 태그', () => {
    const d = tmp()
    const entry = recordSuccess(d, '검증 게이트 통과')
    expect(entry!.tags).toContain('no-goal')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('여러 번 기록 → successes 누적 (append)', () => {
    const d = tmp()
    recordSuccess(d, '첫 성공')
    recordSuccess(d, '둘째 성공')
    expect(readMemory(d).successes).toHaveLength(2)
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('win 명령 등록', () => {
  it('영문·한글 별칭이 KNOWN_COMMAND_TOKENS 에 등록됨 (NL 라우터 가드)', () => {
    expect(KNOWN_COMMAND_TOKENS.has('win')).toBe(true)
    expect(KNOWN_COMMAND_TOKENS.has('성공')).toBe(true)
  })
})
