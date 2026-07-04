import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getHomeConfigPath, readHomeConfig, writeHomeConfig } from './home-config.js'

// goal 92: PRIVATE_RULES_ROOT 환경변수의 "재시작 필요" 문제를 피하기 위한 홈 디렉터리 파일기반
// 설정(~/.vhk/config.json). 매 실행마다 디스크를 새로 읽으므로 재시작 없이 즉시 반영된다.
// src/lib/config.ts(프로젝트-로컬 .vhk/config.json)와 이름 충돌 방지 위해 별도 파일로 분리.

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-home-config-'))
}

describe('home-config', () => {
  it('getHomeConfigPath — homeDir/.vhk/config.json 경로를 만든다', () => {
    const home = tmpHome()
    expect(getHomeConfigPath(home)).toBe(path.join(home, '.vhk', 'config.json'))
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('readHomeConfig — 파일이 없으면 null', () => {
    const home = tmpHome()
    expect(readHomeConfig(home)).toBeNull()
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('readHomeConfig — 손상된 JSON 이면 null(throw 안 함)', () => {
    const home = tmpHome()
    fs.mkdirSync(path.join(home, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(home, '.vhk', 'config.json'), '{ broken', 'utf-8')
    expect(readHomeConfig(home)).toBeNull()
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('writeHomeConfig → readHomeConfig 왕복 — 디렉터리 없어도 자동 생성', () => {
    const home = tmpHome()
    writeHomeConfig({ rulesRoot: 'C:\\example\\private-rules-repository' }, home)
    expect(readHomeConfig(home)).toEqual({ rulesRoot: 'C:\\example\\private-rules-repository' })
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('writeHomeConfig — atomic write 라 쓰기 중간 임시파일이 안 남는다', () => {
    const home = tmpHome()
    writeHomeConfig({ rulesRoot: '/x' }, home)
    const files = fs.readdirSync(path.join(home, '.vhk'))
    expect(files).toEqual(['config.json'])
    fs.rmSync(home, { recursive: true, force: true })
  })
})
