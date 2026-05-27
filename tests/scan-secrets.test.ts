import { describe, it, expect } from 'vitest'
import { findSecretsInLine } from '../src/lib/scan-secrets.js'

// fake AWS key — 자기 레포 secure 스캔에 걸리지 않게 조각 합성.
// scanner regex (/AKIA[0-9A-Z]{16}/) 는 contiguous 매칭만 잡고 concat 표현은 매칭 안 함.
const FAKE_AWS_KEY = 'AKIA' + 'IOSFODNN7EXAMPLE'

describe('scan-secrets', () => {
  it('global regex 없이도 한 줄당 finding 1건', () => {
    const line = `const x = "${FAKE_AWS_KEY}"`
    const findings = findSecretsInLine(line, 'src/config.ts', 1)
    const aws = findings.filter(f => f.patternId === 'aws-access-key')
    expect(aws).toHaveLength(1)
  })

  it('example 주석 줄은 스킵', () => {
    const findings = findSecretsInLine(`// example ${FAKE_AWS_KEY}`, 'a.ts', 1)
    expect(findings).toHaveLength(0)
  })
})
