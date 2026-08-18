import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-expect-error — 게이트 스크립트는 .mjs 라 타입 선언이 없다(빌드 산출물 아님).
import { asciiTempEnv, hasNonAscii, isUsableDir, tempCandidates } from '../scripts/ascii-temp-dir.mjs'
import { removeDirSync } from '../src/lib/fs-remove.js'

/*
 * vitest 설정에서 불리는 코드다. 여기서 예외가 새면 테스트를 살리려다 vitest 자체를 못 띄운다 —
 * 드라이브 루트 쓰기가 막힌 환경(회사 PC·제한 계정)이 실제로 있으므로 폴백과 무개입 경로를 고정한다.
 */

const made: string[] = []

afterEach(() => {
  for (const dir of made.splice(0)) removeDirSync(dir)
})

describe('asciiTempEnv (TS-005)', () => {
  it('임시 경로가 이미 ASCII 면 아무것도 바꾸지 않는다', () => {
    expect(asciiTempEnv('C:\\Windows\\Temp', 'C:\\proj')).toEqual({})
    expect(asciiTempEnv('/tmp', '/home/dev/proj')).toEqual({})
  })

  it('비ASCII 면 쓸 수 있는 ASCII 경로로 갈아끼운다', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-ascii-env-'))
    made.push(root)
    const result = asciiTempEnv('C:\\Users\\한글\\Temp', root, {
      candidates: [path.join(root, 'ascii-tmp')],
    })
    expect(Object.keys(result).sort()).toEqual(['TEMP', 'TMP', 'TMPDIR'])
    expect(hasNonAscii(result.TEMP)).toBe(false)
  })

  // 후보를 전부 못 만들면 개입을 포기해야 한다 — 던지면 vitest 가 아예 안 뜬다.
  it('쓸 수 있는 후보가 없으면 던지지 않고 안내만 남긴다', () => {
    const warnings: string[] = []
    const result = asciiTempEnv('C:\\Users\\한글\\Temp', os.tmpdir(), {
      candidates: [path.join(os.tmpdir(), '\0invalid'), 'C:\\한글후보'],
      warn: (m: string) => warnings.push(m),
    })
    expect(result).toEqual({})
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toContain('TS-005')
  })

  it('비ASCII 프로젝트 경로는 후보에서 뺀다', () => {
    const candidates: string[] = tempCandidates('C:\\사용자\\proj', {})
    expect(candidates.every((c: string) => !hasNonAscii(c))).toBe(true)
  })

  it('isUsableDir 은 실제로 쓸 수 있을 때만 true', () => {
    const dir = path.join(os.tmpdir(), 'vhk-usable-probe')
    made.push(dir)
    expect(isUsableDir(dir)).toBe(true)
    expect(isUsableDir(path.join(dir, '\0bad'))).toBe(false)
  })
})
