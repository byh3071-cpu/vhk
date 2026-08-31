import { describe, expect, it } from 'vitest'
import { contextFingerprint, shouldRewriteContext } from '../src/lib/context-stamp.js'

const body = ['# 프로젝트 컨텍스트', '', 'stack: next', '---', ''].join('\n')

describe('contextFingerprint', () => {
  it('_생성: 줄을 무시한다', () => {
    const a = `${body}_생성: 2026. 8. 31. 오전 10:00:00_\n_git: abc_\n`
    const b = `${body}_생성: 2026. 8. 31. 오전 11:00:00_\n_git: abc_\n`
    expect(contextFingerprint(a)).toBe(contextFingerprint(b))
  })

  it('본문이 바뀌면 다르다', () => {
    const a = `${body}_생성: 1_\n`
    const b = `# 다른\n\n${body}_생성: 1_\n`
    expect(contextFingerprint(a)).not.toBe(contextFingerprint(b))
  })
})

describe('shouldRewriteContext', () => {
  it('파일이 없으면 쓴다', () => {
    expect(shouldRewriteContext(null, `${body}_생성: 1_\n`)).toBe(true)
  })

  it('시각만 다르면 안 쓴다', () => {
    expect(
      shouldRewriteContext(`${body}_생성: old_\n_git: abc_\n`, `${body}_생성: new_\n_git: abc_\n`),
    ).toBe(false)
  })

  it('HEAD 마커가 바뀌면 쓴다', () => {
    expect(
      shouldRewriteContext(`${body}_생성: old_\n_git: aaa_\n`, `${body}_생성: new_\n_git: bbb_\n`),
    ).toBe(true)
  })
})
