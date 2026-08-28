import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { chmodSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { removeDirSync } from '../src/lib/fs-remove.js'
import { atomicWriteFile } from '../src/lib/atomic-write.js'

const renameState = vi.hoisted(() => ({
  calls: 0,
  failures: [] as NodeJS.ErrnoException[],
  seedExclusiveCollision: false,
  exclusivePath: null as string | null,
  exclusiveWriteFailure: null as NodeJS.ErrnoException | null,
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    openSync: (...args: Parameters<typeof actual.openSync>): number => {
      if (args[1] === 'wx') {
        renameState.exclusivePath = String(args[0])
        if (renameState.seedExclusiveCollision) {
          renameState.seedExclusiveCollision = false
          actual.writeFileSync(renameState.exclusivePath, 'foreign temp', 'utf-8')
          throw Object.assign(new Error('exclusive temp collision'), { code: 'EEXIST' })
        }
      }
      return actual.openSync(...args)
    },
    writeFileSync: ((...args: unknown[]): void => {
      if (typeof args[0] === 'number' && renameState.exclusiveWriteFailure !== null) {
        actual.writeFileSync(args[0], 'partial', 'utf-8')
        const failure = renameState.exclusiveWriteFailure
        renameState.exclusiveWriteFailure = null
        throw failure
      }
      Reflect.apply(actual.writeFileSync, actual, args)
    }) as typeof actual.writeFileSync,
    renameSync: (...args: Parameters<typeof actual.renameSync>): void => {
      renameState.calls += 1
      const failure = renameState.failures.shift()
      if (failure) throw failure
      actual.renameSync(...args)
    },
  }
})

describe('atomicWriteFile (Goal 37)', () => {
  let dir: string
  beforeEach(() => {
    renameState.calls = 0
    renameState.failures = []
    renameState.seedExclusiveCollision = false
    renameState.exclusivePath = null
    renameState.exclusiveWriteFailure = null
    dir = mkdtempSync(join(tmpdir(), 'vhk-atomic-'))
  })
  afterEach(() => {
    removeDirSync(dir)
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

  it.runIf(process.platform !== 'win32')('기존 일반 파일 권한을 덮어쓰기 뒤에도 보존한다', () => {
    const p = join(dir, 'shared.txt')
    writeFileSync(p, 'old', 'utf-8')
    chmodSync(p, 0o644)

    atomicWriteFile(p, 'new')

    expect(statSync(p).mode & 0o777).toBe(0o644)
  })

  it.runIf(process.platform !== 'win32')('민감 파일은 호출부가 0600을 강제할 수 있다', () => {
    const p = join(dir, 'private.json')
    atomicWriteFile(p, '{}\n', { mode: 0o600 })
    expect(statSync(p).mode & 0o777).toBe(0o600)
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

  it('Windows 일시적 EPERM 뒤 rename 을 재시도해 쓰기를 완료한다', () => {
    const p = join(dir, 'retry.json')
    const transient = Object.assign(new Error('temporarily locked'), { code: 'EPERM' })
    renameState.failures = [transient, transient]

    atomicWriteFile(p, 'recovered')

    expect(renameState.calls).toBe(3)
    expect(readFileSync(p, 'utf-8')).toBe('recovered')
    expect(readdirSync(dir).filter((f) => f.includes('.tmp-'))).toHaveLength(0)
  })

  it('EPERM 이 계속되면 제한된 재시도 뒤 원래 오류를 던지고 temp 를 정리한다', () => {
    const p = join(dir, 'locked.json')
    const original = Object.assign(new Error('still locked'), { code: 'EPERM' })
    renameState.failures = Array.from({ length: 20 }, () => original)

    let thrown: unknown
    try {
      atomicWriteFile(p, 'never committed')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(original)
    expect(renameState.calls).toBeGreaterThan(1)
    expect(renameState.calls).toBeLessThan(20)
    expect(existsSync(p)).toBe(false)
    expect(readdirSync(dir).filter((f) => f.includes('.tmp-'))).toHaveLength(0)
  })

  it('wx 충돌로 만들지 못한 타 프로세스 temp 파일은 삭제하지 않는다', () => {
    const p = join(dir, 'collision.json')
    renameState.seedExclusiveCollision = true

    expect(() => atomicWriteFile(p, 'ours')).toThrowError(
      expect.objectContaining({ code: 'EEXIST' }),
    )

    expect(renameState.exclusivePath).not.toBeNull()
    expect(readFileSync(renameState.exclusivePath!, 'utf-8')).toBe('foreign temp')
    expect(existsSync(p)).toBe(false)
  })

  it('temp 생성 뒤 쓰기 실패면 우리가 만든 부분 파일을 정리한다', () => {
    const p = join(dir, 'disk-full.json')
    const original = Object.assign(new Error('disk full'), { code: 'ENOSPC' })
    renameState.exclusiveWriteFailure = original

    let thrown: unknown
    try {
      atomicWriteFile(p, 'complete payload')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(original)
    expect(renameState.exclusivePath).not.toBeNull()
    expect(existsSync(renameState.exclusivePath!)).toBe(false)
    expect(existsSync(p)).toBe(false)
  })
})
