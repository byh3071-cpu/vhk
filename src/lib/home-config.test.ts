import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getHomeConfigPath, readHomeConfig, writeHomeConfig } from './home-config.js'
import { removeDirSync } from './fs-remove.js'

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-home-config-'))
}

describe('home-config', () => {
  it('getHomeConfigPath — homeDir/.vhk/config.json 경로를 만든다', () => {
    const home = tmpHome()
    expect(getHomeConfigPath(home)).toBe(path.join(home, '.vhk', 'config.json'))
    removeDirSync(home)
  })

  it('readHomeConfig — 파일이 없으면 null', () => {
    const home = tmpHome()
    expect(readHomeConfig(home)).toBeNull()
    removeDirSync(home)
  })

  it('readHomeConfig — 손상된 JSON 이면 null(throw 안 함)', () => {
    const home = tmpHome()
    fs.mkdirSync(path.join(home, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(home, '.vhk', 'config.json'), '{ broken', 'utf-8')
    expect(readHomeConfig(home)).toBeNull()
    removeDirSync(home)
  })

  it('writeHomeConfig → readHomeConfig 왕복 — 디렉터리 없어도 자동 생성', () => {
    const home = tmpHome()
    writeHomeConfig({ rulesFile: 'C:\\example\\team-rules.yaml' }, home)
    expect(readHomeConfig(home)).toEqual({ rulesFile: 'C:\\example\\team-rules.yaml' })
    removeDirSync(home)
  })

  it('writeHomeConfig — atomic write 라 쓰기 중간 임시파일이 안 남는다', () => {
    const home = tmpHome()
    writeHomeConfig({ rulesFile: '/rules.yaml' }, home)
    const files = fs.readdirSync(path.join(home, '.vhk'))
    expect(files).toEqual(['config.json'])
    removeDirSync(home)
  })
})
