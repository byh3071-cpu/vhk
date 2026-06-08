import { describe, it, expect } from 'vitest'
import { detectSelectedPM } from '../../src/doctor/pm.js'

describe('detectSelectedPM (#175)', () => {
  it('packageManager 필드 우선', () => {
    expect(detectSelectedPM({ packageManager: 'pnpm@8.1.0', hasPnpmLock: false, hasYarnLock: false })).toBe('pnpm')
  })
  it('pnpm-lock.yaml → pnpm', () => {
    expect(detectSelectedPM({ hasPnpmLock: true, hasYarnLock: false })).toBe('pnpm')
  })
  it('yarn.lock → yarn', () => {
    expect(detectSelectedPM({ hasPnpmLock: false, hasYarnLock: true })).toBe('yarn')
  })
  it('락파일/필드 없음 → npm 기준선', () => {
    expect(detectSelectedPM({ hasPnpmLock: false, hasYarnLock: false })).toBe('npm')
  })
  it('packageManager 필드가 락파일보다 우선', () => {
    expect(detectSelectedPM({ packageManager: 'npm@10', hasPnpmLock: true, hasYarnLock: false })).toBe('npm')
  })
  it('알 수 없는 packageManager 값은 무시하고 락파일로 폴백', () => {
    expect(detectSelectedPM({ packageManager: 'bun@1', hasPnpmLock: true, hasYarnLock: false })).toBe('pnpm')
  })
  it('대문자 packageManager 도 정규화해서 감지 (리뷰 반영)', () => {
    expect(detectSelectedPM({ packageManager: 'Pnpm@8', hasPnpmLock: false, hasYarnLock: false })).toBe('pnpm')
  })
})
