import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findSecretsInLine, scanProjectForSecrets } from '../src/lib/scan-secrets.js'

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

  // #170: Authorization Bearer 리터럴 자격증명 탐지.
  // "Bearer" 경계서 concat 분리 → 자기 레포 secure 스캔 자기탐지 방지 (런타임엔 합쳐짐).
  it('Authorization Bearer 리터럴 자격증명 탐지', () => {
    const line = 'Authorization: Bearer' + ' tok_AbCdEf123456'
    const findings = findSecretsInLine(line, '.cursor/mcp.json', 1)
    expect(findings.filter(f => f.patternId === 'authorization-bearer')).toHaveLength(1)
  })

  it('Authorization Bearer 환경변수 참조(${env:...})는 오탐 안 함', () => {
    const line = 'Authorization: Bearer ${env:AUTH_HEADER}'
    const findings = findSecretsInLine(line, '.cursor/mcp.json', 1)
    expect(findings.filter(f => f.patternId === 'authorization-bearer')).toHaveLength(0)
  })

  // #170 회귀 픽스처: tracked .cursor/mcp.json 의 Bearer 자격증명을 프로젝트 스캔이 탐지.
  it('회귀: .cursor/mcp.json 의 Bearer 자격증명을 scanProjectForSecrets 가 탐지', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-scan-cursor-'))
    try {
      fs.mkdirSync(path.join(tmp, '.cursor'), { recursive: true })
      const headerArg = 'Authorization: Bearer' + ' tok_AbCdEf123456'
      fs.writeFileSync(
        path.join(tmp, '.cursor', 'mcp.json'),
        JSON.stringify({ mcpServers: { x: { args: ['--header', headerArg] } } }, null, 2)
      )
      const { findings } = scanProjectForSecrets(tmp)
      expect(
        findings.some(f => f.patternId === 'authorization-bearer' && f.file === '.cursor/mcp.json')
      ).toBe(true)
    } finally {
      fs.rmSync(tmp, { recursive: true })
    }
  })
})
