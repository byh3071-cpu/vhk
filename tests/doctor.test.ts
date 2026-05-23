import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { checkCommand } from '../src/commands/doctor.js'

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
