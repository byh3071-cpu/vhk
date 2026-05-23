import { describe, it, expect } from 'vitest'
import { SECRET_PATTERNS, maskSecret } from '../src/lib/secret-patterns.js'

describe('vhk secure scan', () => {
  it('AWS Access Key 패턴 매칭', () => {
    const pattern = SECRET_PATTERNS.find(p => p.id === 'aws-access-key')!
    expect(pattern.pattern.test('AKIAIOSFODNN7EXAMPLE')).toBe(true)
  })

  it('GitHub Token 패턴 매칭', () => {
    const pattern = SECRET_PATTERNS.find(p => p.id === 'github-token')!
    const testToken = 'ghp_' + 'A'.repeat(36)
    expect(new RegExp(pattern.pattern.source).test(testToken)).toBe(true)
  })

  it('시크릿 마스킹', () => {
    expect(maskSecret('sk-ant-abcdefghijklmnop')).toBe('sk-ant-a****')
  })

  it('짧은 매치 마스킹', () => {
    expect(maskSecret('short')).toBe('****')
  })

  it('일반 코드는 매칭하지 않는다', () => {
    const pattern = SECRET_PATTERNS.find(p => p.id === 'aws-access-key')!
    expect(pattern.pattern.test('const foo = "hello"')).toBe(false)
  })
})
