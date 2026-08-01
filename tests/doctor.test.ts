import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { checkCommand, compareSemver, formatRuleDriftDetails } from '../src/commands/doctor.js'
import type { RuleDriftResult } from '../src/lib/drift.js'
import { program } from '../src/index.js'
import { ko } from '../src/i18n/ko.js'

describe('vhk doctor', () => {
  it('node --version이 실행 가능하다', () => {
    const version = execSync('node --version', { encoding: 'utf-8' }).trim()
    expect(version).toMatch(/^v\d+/)
  })

  it('npm --version이 실행 가능하다', () => {
    const version = execSync('npm --version', { encoding: 'utf-8' }).trim()
    expect(version).toMatch(/^\d+/)
  })
})

describe('doctor checkCommand', () => {
  it('checkCommand — node는 설치되어 있어야 함', () => {
    const result = checkCommand('Node.js', 'node', 'hint')
    expect(result.ok).toBe(true)
    expect(result.version).toBeTruthy()
  })

  it('checkCommand — 없는 명령은 ok false', () => {
    const result = checkCommand('Fake', 'vhk-nonexistent-cmd-xyz', 'install me')
    expect(result.ok).toBe(false)
    expect(result.hint).toBe('install me')
  })
})

describe('compareSemver', () => {
  it('major/minor/patch 모두 비교', () => {
    expect(compareSemver('1.0.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareSemver('0.6.0', '0.5.10')).toBeGreaterThan(0)
    expect(compareSemver('0.5.10', '0.5.2')).toBeGreaterThan(0)
    expect(compareSemver('0.5.2', '0.5.2')).toBe(0)
    expect(compareSemver('0.5.1', '0.5.2')).toBeLessThan(0)
  })

  it('v 접두사 허용', () => {
    expect(compareSemver('v1.2.3', '1.2.3')).toBe(0)
  })

  it('pre-release 태그 무시 (메이저/마이너/패치만 비교)', () => {
    expect(compareSemver('1.0.0-beta', '1.0.0')).toBe(0)
  })
})

describe('doctor 규칙 불일치 설명', () => {
  const drifted: RuleDriftResult[] = [
    {
      path: 'AGENTS.md',
      status: 'drifted',
      differences: [
        { line: 4, expected: '기대 첫째', actual: '실제 첫째' },
        { line: 9, expected: '기대 둘째', actual: '실제 둘째' },
      ],
    },
    {
      path: 'GEMINI.md',
      status: 'drifted',
      differences: [{ line: 2, expected: '기대 셋째', actual: null }],
    },
  ]

  it('기본 출력은 첫 상이 지점의 기대/실제/조치 3줄뿐이다', () => {
    const lines = formatRuleDriftDetails(drifted)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('기대')
    expect(lines[0]).toContain('AGENTS.md:4')
    expect(lines[0]).toContain('기대 첫째')
    expect(lines[1]).toContain('실제')
    expect(lines[1]).toContain('실제 첫째')
    expect(lines[2]).toContain('조치')
    expect(lines.join('\n')).not.toContain('둘째')
    expect(lines.join('\n')).not.toContain('GEMINI.md')
  })

  it('--diff 출력은 모든 파일의 전체 줄 차이를 보여준다', () => {
    const lines = formatRuleDriftDetails(drifted, true)
    expect(lines.join('\n')).toContain('기대 둘째')
    expect(lines.join('\n')).toContain('실제 둘째')
    expect(lines.join('\n')).toContain('GEMINI.md:2')
    expect(lines.join('\n')).toContain(ko.doctor.driftMissingLine)
    expect(lines.at(-1)).toContain('조치')
  })

  it('--diff 안전 상한 초과는 전체 차이 생략을 명시한다', () => {
    const lines = formatRuleDriftDetails([{
      ...drifted[0],
      fullDiffLimited: true,
    }], true)
    expect(lines).toContain(ko.doctor.driftDiffLimited('AGENTS.md'))
  })

  it('규칙 파일 누락도 거짓 정상 대신 기대/실제/조치 3줄로 설명한다', () => {
    const lines = formatRuleDriftDetails([{ path: 'AGENTS.md', status: 'missing' }])
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain(ko.doctor.driftGeneratedFile)
    expect(lines[1]).toContain(ko.doctor.driftMissingFile)
    expect(lines[2]).toContain('조치')
  })

  it('규칙 줄의 제어 문자를 이스케이프하고 초장문 출력을 제한한다', () => {
    const dangerous = `\u001b]8;;https://example.com\u0007위험${'x'.repeat(500)}\u001b]8;;\u0007`
    const lines = formatRuleDriftDetails([{
      path: 'AGENTS.md',
      status: 'drifted',
      differences: [{ line: 1, expected: dangerous, actual: '실제 줄' }],
    }])

    expect(lines[0]).not.toContain('\u001b')
    expect(lines[0]).not.toContain('\u0007')
    expect(lines[0]).toContain('\\u001b')
    expect(lines[0]).toContain('\\u0007')
    expect(lines[0]).toContain('…')
    expect(lines[0].length).toBeLessThan(320)
  })

  // #552: 기대/실제 줄에 시크릿이 섞이면 원문 노출 자체가 유출 — 줄 전체를 고정 문구로 대체.
  describe('드리프트 줄 시크릿 마스킹', () => {
    // 가짜(패턴만 일치) — 완성 토큰 리터럴을 소스에 남기지 않는다(레포 시크릿 스캔 관례).
    const fakeToken = 'ghp_' + 'aB3kZ9mQ1rT7wX2pL5nC8vD4fG6hJ0sKbCdE'

    it('기대 줄의 시크릿은 기대/실제 두 줄 모두 고정 문구로 숨긴다', () => {
      const lines = formatRuleDriftDetails([{
        path: 'AGENTS.md',
        status: 'drifted',
        differences: [{ line: 7, expected: `TOKEN=${fakeToken}`, actual: 'TOKEN=changed' }],
      }])
      expect(lines[0]).toBe(ko.doctor.driftExpected('AGENTS.md:7', ko.doctor.driftSensitiveHidden))
      expect(lines[1]).toBe(ko.doctor.driftActual('AGENTS.md:7', ko.doctor.driftSensitiveHidden))
      expect(lines.join('\n')).not.toContain(fakeToken)
      expect(lines.join('\n')).not.toContain('TOKEN=changed')
      expect(lines.at(-1)).toContain('조치')
    })

    it('실제 줄에만 시크릿이 있어도 쌍(기대 줄 포함)으로 숨긴다', () => {
      const lines = formatRuleDriftDetails([{
        path: 'AGENTS.md',
        status: 'drifted',
        differences: [{ line: 3, expected: '깨끗한 규칙 줄', actual: `key: ${fakeToken}` }],
      }])
      expect(lines[0]).toContain(ko.doctor.driftSensitiveHidden)
      expect(lines[1]).toContain(ko.doctor.driftSensitiveHidden)
      expect(lines.join('\n')).not.toContain(fakeToken)
      expect(lines.join('\n')).not.toContain('깨끗한 규칙 줄')
    })

    // #552 독립 검수 우회 2건 — doctor 전용 보수 판정으로 막는다(전체 스캐너 정책은 불변).
    it('접미사 없는 TOKEN= 할당(generic-api-key 미탐)도 숨긴다', () => {
      const bareValue = 'Zq7Rt9Km4Np6Vw2Xy8Cd3Fg5Hj1Lb0Sa' // 가짜 32자 일반값
      const lines = formatRuleDriftDetails([{
        path: 'AGENTS.md',
        status: 'drifted',
        differences: [{ line: 5, expected: `TOKEN=${bareValue}`, actual: '실제 줄' }],
      }])
      expect(lines[0]).toBe(ko.doctor.driftExpected('AGENTS.md:5', ko.doctor.driftSensitiveHidden))
      expect(lines.join('\n')).not.toContain(bareValue)
    })

    it('값 내부의 fake_ 부분문자열은 placeholder 로 인정하지 않고 숨긴다', () => {
      // 주석/헤딩 줄에선 스캐너의 PLACEHOLDER_MARKER 가 부분문자열만으로 완화되던 우회.
      const sneaky = '# api_key=live_fake_customer_a1b2c3d4e5f6g7h8i9j0k1l2'
      const lines = formatRuleDriftDetails([{
        path: 'AGENTS.md',
        status: 'drifted',
        differences: [{ line: 9, expected: sneaky, actual: '실제 줄' }],
      }])
      expect(lines[0]).toBe(ko.doctor.driftExpected('AGENTS.md:9', ko.doctor.driftSensitiveHidden))
      expect(lines.join('\n')).not.toContain('live_fake_customer')
    })

    // #552 재검수: deny-by-default — 민감 키 할당이면 값·placeholder 와 무관하게 숨긴다.
    it('JSON quoted key·공백 포함 quoted 값도 숨긴다', () => {
      for (const line of [
        '"clientSecret": "abc12345 def67890"',
        "'apiKey': 'v3ry s3cret value'",
        // 조립식 — 소스 자체가 password-inline 패턴(레포 self-scan HIGH)에 걸리지 않게 분리.
        'pass' + 'word: "correct horse battery staple"',
      ]) {
        const lines = formatRuleDriftDetails([{
          path: 'settings.json',
          status: 'drifted',
          differences: [{ line: 1, expected: line, actual: '실제 줄' }],
        }])
        expect(lines[0]).toContain(ko.doctor.driftSensitiveHidden)
        expect(lines.join('\n')).not.toContain(line)
      }
    })

    it('camel/snake/SCREAMING/suffix 변형 키를 동일하게 숨긴다', () => {
      for (const line of [
        'clientSecret=abc12345',
        'SECRET_KEY = abc12345',
        'accessToken: abc12345',
        'db-password: abc12345',
      ]) {
        const lines = formatRuleDriftDetails([{
          path: 'AGENTS.md',
          status: 'drifted',
          differences: [{ line: 1, expected: line, actual: '실제 줄' }],
        }])
        expect(lines[0]).toContain(ko.doctor.driftSensitiveHidden)
        expect(lines.join('\n')).not.toContain('abc12345')
      }
    })

    it('placeholder 값이라도 민감 키 할당이면 숨긴다 (placeholder 판별 제거)', () => {
      // my-secret-password 처럼 placeholder 단어로만 조립된 실값을 오인해 노출하던 우회
      // — 값 판별 자체를 없앴으므로 명백한 placeholder(<your-token>)도 함께 숨는다(의도).
      for (const line of [
        'password=my-secret-password',
        'TOKEN=<your-token>',
        '# GITHUB_TOKEN=ghp_' + 'x'.repeat(36),
      ]) {
        const lines = formatRuleDriftDetails([{
          path: 'AGENTS.md',
          status: 'drifted',
          differences: [{ line: 1, expected: line, actual: '실제 줄' }],
        }])
        expect(lines[0]).toContain(ko.doctor.driftSensitiveHidden)
      }
    })

    it('여러 할당 중 하나만 민감 키여도 숨긴다', () => {
      const line = 'name: app, retry: 3, "authToken": abc12345'
      const lines = formatRuleDriftDetails([{
        path: 'config.yml',
        status: 'drifted',
        differences: [{ line: 1, expected: line, actual: '실제 줄' }],
      }])
      expect(lines[0]).toContain(ko.doctor.driftSensitiveHidden)
      expect(lines.join('\n')).not.toContain('abc12345')
    })

    it('비민감 일반 할당·규칙 줄은 그대로 보여준다', () => {
      for (const line of [
        'timeout: 3000',
        'name = build-config',
        '"version": "2.13.0"',
        '- 규칙: 커밋 전 테스트를 돌린다',
      ]) {
        const lines = formatRuleDriftDetails([{
          path: 'AGENTS.md',
          status: 'drifted',
          differences: [{ line: 1, expected: line, actual: '실제 줄' }],
        }])
        expect(lines[0]).toContain(line)
        expect(lines[0]).not.toContain(ko.doctor.driftSensitiveHidden)
      }
    })

    // #552 최종 재현 2종 — URL userinfo 자격증명 · PowerShell env 쓰기.
    it('URL userinfo 자격증명은 스킴 무관하게 숨긴다', () => {
      const cred = 'aB3kZ9mQ1rT7wX2pL5nC8vD4' // 가짜
      for (const line of [
        `postgres://app:${cred}@db.internal:5432/app`,
        `amqp://svc:${cred}@queue.internal`,
        `https://${cred}@git.example.com/repo.git`, // password 없이 username 만 있어도 자격증명
      ]) {
        const lines = formatRuleDriftDetails([{
          path: 'AGENTS.md',
          status: 'drifted',
          differences: [{ line: 1, expected: line, actual: '실제 줄' }],
        }])
        expect(lines[0]).toContain(ko.doctor.driftSensitiveHidden)
        expect(lines.join('\n')).not.toContain(cred)
      }
    })

    it('URL 의 @ 가 4000자 밖이어도 표시 구간의 자격증명을 숨긴다', () => {
      // #552 최종 우회: 자격증명 시작은 앞 240자(표시 구간)에 있는데 판정 근거인 @ 가
      // 4000자 cap 뒤라 커스텀 판정이 놓치던 경계 — 커스텀 판정은 전체 줄을 본다.
      const cred = 'aB3kZ9mQ1rT7wX2pL5nC8vD4' // 가짜
      const longUrl = `postgres://app:${cred}${'a'.repeat(4_200)}@db.internal:5432/app`
      const lines = formatRuleDriftDetails([{
        path: 'AGENTS.md',
        status: 'drifted',
        differences: [{ line: 1, expected: longUrl, actual: '실제 줄' }],
      }])
      expect(lines[0]).toContain(ko.doctor.driftSensitiveHidden)
      expect(lines.join('\n')).not.toContain(cred)
    })

    it('userinfo 없는 일반 URL 은 그대로 보여준다', () => {
      for (const line of [
        'https://example.com/docs/setup',
        '참고: https://github.com/byh3071-cpu/sample-repo/issues/1',
      ]) {
        const lines = formatRuleDriftDetails([{
          path: 'AGENTS.md',
          status: 'drifted',
          differences: [{ line: 1, expected: line, actual: '실제 줄' }],
        }])
        expect(lines[0]).toContain(line)
        expect(lines[0]).not.toContain(ko.doctor.driftSensitiveHidden)
      }
    })

    it('PowerShell/setx/.NET 등 구문 무관 — 민감 키 언급 줄은 숨긴다', () => {
      const value = 'aB3kZ9mQ1rT7wX2pL5nC8vD4' // 가짜
      for (const line of [
        `\${env:NPM_TOKEN}=${value}`,
        `Set-Item -Path Env:CLIENT_SECRET -Value ${value}`,
        `Set-Item -Value ${value} -Path Env:NPM_TOKEN`,
        `Set-Item Env:NPM_TOKEN ${value}`,
        // #552 최종: writer 구문 파싱 폐기 — 어떤 구문이든 민감 키 언급이면 숨김.
        `[Environment]::SetEnvironmentVariable('NPM_TOKEN', '${value}', 'User')`,
        `setx NPM_TOKEN ${value}`,
        `API key = ${value}`, // 두 단어 표기도 인접 쌍 결합으로 잡는다
      ]) {
        const lines = formatRuleDriftDetails([{
          path: 'AGENTS.md',
          status: 'drifted',
          differences: [{ line: 1, expected: line, actual: '실제 줄' }],
        }])
        expect(lines[0]).toContain(ko.doctor.driftSensitiveHidden)
        expect(lines.join('\n')).not.toContain(value)
      }
    })

    it('민감 키는 읽기·단순 언급도 숨긴다 (정책: deny-by-default, 값 유무 안 봄)', () => {
      // #552 최종 정책 변경: 읽기/쓰기 구분(writer 구문 파싱)이 검수마다 뚫려 폐기.
      // env 읽기처럼 줄에 값이 없어도 민감 키가 언급되면 숨긴다 — 과차단을 감수한 안정 경계.
      for (const line of ['echo $env:NPM_TOKEN', 'rotate the NPM_TOKEN quarterly']) {
        const lines = formatRuleDriftDetails([{
          path: 'AGENTS.md',
          status: 'drifted',
          differences: [{ line: 1, expected: line, actual: '실제 줄' }],
        }])
        expect(lines[0]).toContain(ko.doctor.driftSensitiveHidden)
      }
    })

    it('비민감 identifier 만 있는 PowerShell/env 줄은 그대로 보여준다', () => {
      for (const line of [
        'Set-Item -Path Env:BUILD_MODE -Value release',
        'Set-Item Env:BUILD_MODE release', // positional 도 비민감 키면 그대로
        '${env:NODE_OPTIONS}=--max-old-space-size=4096',
      ]) {
        const lines = formatRuleDriftDetails([{
          path: 'AGENTS.md',
          status: 'drifted',
          differences: [{ line: 1, expected: line, actual: '실제 줄' }],
        }])
        expect(lines[0]).toContain(line)
        expect(lines[0]).not.toContain(ko.doctor.driftSensitiveHidden)
      }
    })

    it('4000자 초과 초장문 줄의 앞부분 시크릿도 놓치지 않고 숨긴다', () => {
      // findSecretsInLine 은 4000자 초과 줄을 조용히 스킵하지만 표시는 앞 240자를 보여준다
      // — slice 가드가 없으면 이 시크릿이 그대로 노출되는 회귀.
      const longLine = `TOKEN=${fakeToken}` + 'z'.repeat(5_000)
      const lines = formatRuleDriftDetails([{
        path: 'AGENTS.md',
        status: 'drifted',
        differences: [{ line: 2, expected: longLine, actual: '실제 줄' }],
      }])
      expect(lines[0]).toContain(ko.doctor.driftSensitiveHidden)
      expect(lines.join('\n')).not.toContain(fakeToken)
    })

    it('--diff 전체 출력에서도 시크릿 쌍만 숨기고 나머지 차이는 그대로 보여준다', () => {
      const lines = formatRuleDriftDetails([{
        path: 'AGENTS.md',
        status: 'drifted',
        differences: [
          { line: 1, expected: '기대 정상', actual: '실제 정상' },
          { line: 8, expected: `TOKEN=${fakeToken}`, actual: null },
        ],
      }], true)
      expect(lines[0]).toContain('기대 정상')
      expect(lines[1]).toContain('실제 정상')
      expect(lines[2]).toBe(ko.doctor.driftExpected('AGENTS.md:8', ko.doctor.driftSensitiveHidden))
      // 상대편이 (줄 없음)이면 내용 유출이 없으므로 표식을 유지한다.
      expect(lines[3]).toBe(ko.doctor.driftActual('AGENTS.md:8', ko.doctor.driftMissingLine))
      expect(lines.join('\n')).not.toContain(fakeToken)
    })
  })

  it('doctor --diff는 --차이 한글 별칭과 i18n 설명을 함께 등록한다', () => {
    const doctorCommand = program.commands.find(command => command.name() === 'doctor')
    const diffOption = doctorCommand?.options.find(option => option.long === '--diff')
    expect(diffOption?.short).toBe('--차이')
    expect(diffOption?.attributeName()).toBe('diff')
    expect(diffOption?.description).toBe(ko.doctor.diffOption)
  })
})
