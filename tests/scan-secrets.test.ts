import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findSecretsInLine, scanProjectForSecrets, filterSevereFindings } from '../src/lib/scan-secrets.js'
import { MAX_SCAN_FILE_BYTES } from '../src/lib/scan-files.js'

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

  it('#218: 주석에 example 단어가 있어도 값이 진짜 시크릿이면 검출(false-negative 방지)', () => {
    const realAws = 'AKIA' + '1234567890ABCDEF' // 'example' 미포함 = placeholder 아님
    const findings = findSecretsInLine(`// real key (see example.com): ${realAws}`, 'a.ts', 1)
    expect(findings.filter((f) => f.patternId === 'aws-access-key')).toHaveLength(1)
  })

  it('#218: 매칭 값 자체가 placeholder(…EXAMPLE)면 주석에서 스킵(오탐 방지 유지)', () => {
    const findings = findSecretsInLine(`# see ${FAKE_AWS_KEY}`, 'a.ts', 1)
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

  // Goal 59: 스캔 truncation 신호 — 3대 한도(findings/라인/파일)가 truncationReasons 로 노출돼야
  //          runSecureGate 가 "잘린 스캔의 거짓 PASS" 를 WARN 으로 바꿀 수 있다.
  describe('Goal 59 — 스캔 불완전 신호 (truncated + truncationReasons)', () => {
    function tmpDir(): string {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-scan-trunc-'))
    }

    it('정상 스캔 → truncated=false, truncationReasons=[]', () => {
      const d = tmpDir()
      try {
        fs.writeFileSync(path.join(d, 'a.js'), 'const x = 1\n', 'utf-8')
        const scan = scanProjectForSecrets(d)
        expect(scan.truncated).toBe(false)
        expect(scan.truncationReasons).toEqual([])
      } finally {
        fs.rmSync(d, { recursive: true, force: true })
      }
    })

    it('findings ≥ 200 → truncated + findings-cap (medium 만이라 severe 0)', () => {
      const d = tmpDir()
      try {
        // jwt 패턴(유일한 medium) 201줄 → 200 에서 컷. severe(critical/high) 0.
        const jwt = 'eyJ' + 'a'.repeat(6) + '.eyJ' + 'b'.repeat(6) + '.' + 'c'.repeat(6)
        const body = Array.from({ length: 201 }, () => `const t = "${jwt}"`).join('\n')
        fs.writeFileSync(path.join(d, 'many.js'), body, 'utf-8')
        const scan = scanProjectForSecrets(d)
        expect(scan.truncated).toBe(true)
        expect(scan.truncationReasons).toContain('findings-cap')
        expect(filterSevereFindings(scan.findings)).toHaveLength(0)
      } finally {
        fs.rmSync(d, { recursive: true, force: true })
      }
    })

    it('라인 > 4000자 → truncated + line-length (그 줄 스킵)', () => {
      const d = tmpDir()
      try {
        // 4001자 줄(시크릿 없음) — 길이 한도로 스킵돼 불완전 신호만 남는다.
        fs.writeFileSync(path.join(d, 'long.js'), 'const x = "' + 'y'.repeat(4001) + '"\n', 'utf-8')
        const scan = scanProjectForSecrets(d)
        expect(scan.truncated).toBe(true)
        expect(scan.truncationReasons).toContain('line-length')
      } finally {
        fs.rmSync(d, { recursive: true, force: true })
      }
    })

    it('파일 > 512KB → truncated + file-size (그 파일 스킵)', () => {
      const d = tmpDir()
      try {
        fs.writeFileSync(path.join(d, 'big.js'), 'x'.repeat(MAX_SCAN_FILE_BYTES + 1), 'utf-8')
        fs.writeFileSync(path.join(d, 'ok.js'), 'const x = 1\n', 'utf-8')
        const scan = scanProjectForSecrets(d)
        expect(scan.truncated).toBe(true)
        expect(scan.truncationReasons).toContain('file-size')
      } finally {
        fs.rmSync(d, { recursive: true, force: true })
      }
    })
  })
})
