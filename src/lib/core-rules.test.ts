import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  renderCoreRuleset,
  applyMarkerBlock,
  generateCoreRulesContent,
  loadCoreRuleset,
  CORE_RULES_START_TAG,
  CORE_RULES_END_TAG,
  type CoreRuleset,
} from './core-rules.js'

const MINIMAL: CoreRuleset = {
  version: '0.1.0',
  non_negotiable: ['규칙A', '규칙B'],
  safety: { instruction_hierarchy: '시스템 > 개발자 > 유저' },
}

describe('renderCoreRuleset', () => {
  it('마커 START/END 포함', () => {
    const out = renderCoreRuleset({ data: MINIMAL, source: 'bundled', version: '0.1.0' })
    expect(out).toContain(CORE_RULES_START_TAG)
    expect(out).toContain(CORE_RULES_END_TAG)
  })

  it('non_negotiable 항목 포함', () => {
    const out = renderCoreRuleset({ data: MINIMAL, source: 'bundled', version: '0.1.0' })
    expect(out).toContain('규칙A')
    expect(out).toContain('규칙B')
  })

  it('source=live 이면 origin 문자열 포함', () => {
    const out = renderCoreRuleset({ data: MINIMAL, source: 'live', version: '0.1.0' })
    expect(out).toContain('private-rules-repository/memory/core/core-ruleset.yaml')
  })

  it('source=bundled 이면 bundled snapshot 문자열 포함', () => {
    const out = renderCoreRuleset({ data: MINIMAL, source: 'bundled', version: '0.1.0' })
    expect(out).toContain('bundled snapshot')
  })
})

describe('applyMarkerBlock — 멱등 마커 교체', () => {
  const block = renderCoreRuleset({ data: MINIMAL, source: 'bundled', version: '0.1.0' })

  it('신규(null): 마커 블록 + 특화 섹션 stub 생성', () => {
    const result = applyMarkerBlock(null, block)
    expect(result).toContain(CORE_RULES_START_TAG)
    expect(result).toContain('이 프로젝트 특화')
  })

  it('기존 마커 있음: 마커 안만 교체, 마커 밖 사람 작성분 보존', () => {
    const existing = [
      '# 사람이 쓴 헤더',
      '',
      block,
      '',
      '## 특화 섹션 (사람 작성)',
      '- 특화 규칙 1',
    ].join('\n')

    const newRuleset: CoreRuleset = { ...MINIMAL, non_negotiable: ['새규칙X'] }
    const newBlock = renderCoreRuleset({ data: newRuleset, source: 'bundled', version: '0.1.0' })
    const result = applyMarkerBlock(existing, newBlock)

    expect(result).toContain('사람이 쓴 헤더')           // 마커 밖 before 보존
    expect(result).toContain('특화 섹션 (사람 작성)')     // 마커 밖 after 보존
    expect(result).toContain('새규칙X')                  // 마커 안 갱신
    expect(result).not.toContain('규칙A')                // 이전 내용 교체됨
  })

  it('멱등: 같은 block으로 2회 적용해도 결과 동일', () => {
    const existing = applyMarkerBlock(null, block)
    const second = applyMarkerBlock(existing, block)
    expect(second).toBe(existing)
  })

  it('마커 없는 기존 파일: 전체 앞에 새 블록 + stub 추가', () => {
    const noMarker = '## 기존 내용\n\n- 어떤 규칙'
    const result = applyMarkerBlock(noMarker, block)
    // 마커 없으면 splitCoreBlock이 null 반환 → 신규 경로(block + stub)
    expect(result).toContain(CORE_RULES_START_TAG)
    expect(result).toContain('이 프로젝트 특화')
  })
})

describe('generateCoreRulesContent', () => {
  it('null 입력 시 마커 블록 반환', () => {
    const result = generateCoreRulesContent(null)
    expect(result).toContain(CORE_RULES_START_TAG)
    expect(result).toContain(CORE_RULES_END_TAG)
  })

  it('번들 스냅샷의 non_negotiable 4개 항목 포함', () => {
    const result = generateCoreRulesContent(null)
    expect(result).toContain('시크릿/토큰/키')
    expect(result).toContain('되돌릴 수 없는 작업')
    expect(result).toContain('실패비용 high')
    expect(result).toContain('MCP ✓Connected')
  })
})

describe('loadCoreRuleset — 소스 판정 (goal 91)', () => {
  let origBrain: string | undefined

  beforeEach(() => {
    origBrain = process.env.PRIVATE_RULES_ROOT
  })

  afterEach(() => {
    if (origBrain === undefined) delete process.env.PRIVATE_RULES_ROOT
    else process.env.PRIVATE_RULES_ROOT = origBrain
  })

  it('PRIVATE_RULES_ROOT 미설정 → source=bundled', () => {
    delete process.env.PRIVATE_RULES_ROOT
    const loaded = loadCoreRuleset()
    expect(loaded.source).toBe('bundled')
  })

  it('PRIVATE_RULES_ROOT 가 유효한 yaml 을 가리키면 → source=live, version=yaml 값', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-brain-'))
    const yamlPath = path.join(dir, 'memory', 'core', 'core-ruleset.yaml')
    fs.mkdirSync(path.dirname(yamlPath), { recursive: true })
    fs.writeFileSync(yamlPath, 'version: "9.9.9"\nnon_negotiable:\n  - x\n', 'utf-8')
    process.env.PRIVATE_RULES_ROOT = dir

    const loaded = loadCoreRuleset()
    expect(loaded.source).toBe('live')
    expect(loaded.version).toBe('9.9.9')

    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('PRIVATE_RULES_ROOT 는 설정됐지만 yaml 이 없으면 → bundled 로 폴백(catch 분기)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-empty-'))
    process.env.PRIVATE_RULES_ROOT = dir

    expect(loadCoreRuleset().source).toBe('bundled')

    fs.rmSync(dir, { recursive: true, force: true })
  })
})
