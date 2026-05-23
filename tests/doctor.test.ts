import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { checkCommand, compareSemver } from '../src/commands/doctor.js'

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
