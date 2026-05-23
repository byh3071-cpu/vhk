import { describe, it, expect } from 'vitest'
import { findSecretsInLine } from '../src/lib/scan-secrets.js'

describe('scan-secrets', () => {
  it('global regex 없이도 한 줄당 finding 1건', () => {
    const line = 'const x = "AKIAIOSFODNN7EXAMPLE"'
    const findings = findSecretsInLine(line, 'src/config.ts', 1)
    const aws = findings.filter(f => f.patternId === 'aws-access-key')
    expect(aws).toHaveLength(1)
  })

  it('example 주석 줄은 스킵', () => {
    const findings = findSecretsInLine('// example AKIAIOSFODNN7EXAMPLE', 'a.ts', 1)
    expect(findings).toHaveLength(0)
  })
})
