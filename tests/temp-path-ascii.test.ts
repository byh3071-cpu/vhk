import { describe, it, expect } from 'vitest'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

/*
 * TS-005 회귀 가드 — 테스트가 쓰는 임시 경로에 비ASCII 가 없어야 한다.
 *
 * Windows + Node v24 에서 fs.rmSync 는 경로에 비ASCII 문자가 있으면 프로세스를 죽이거나
 * 조용히 삭제를 건너뛴다. 사용자명이 한글이면 os.tmpdir() 이 통째로 여기 해당해서,
 * 임시 디렉터리를 쓰는 테스트가 로컬에서만 무더기로 깨진다 — 4개월간 "로컬만 빨강, CI 는 초록" 으로
 * 오진됐던 바로 그 증상이다. 제품 코드는 삭제 헬퍼로 우회했지만 테스트에는 아직 rmSync 가 많이 남아 있어,
 * 임시 경로 자체를 ASCII 로 고정하는 편이 확실하다(vitest.config.ts).
 */

const NON_ASCII = /[^\x20-\x7E]/

describe('임시 경로 ASCII 고정 (TS-005)', () => {
  it('os.tmpdir() 에 비ASCII 가 없다', () => {
    expect(os.tmpdir()).not.toMatch(NON_ASCII)
  })

  it('실제로 임시 디렉터리를 만들고 지울 수 있다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-ascii-guard-'))
    expect(dir).not.toMatch(NON_ASCII)
    fs.rmdirSync(dir)
    expect(fs.existsSync(dir)).toBe(false)
  })
})
