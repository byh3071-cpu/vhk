import { describe, it, expect } from 'vitest'
import { copyOne, copyAll, type CopyDeps } from '../../src/worktree/copy.js'
import type { CopyItem } from '../../src/worktree/types.js'

const envItem: CopyItem = { source: '/src/.env', target: '/tgt/.env', kind: 'env' }
const cfgItem: CopyItem = { source: '/src/.vscode/settings.json', target: '/tgt/.vscode/settings.json', kind: 'config' }

// 기본 성공 deps. 개별 테스트에서 override.
function deps(over: Partial<CopyDeps> = {}): CopyDeps {
  return {
    exists: () => true,
    copyFile: () => {},
    readKeys: () => 7,
    ...over,
  }
}

describe('copyOne', () => {
  it('env 복사 성공 → copied + keyCount, detail 에 값 없음(개수만)', () => {
    const r = copyOne(envItem, deps())
    expect(r.status).toBe('copied')
    expect(r.keyCount).toBe(7)
    expect(r.detail).toContain('7')
    expect(r.detail).not.toContain('/src/.env') // 경로/값 노출 최소(개수 위주)
  })

  it('config 복사 성공 → copied (keyCount 없음)', () => {
    const r = copyOne(cfgItem, deps())
    expect(r.status).toBe('copied')
    expect(r.keyCount).toBeUndefined()
  })

  it('원본 없음 → missing-source, copyFile 호출 안 함', () => {
    let copied = false
    const r = copyOne(envItem, deps({ exists: () => false, copyFile: () => { copied = true } }))
    expect(r.status).toBe('missing-source')
    expect(copied).toBe(false)
  })

  it('복사 중 에러 → error (throw 안 함), detail 에 env 값 미노출', () => {
    const r = copyOne(envItem, deps({ copyFile: () => { throw new Error('EACCES') } }))
    expect(r.status).toBe('error')
    expect(r.detail).toContain('EACCES')
    expect(r.keyCount).toBeUndefined()
  })

  it('마스킹: readKeys 가 키 개수만 반환 — 값은 절대 읽지/출력하지 않음', () => {
    let readArg = ''
    const r = copyOne(envItem, deps({ readKeys: (p) => { readArg = p; return 3 } }))
    expect(r.detail).toBe('3 keys')
    expect(readArg).toBe('/src/.env')
  })
})

describe('copyAll', () => {
  it('한 건 실패해도 나머지 계속 — 모든 결과 반환', () => {
    const items: CopyItem[] = [
      { source: '/s/.env', target: '/t/.env', kind: 'env' },
      { source: '/s/.env.local', target: '/t/.env.local', kind: 'env' },
    ]
    const d = deps({
      copyFile: (src) => { if (src === '/s/.env') throw new Error('boom') },
    })
    const results = copyAll(items, d)
    expect(results).toHaveLength(2)
    expect(results[0].status).toBe('error')
    expect(results[1].status).toBe('copied')
  })
})
