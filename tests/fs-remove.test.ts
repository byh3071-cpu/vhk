import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { removeFileSync, removeDirSync } from '../src/lib/fs-remove.js'

// TS-005: 이 레포는 rmSync 를 쓰지 않는다. 테스트 정리도 헬퍼로 한다(자기 적용).
const ROOT = path.join(process.cwd(), 'tests', '__fs-remove-tmp')

/** 비ASCII 경로가 트리거이므로 한글 디렉터리를 실제로 만들어 검증한다. */
function makeTree(base: string): string {
  fs.mkdirSync(path.join(base, '하위', 'nested'), { recursive: true })
  fs.writeFileSync(path.join(base, '파일.txt'), 'x', 'utf-8')
  fs.writeFileSync(path.join(base, '하위', 'a.txt'), 'x', 'utf-8')
  fs.writeFileSync(path.join(base, '하위', 'nested', 'b.txt'), 'x', 'utf-8')
  return base
}

describe('fs-remove — 비ASCII 경로에서도 실제로 지운다 (TS-005)', () => {
  beforeEach(() => {
    fs.mkdirSync(ROOT, { recursive: true })
  })
  afterEach(() => {
    removeDirSync(ROOT)
  })

  it('한글이 든 디렉터리 트리를 재귀 삭제한다', () => {
    const dir = makeTree(path.join(ROOT, '한글디렉터리'))
    removeDirSync(dir)
    expect(fs.existsSync(dir)).toBe(false)
  })

  it('ASCII 디렉터리 트리도 재귀 삭제한다', () => {
    const dir = makeTree(path.join(ROOT, 'ascii-dir'))
    removeDirSync(dir)
    expect(fs.existsSync(dir)).toBe(false)
  })

  it('한글 파일명을 삭제한다', () => {
    const f = path.join(ROOT, '한글파일.txt')
    fs.writeFileSync(f, 'x', 'utf-8')
    removeFileSync(f)
    expect(fs.existsSync(f)).toBe(false)
  })

  it('없는 경로는 조용히 통과한다 (force 동등)', () => {
    expect(() => removeDirSync(path.join(ROOT, '없는디렉터리'))).not.toThrow()
    expect(() => removeFileSync(path.join(ROOT, '없는파일.txt'))).not.toThrow()
  })

  it('디렉터리에 removeFileSync 를 쓰면 던진다 (오용 차단)', () => {
    const dir = path.join(ROOT, 'a-dir')
    fs.mkdirSync(dir, { recursive: true })
    expect(() => removeFileSync(dir)).toThrow()
  })
})
