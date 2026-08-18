import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { syncCore } from '../src/commands/sync.js'
import { removeDirSync } from '../src/lib/fs-remove.js'

// #556: 지정한 규칙 원본을 못 읽으면 sync 가 내장 기본 규칙으로 조용히 대체한다.
// 사용자는 조직 규칙이 적용된 줄 알지만 실제로는 더 약한 기본 규칙이 깔린다.
// init·context 는 같은 경고를 이미 내보내는데 sync 만 버리고 있었다.

const ROOT = path.join(process.cwd(), 'tests', '__sync-core-warning-tmp')

const RULES = ['# 데모 — 테스트', '', '## 코딩 규칙', '', '- A 규칙', ''].join('\n')

describe('sync — 규칙 원본을 못 읽으면 알린다 (#556)', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env.VHK_RULES_FILE
    fs.mkdirSync(ROOT, { recursive: true })
    fs.writeFileSync(path.join(ROOT, 'RULES.md'), RULES, 'utf-8')
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.VHK_RULES_FILE
    else process.env.VHK_RULES_FILE = saved
    removeDirSync(ROOT)
  })

  it('지정한 규칙 파일을 못 읽으면 결과에 경고를 담는다', async () => {
    process.env.VHK_RULES_FILE = path.join(ROOT, '없는-규칙파일.yaml')
    const result = await syncCore(ROOT, { yes: true }, async () => true)
    expect(result.coreRulesWarning).toBeDefined()
    expect(result.coreRulesWarning).toContain('VHK_RULES_FILE')
  })

  it('규칙 파일을 지정하지 않았으면 경고하지 않는다 (기본 사용자 소음 방지)', async () => {
    delete process.env.VHK_RULES_FILE
    const result = await syncCore(ROOT, { yes: true }, async () => true)
    expect(result.coreRulesWarning).toBeUndefined()
  })
})
