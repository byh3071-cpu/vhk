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

  // existsSync 는 깨진 심볼릭 링크에 false 를 준다 — 그대로 조기 반환하면 링크가 남는다.
  // rmSync(force) 는 이 경우도 지우므로, 대체 헬퍼가 계약을 지키려면 lstat 로 봐야 한다.
  // Windows 는 심볼릭 링크 생성에 권한이 필요해 만들지 못하면 건너뛴다.
  it('깨진 심볼릭 링크도 지운다 (force 동등)', (ctx) => {
    const link = path.join(ROOT, 'dangling-link')
    try {
      fs.symlinkSync(path.join(ROOT, 'missing-target'), link)
    } catch {
      ctx.skip() // 심볼릭 링크 생성 권한 없음 — 조용한 통과로 위장하지 않는다
      return
    }
    expect(fs.existsSync(link)).toBe(false) // 전제: 깨진 링크는 existsSync 로 안 보인다
    removeFileSync(link)
    expect(fs.lstatSync(link, { throwIfNoEntry: false })).toBeUndefined()
  })

  it('디렉터리에 removeFileSync 를 쓰면 던진다 (오용 차단)', () => {
    const dir = path.join(ROOT, 'a-dir')
    fs.mkdirSync(dir, { recursive: true })
    expect(() => removeFileSync(dir)).toThrow()
  })
})
