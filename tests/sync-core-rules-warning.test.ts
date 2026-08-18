import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { syncCore } from '../src/commands/sync.js'
import { removeDirSync } from '../src/lib/fs-remove.js'
import { useIsolatedHome, type IsolatedHome } from '../src/lib/test-support/isolated-home.js'
import { writeHomeConfig } from '../src/lib/home-config.js'

// #556: 지정한 규칙 원본을 못 읽으면 sync 가 내장 기본 규칙으로 조용히 대체한다.
// 사용자는 조직 규칙이 적용된 줄 알지만 실제로는 더 약한 기본 규칙이 깔린다.
// init·context 는 같은 경고를 이미 내보내는데 sync 만 버리고 있었다.

const ROOT = path.join(process.cwd(), 'tests', '__sync-core-warning-tmp')

const RULES = ['# 데모 — 테스트', '', '## 코딩 규칙', '', '- A 규칙', ''].join('\n')
const LIVE_RULESET = 'version: "9.9.9"\nnon_negotiable:\n  - 데모 규칙\n'

describe('sync — 규칙 원본을 못 읽으면 알린다 (#556)', () => {
  let home: IsolatedHome

  beforeEach(() => {
    home = useIsolatedHome('vhk-sync-core-warning-home-')
    fs.mkdirSync(ROOT, { recursive: true })
    fs.writeFileSync(path.join(ROOT, 'RULES.md'), RULES, 'utf-8')
  })
  afterEach(() => {
    home.restore()
    removeDirSync(ROOT)
  })

  it('지정한 규칙 파일을 못 읽으면 결과에 경고를 담는다', async () => {
    process.env.VHK_RULES_FILE = path.join(ROOT, '없는-규칙파일.yaml')
    const result = await syncCore(ROOT, { yes: true }, async () => true)
    expect(result.coreRulesWarning).toBeDefined()
    expect(result.coreRulesWarning).toContain('VHK_RULES_FILE')
    expect(result.coreRulesFallback).toBe(true)
  })

  it('규칙 파일을 지정하지 않았으면 경고하지 않는다 (기본 사용자 소음 방지)', async () => {
    const result = await syncCore(ROOT, { yes: true }, async () => true)
    expect(result.coreRulesWarning).toBeUndefined()
  })

  // dry-run 은 "실행하면 뭐가 되는지" 를 미리 보는 용도다. 여기서 경고를 숨기면
  // 사용자는 대체 사실을 모른 채 본실행으로 넘어간다.
  it('dry-run 에서도 경고를 전달한다', async () => {
    process.env.VHK_RULES_FILE = path.join(ROOT, '없는-규칙파일.yaml')
    const result = await syncCore(ROOT, { yes: true, dryRun: true }, async () => true)
    expect(result.dryRun).toBe(true)
    expect(result.coreRulesWarning).toContain('VHK_RULES_FILE')
    expect(result.coreRulesFallback).toBe(true)
  })

  // 환경변수는 실패했지만 홈 설정의 규칙 원본으로 성공한 경우 — 경고는 맞되
  // "내장 기본 규칙으로 대체" 는 거짓이다. 두 상태를 따로 들고 다녀야 한다.
  it('환경변수만 실패하고 홈 설정 원본을 읽었으면 대체가 아니다', async () => {
    const rulesFile = path.join(home.dir, 'team-rules.yaml')
    fs.writeFileSync(rulesFile, LIVE_RULESET, 'utf-8')
    writeHomeConfig({ rulesFile }, home.dir)
    process.env.VHK_RULES_FILE = path.join(ROOT, '없는-규칙파일.yaml')

    const result = await syncCore(ROOT, { yes: true }, async () => true)
    expect(result.coreRulesWarning).toContain('VHK_RULES_FILE')
    expect(result.coreRulesFallback).toBe(false)
  })
})
