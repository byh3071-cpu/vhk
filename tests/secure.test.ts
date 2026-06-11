import { describe, it, expect } from 'vitest'
import { SECRET_PATTERNS, maskSecret } from '../src/lib/secret-patterns.js'

// fake AWS key — 자기 레포 secure 스캔에 걸리지 않게 조각 합성 (regex contiguous 매칭만).
const FAKE_AWS_KEY = 'AKIA' + 'IOSFODNN7EXAMPLE'

describe('vhk secure scan', () => {
  it('AWS Access Key 패턴 매칭', () => {
    const pattern = SECRET_PATTERNS.find(p => p.id === 'aws-access-key')!
    expect(pattern.pattern.test(FAKE_AWS_KEY)).toBe(true)
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

// 전 패턴 표 driven 양성/음성 픽스처 — 자기 레포 스캔 회피를 위해 전부 조각 합성.
const POSITIVE_FIXTURES: Record<string, string> = {
  'aws-access-key': FAKE_AWS_KEY,
  'aws-secret-key': 'aws_secret_access_key = "' + 'A'.repeat(40) + '"',
  'private-key': '-----BEGIN ' + 'PRIVATE KEY-----',
  'notion-token': 'secret_' + 'a'.repeat(43),
  'github-token': 'ghp_' + 'A'.repeat(36),
  'github-fine-grained-pat': 'github_pat_' + 'B'.repeat(40),
  'github-oauth-token': 'gho_' + 'C'.repeat(36),
  'npm-token': 'npm_' + 'D'.repeat(36),
  'slack-token': 'xoxb-' + '1234567890-abcdefghijk',
  'google-api-key': 'AIza' + 'E'.repeat(35),
  'stripe-live-key': 'sk_live_' + 'F'.repeat(24),
  'notion-token-v2': 'ntn_' + 'G'.repeat(30),
  'openai-key': 'sk-' + 'proj-' + 'h'.repeat(20),
  'generic-api-key': 'api_key = "' + 'x'.repeat(20) + '"',
  'authorization-bearer': 'Authorization: Bearer ' + 'abc123def456',
  'password-inline': 'password = "' + 'hunter2hunter2' + '"',
  jwt: 'eyJ' + 'abc' + '.eyJ' + 'def' + '.ghi',
}

const NEGATIVE_FIXTURES: Record<string, string> = {
  'github-fine-grained-pat': 'github_pat_' + 'B'.repeat(10),
  'github-oauth-token': 'const ghost_value = 1',
  'npm-token': 'npm_config_registry=https://registry.npmjs.org',
  'slack-token': 'xoxb-',
  'google-api-key': 'AIza' + 'E'.repeat(10),
  'stripe-live-key': 'sk_live_' + 'F'.repeat(5),
  'notion-token-v2': 'ntn_' + 'G'.repeat(5),
}

describe('SECRET_PATTERNS 전 패턴 픽스처', () => {
  it('모든 패턴에 양성 픽스처가 존재한다', () => {
    const ids = SECRET_PATTERNS.map(p => p.id).sort()
    expect(ids).toEqual(Object.keys(POSITIVE_FIXTURES).sort())
  })

  for (const p of SECRET_PATTERNS) {
    it(`${p.id} 양성 매칭`, () => {
      expect(p.pattern.test(POSITIVE_FIXTURES[p.id])).toBe(true)
    })
  }

  for (const [id, fixture] of Object.entries(NEGATIVE_FIXTURES)) {
    it(`${id} 음성 비매칭`, () => {
      const p = SECRET_PATTERNS.find(x => x.id === id)!
      expect(p.pattern.test(fixture)).toBe(false)
    })
  }
})
