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
  const originalLegacyRoot = process.env.YOHAN_BRAIN_ROOT

  afterEach(() => {
    if (originalRulesFile === undefined) delete process.env.VHK_RULES_FILE
    else process.env.VHK_RULES_FILE = originalRulesFile
    if (originalLegacyRoot === undefined) delete process.env.YOHAN_BRAIN_ROOT
    else process.env.YOHAN_BRAIN_ROOT = originalLegacyRoot
  })

  it('VHK_RULES_FILE이 홈 설정과 legacy보다 우선한다', () => {
    const home = tempDir('vhk-rules-home-')
    const files = tempDir('vhk-rules-files-')
    const envFile = writeRules(files, 'env.yaml', '2.0.0')
    const homeFile = writeRules(files, 'home.yaml', '1.0.0')
    writeHomeConfig({ rulesFile: homeFile, brainRoot: files }, home)
    process.env.VHK_RULES_FILE = envFile
    process.env.YOHAN_BRAIN_ROOT = files

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
    delete process.env.YOHAN_BRAIN_ROOT

    const loaded = loadCoreRuleset(home)
    const rendered = renderCoreRuleset(loaded)
    expect(loaded.origin).toBe('configured')
    expect(rendered).toContain('configured rules file')
    expect(rendered).not.toContain('yohan-brain')
  })

  it('명시한 파일이 잘못되면 bundled로 폴백하고 경고를 남긴다', () => {
    const home = tempDir('vhk-rules-home-')
    process.env.VHK_RULES_FILE = path.join(home, 'missing.yaml')
    delete process.env.YOHAN_BRAIN_ROOT

    const loaded = loadCoreRuleset(home)
    expect(loaded.source).toBe('bundled')
    expect(loaded.warning).toContain('VHK_RULES_FILE')
  })

  it('legacy root는 한 릴리스 동안 동작하며 제거 예정 경고를 남긴다', () => {
    const home = tempDir('vhk-rules-home-')
    const root = tempDir('vhk-legacy-rules-')
    const legacyDir = path.join(root, 'memory', 'core')
    fs.mkdirSync(legacyDir, { recursive: true })
    fs.writeFileSync(path.join(legacyDir, 'core-ruleset.yaml'), 'version: "1.5.0"\n', 'utf-8')
    delete process.env.VHK_RULES_FILE
    process.env.YOHAN_BRAIN_ROOT = root

    const loaded = loadCoreRuleset(home)
    expect(loaded.origin).toBe('legacy')
    expect(loaded.warning).toContain('v3.0')
  })
})
