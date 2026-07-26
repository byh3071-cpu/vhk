import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCoreRuleset, renderCoreRuleset } from './core-rules.js'
import { writeHomeConfig } from './home-config.js'

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writeRules(dir: string, name: string, version: string): string {
  const file = path.join(dir, name)
  fs.writeFileSync(file, `version: "${version}"\nnon_negotiable:\n  - 공개 규칙\n`, 'utf-8')
  return file
}

describe('범용 규칙 파일 계약', () => {
  const originalRulesFile = process.env.VHK_RULES_FILE

  afterEach(() => {
    if (originalRulesFile === undefined) delete process.env.VHK_RULES_FILE
    else process.env.VHK_RULES_FILE = originalRulesFile
  })

  it('VHK_RULES_FILE이 홈 설정보다 우선한다', () => {
    const home = tempDir('vhk-rules-home-')
    const files = tempDir('vhk-rules-files-')
    const envFile = writeRules(files, 'env.yaml', '2.0.0')
    const homeFile = writeRules(files, 'home.yaml', '1.0.0')
    writeHomeConfig({ rulesFile: homeFile }, home)
    process.env.VHK_RULES_FILE = envFile

    const loaded = loadCoreRuleset(home)
    expect(loaded.version).toBe('2.0.0')
    expect(loaded.origin).toBe('configured')
    expect(loaded.sourcePath).toBe(envFile)
  })

  it('홈 rulesFile을 직접 읽고 공개 마커에는 개인 저장소명이 없다', () => {
    const home = tempDir('vhk-rules-home-')
    const files = tempDir('vhk-rules-files-')
    const rulesFile = writeRules(files, 'rules.yaml', '3.0.0')
    writeHomeConfig({ rulesFile }, home)
    delete process.env.VHK_RULES_FILE

    const loaded = loadCoreRuleset(home)
    const rendered = renderCoreRuleset(loaded)
    expect(loaded.origin).toBe('configured')
    expect(rendered).toContain('configured rules file')
    expect(rendered).not.toContain('legacy rules source')
  })

  it('명시한 파일이 잘못되면 bundled로 폴백하고 경고를 남긴다', () => {
    const home = tempDir('vhk-rules-home-')
    process.env.VHK_RULES_FILE = path.join(home, 'missing.yaml')

    const loaded = loadCoreRuleset(home)
    expect(loaded.source).toBe('bundled')
    expect(loaded.warning).toContain('VHK_RULES_FILE')
  })
})
