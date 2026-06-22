import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  findSecretsInLine,
  scanProjectForSecrets,
  filterSevereFindings,
  downgradeTestFixtureFindings,
  isTestFixturePath,
} from '../src/lib/scan-secrets.js'
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

  it('generic: .env.example placeholder 값은 스킵', () => {
    const findings = findSecretsInLine(
      'YOUTUBE_API_KEY=your_youtube_api_key_here',
      '.env.example',
      1,
    )
    expect(findings.filter((f) => f.patternId === 'generic-api-key')).toHaveLength(0)
  })

  it('generic: missing_api_key 상태 식별자는 스킵', () => {
    const findings = findSecretsInLine(
      'missing_api_key: "border-amber-500/20 bg-amber-500/10"',
      'src/status.ts',
      1,
    )
    expect(findings.filter((f) => f.patternId === 'generic-api-key')).toHaveLength(0)
  })

  it('generic: 실제 긴 api_key 할당은 계속 탐지', () => {
    const actual = 'z'.repeat(24)
    const findings = findSecretsInLine(`api_key = "${actual}"`, 'script.py', 1)
    expect(findings.filter((f) => f.patternId === 'generic-api-key')).toHaveLength(1)
  })

  it('generic: 상태 접두어라도 실제 값 대입은 계속 탐지', () => {
    const actual = 'z'.repeat(24)
    const findings = findSecretsInLine(`invalid_api_key = "${actual}"`, 'script.py', 1)
    expect(findings.filter((f) => f.patternId === 'generic-api-key')).toHaveLength(1)
  })

  it('generic: placeholder 단어가 변수명에만 있으면 실제 값은 탐지', () => {
    const actual = 'z'.repeat(24)
    const findings = findSecretsInLine(`example_api_key = "${actual}"`, 'script.py', 1)
    expect(findings.filter((f) => f.patternId === 'generic-api-key')).toHaveLength(1)
  })

  it('Python 파일의 generic API key를 프로젝트 스캔이 탐지', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-scan-python-'))
    const fixturePath = path.join(tmp, 'script.py')
    try {
      const apiKey = 'z'.repeat(24)
      fs.writeFileSync(fixturePath, `api_key = "${apiKey}"\n`, 'utf-8')
      const { findings } = scanProjectForSecrets(tmp)
      expect(
        findings.some((f) => f.patternId === 'generic-api-key' && f.file === 'script.py'),
      ).toBe(true)
    } finally {
      if (fs.existsSync(fixturePath)) fs.unlinkSync(fixturePath)
      fs.rmdirSync(tmp)
    }
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

  // #250: 블록주석(* 연속줄·/**·/*)의 placeholder 토큰(YOUR_*·xxxx)은 오탐 → 스킵.
  it('#250: 블록주석(* 줄)의 placeholder Bearer(YOUR_*)는 스킵', () => {
    const line = ' *   Header: Authorization: Bearer' + ' YOUR_TRIGGER_SYNC_SECRET'
    const findings = findSecretsInLine(line, 'api/trigger-sync.js', 11)
    expect(findings.filter(f => f.patternId === 'authorization-bearer')).toHaveLength(0)
  })

  it('#250: /* 시작 주석의 placeholder(xxxx)도 스킵', () => {
    const line = '/* Authorization: Bearer' + ' xxxxxxxx */'
    const findings = findSecretsInLine(line, 'a.ts', 1)
    expect(findings.filter(f => f.patternId === 'authorization-bearer')).toHaveLength(0)
  })

  // SECURITY 회귀: 블록주석이라도 진짜 토큰은 여전히 탐지 — placeholder 확대가 false-negative 만들면 안 됨.
  it('#250: 블록주석에 진짜 토큰이 있으면 여전히 탐지(false-negative 0)', () => {
    const line = ' * Authorization: Bearer' + ' tok_RealAbCd123456'
    const findings = findSecretsInLine(line, 'api/x.js', 1)
    expect(findings.filter(f => f.patternId === 'authorization-bearer')).toHaveLength(1)
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

// Goal 83: 테스트 픽스처(가짜 토큰) false positive — tests/** 의 MEDIUM 만 INFO 로 강등.
//   critical/high 는 위치 무관 유지(Forbidden — 약화 금지). 강등은 제거가 아님(INFO 로 여전히 노출 = 신호 보존).
describe('Goal 83 — 테스트 픽스처 false positive 강등', () => {
  // split 합성 — 자기 레포 secure 스캔이 이 테스트 파일을 자기탐지하지 않도록(런타임엔 합쳐짐).
  const FAKE_JWT = 'eyJ' + 'h'.repeat(8) + '.eyJ' + 's'.repeat(8) + '.' + 'x'.repeat(8)

  it('isTestFixturePath: tests/·*.test.·*.spec.·fixtures/·__mocks__ 식별, 소스/.env 는 아님', () => {
    expect(isTestFixturePath('tests/property-parsers.test.ts')).toBe(true)
    expect(isTestFixturePath('src/foo.test.ts')).toBe(true)
    expect(isTestFixturePath('src/bar.spec.tsx')).toBe(true)
    expect(isTestFixturePath('src/__mocks__/x.ts')).toBe(true)
    expect(isTestFixturePath('test/fixtures/token.json')).toBe(true)
    expect(isTestFixturePath('app/__fixtures__/a.ts')).toBe(true)
    // Windows 역슬래시도 정규화.
    expect(isTestFixturePath('tests\\a.test.ts')).toBe(true)
    expect(isTestFixturePath('src/commands/secure.ts')).toBe(false)
    expect(isTestFixturePath('.env')).toBe(false)
    expect(isTestFixturePath('src/lib/latest.ts')).toBe(false) // 'test' 부분문자열 오탐 방지
  })

  it('tests/** 의 MEDIUM(JWT 픽스처) → INFO 강등', () => {
    const findings = findSecretsInLine(`const t = "${FAKE_JWT}"`, 'tests/property-parsers.test.ts', 31)
    const jwt = findings.filter((f) => f.patternId === 'jwt')
    expect(jwt).toHaveLength(1)
    expect(jwt[0].severity).toBe('medium') // 원시 탐지는 medium
    const downgraded = downgradeTestFixtureFindings(findings)
    expect(downgraded.find((f) => f.patternId === 'jwt')?.severity).toBe('info')
  })

  it('소스(.ts)의 MEDIUM 은 강등 안 됨(유지)', () => {
    const findings = findSecretsInLine(`const t = "${FAKE_JWT}"`, 'src/auth.ts', 10)
    const downgraded = downgradeTestFixtureFindings(findings)
    expect(downgraded.find((f) => f.patternId === 'jwt')?.severity).toBe('medium')
  })

  it('tests/** 의 CRITICAL 은 위치 무관 유지(약화 금지 — Forbidden)', () => {
    const realAws = 'AKIA' + '1234567890ABCDEF'
    const findings = findSecretsInLine(`const k = "${realAws}"`, 'tests/leak.test.ts', 5)
    const downgraded = downgradeTestFixtureFindings(findings)
    expect(downgraded.find((f) => f.patternId === 'aws-access-key')?.severity).toBe('critical')
  })

  it('강등은 finding 을 제거하지 않음(INFO 로 여전히 노출 — 신호 보존, 숨김 0)', () => {
    const findings = findSecretsInLine(`const t = "${FAKE_JWT}"`, 'tests/x.test.ts', 1)
    const downgraded = downgradeTestFixtureFindings(findings)
    expect(downgraded).toHaveLength(findings.length)
  })

  it('filterSevereFindings 는 강등 후에도 critical/high 만(info 미포함 — 게이팅 불변)', () => {
    const realAws = 'AKIA' + '1234567890ABCDEF'
    const findings = [
      ...findSecretsInLine(`const t = "${FAKE_JWT}"`, 'tests/x.test.ts', 1),
      ...findSecretsInLine(`const k = "${realAws}"`, 'src/real.ts', 2),
    ]
    const severe = filterSevereFindings(downgradeTestFixtureFindings(findings))
    expect(severe.every((f) => f.severity === 'critical' || f.severity === 'high')).toBe(true)
    expect(severe.some((f) => f.patternId === 'aws-access-key')).toBe(true)
  })
})
