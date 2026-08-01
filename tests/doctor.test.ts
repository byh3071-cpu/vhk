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

  it('doctor --diff는 --차이 한글 별칭과 i18n 설명을 함께 등록한다', () => {
    const doctorCommand = program.commands.find(command => command.name() === 'doctor')
    const diffOption = doctorCommand?.options.find(option => option.long === '--diff')
    expect(diffOption?.short).toBe('--차이')
    expect(diffOption?.attributeName()).toBe('diff')
    expect(diffOption?.description).toBe(ko.doctor.diffOption)
  })
})
