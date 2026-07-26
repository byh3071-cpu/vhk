import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { configSetRulesFile } from './config.js'
import { readHomeConfig } from '../lib/home-config.js'

describe('config set-rules-file', () => {
  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('검증한 YAML 절대경로를 기존 설정과 함께 저장한다', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-config-rules-'))
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-config-cwd-'))
    const rulesFile = path.join(cwd, 'rules.yaml')
    fs.writeFileSync(rulesFile, 'version: "2.12.0"\nnon_negotiable:\n  - x\n', 'utf-8')

    await configSetRulesFile(rulesFile, home)

    expect(readHomeConfig(home)).toEqual({ rulesFile })
    expect(process.exitCode).toBeUndefined()
  })

  it('잘못된 YAML이면 설정 파일을 만들지 않고 실패한다', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-config-rules-'))
    const rulesFile = path.join(home, 'broken.yaml')
    fs.writeFileSync(rulesFile, 'version: [broken', 'utf-8')

    await configSetRulesFile(rulesFile, home)

    expect(readHomeConfig(home)).toBeNull()
    expect(process.exitCode).toBe(1)
  })
})
