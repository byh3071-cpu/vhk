import { describe, it, expect } from 'vitest'
import { parseEnvKeys, parseEnvSpec, missingEnvKeys, checkWorktreeEnv } from '../src/lib/worktree-env.js'

describe('parseEnvKeys', () => {
  it('KEY=value 줄에서 키만 뽑는다', () => {
    expect(parseEnvKeys('API_KEY=abc\nDB_URL=postgres://x')).toEqual(['API_KEY', 'DB_URL'])
  })

  it('주석(#)·빈 줄은 무시한다', () => {
    expect(parseEnvKeys('# comment\n\nA=1\n  \nB=2')).toEqual(['A', 'B'])
  })

  it('값이 비어도 키는 인식한다', () => {
    expect(parseEnvKeys('EMPTY=')).toEqual(['EMPTY'])
  })

  it("'='가 없는 줄은 무시한다", () => {
    expect(parseEnvKeys('JUST_TEXT\nA=1')).toEqual(['A'])
  })

  it('export 접두사를 허용한다', () => {
    expect(parseEnvKeys('export TOKEN=xyz')).toEqual(['TOKEN'])
  })
})

describe('parseEnvSpec — 필수/선택 구분 (#172)', () => {
  it('트레일링 # optional 마커는 선택 키로 표시', () => {
    const spec = parseEnvSpec('REQUIRED=\nOPT= # optional\nOPT2=val # optional override')
    expect(spec).toEqual([
      { key: 'REQUIRED', optional: false },
      { key: 'OPT', optional: true },
      { key: 'OPT2', optional: true },
    ])
  })

  it('일반 키는 optional=false', () => {
    expect(parseEnvSpec('A=1')).toEqual([{ key: 'A', optional: false }])
  })

  it('값 안의 # 은 주석 아님 (오탐 방지)', () => {
    // PASS=ab#cd 의 #cd 는 optional 아님
    expect(parseEnvSpec('PASS=ab#cd')).toEqual([{ key: 'PASS', optional: false }])
  })
})

describe('checkWorktreeEnv — 선택 키 (#172)', () => {
  it('선택 키 누락은 차단하지 않음 (필수만 검사)', () => {
    const r = checkWorktreeEnv({
      exampleContent: 'REQ=\nOPT1= # optional\nOPT2= # optional',
      envContent: 'REQ=1',
    })
    expect(r.status).toBe('pass')
  })

  it('필수 누락은 여전히 fail (선택 마커 있어도)', () => {
    const r = checkWorktreeEnv({
      exampleContent: 'REQ1=\nREQ2=\nOPT= # optional',
      envContent: 'REQ1=1',
    })
    expect(r.status).toBe('fail')
    expect(r.detail).toContain('REQ2')
    expect(r.detail).not.toContain('OPT')
  })

  it('전부 선택이면 skip (필수 키 없음)', () => {
    const r = checkWorktreeEnv({ exampleContent: 'A= # optional\nB= # optional', envContent: null })
    expect(r.status).toBe('skip')
  })
})

describe('missingEnvKeys', () => {
  it('필수 중 빠진 키만 반환한다', () => {
    expect(missingEnvKeys(['A', 'B', 'C'], ['A', 'C'])).toEqual(['B'])
  })

  it('전부 있으면 빈 배열', () => {
    expect(missingEnvKeys(['A', 'B'], ['A', 'B', 'X'])).toEqual([])
  })

  it('필수가 없으면 빈 배열', () => {
    expect(missingEnvKeys([], ['A'])).toEqual([])
  })
})

describe('checkWorktreeEnv', () => {
  it('필수 env 파일(.env.example) 없으면 skip — 강제하지 않음', () => {
    const r = checkWorktreeEnv({ exampleContent: null, envContent: null })
    expect(r.status).toBe('skip')
    expect(r.severity).toBe('critical')
  })

  it('필수 키가 모두 있으면 pass', () => {
    const r = checkWorktreeEnv({ exampleContent: 'A=\nB=', envContent: 'A=1\nB=2' })
    expect(r.status).toBe('pass')
    expect(r.detail).toContain('2/2')
  })

  it('필수 키가 빠지면 critical fail + 누락 키 표시', () => {
    const r = checkWorktreeEnv({ exampleContent: 'A=\nB=\nC=', envContent: 'A=1' })
    expect(r.status).toBe('fail')
    expect(r.severity).toBe('critical')
    expect(r.detail).toContain('B')
    expect(r.detail).toContain('C')
  })

  it('env 파일 자체가 없는데 필수 키가 있으면 fail', () => {
    const r = checkWorktreeEnv({ exampleContent: 'A=', envContent: null })
    expect(r.status).toBe('fail')
  })
})
