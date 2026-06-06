import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { atomicWriteFile } from '../src/lib/atomic-write.js'

describe('atomicWriteFile (Goal 37)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vhk-atomic-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('새 파일을 정확한 내용으로 쓴다', () => {
    const p = join(dir, 'out.json')
    atomicWriteFile(p, '{"a":1}\n')
    expect(readFileSync(p, 'utf-8')).toBe('{"a":1}\n')
  })

  it('기존 파일을 덮어쓴다(원자적 교체)', () => {
    const p = join(dir, 'out.txt')
    writeFileSync(p, 'old', 'utf-8')
    atomicWriteFile(p, 'new')
    expect(readFileSync(p, 'utf-8')).toBe('new')
  })

  it('같은 파일 연속 호출 — temp 충돌 없이 마지막 내용만 남는다 (카운터 유니크)', () => {
    const p = join(dir, 'c.json')
    atomicWriteFile(p, 'first')
    atomicWriteFile(p, 'second')
    expect(readFileSync(p, 'utf-8')).toBe('second')
    expect(readdirSync(dir).filter((f) => f.includes('.tmp-'))).toHaveLength(0)
  })

  it('쓰기 후 temp 파일을 남기지 않는다', () => {
    const p = join(dir, 'refs.json')
    atomicWriteFile(p, 'data')
    // 디렉터리에 대상 파일만 — .refs.json.tmp-* 잔여 없음
    const leftover = readdirSync(dir).filter((f) => f.includes('.tmp-'))
    expect(leftover).toHaveLength(0)
    expect(existsSync(p)).toBe(true)
  })
})
