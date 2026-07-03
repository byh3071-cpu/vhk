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
import { writeHomeConfig, getHomeConfigPath } from './home-config.js'

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
    expect(out).toContain('yohan-brain/memory/core/core-ruleset.yaml')
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
    origBrain = process.env.YOHAN_BRAIN_ROOT
  })

  afterEach(() => {
    if (origBrain === undefined) delete process.env.YOHAN_BRAIN_ROOT
    else process.env.YOHAN_BRAIN_ROOT = origBrain
  })

  it('YOHAN_BRAIN_ROOT 미설정 → source=bundled', () => {
    delete process.env.YOHAN_BRAIN_ROOT
    const loaded = loadCoreRuleset()
    expect(loaded.source).toBe('bundled')
  })

  it('YOHAN_BRAIN_ROOT 가 유효한 yaml 을 가리키면 → source=live, version=yaml 값', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-brain-'))
    const yamlPath = path.join(dir, 'memory', 'core', 'core-ruleset.yaml')
    fs.mkdirSync(path.dirname(yamlPath), { recursive: true })
    fs.writeFileSync(yamlPath, 'version: "9.9.9"\nnon_negotiable:\n  - x\n', 'utf-8')
    process.env.YOHAN_BRAIN_ROOT = dir

    const loaded = loadCoreRuleset()
    expect(loaded.source).toBe('live')
    expect(loaded.version).toBe('9.9.9')

    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('YOHAN_BRAIN_ROOT 는 설정됐지만 yaml 이 없으면 → bundled 로 폴백(catch 분기)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-empty-'))
    process.env.YOHAN_BRAIN_ROOT = dir

    expect(loadCoreRuleset().source).toBe('bundled')

    fs.rmSync(dir, { recursive: true, force: true })
  })
})

// goal 92 — YOHAN_BRAIN_ROOT 환경변수의 "설정해도 재시작 전까지 반영 안 됨" 문제를 피하려고
// ~/.vhk/config.json 파일기반 설정을 3순위(env var → 홈 설정파일 → 번들)로 추가.
describe('loadCoreRuleset — 3단계 우선순위 (goal 92)', () => {
  let origBrain: string | undefined
  let tmpHome: string

  beforeEach(() => {
    origBrain = process.env.YOHAN_BRAIN_ROOT
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-home-'))
  })
  afterEach(() => {
    if (origBrain === undefined) delete process.env.YOHAN_BRAIN_ROOT
    else process.env.YOHAN_BRAIN_ROOT = origBrain
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  function writeBrainYaml(dir: string, version: string): void {
    const yamlPath = path.join(dir, 'memory', 'core', 'core-ruleset.yaml')
    fs.mkdirSync(path.dirname(yamlPath), { recursive: true })
    fs.writeFileSync(yamlPath, `version: "${version}"\nnon_negotiable:\n  - x\n`, 'utf-8')
  }

  it('env var 있으면 홈 설정파일보다 우선(무시)', () => {
    const envBrain = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-envbrain-'))
    const homeBrain = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-homebrain-'))
    writeBrainYaml(envBrain, '1.1.1')
    writeBrainYaml(homeBrain, '2.2.2')
    process.env.YOHAN_BRAIN_ROOT = envBrain
    writeHomeConfig({ brainRoot: homeBrain }, tmpHome)

    const loaded = loadCoreRuleset(tmpHome)
    expect(loaded.source).toBe('live')
    expect(loaded.version).toBe('1.1.1') // env var 쪽, 홈 설정(2.2.2) 아님

    fs.rmSync(envBrain, { recursive: true, force: true })
    fs.rmSync(homeBrain, { recursive: true, force: true })
  })

  it('env var 없고 홈 설정파일에 brainRoot 있으면 그걸 씀', () => {
    delete process.env.YOHAN_BRAIN_ROOT
    const homeBrain = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-homebrain2-'))
    writeBrainYaml(homeBrain, '3.3.3')
    writeHomeConfig({ brainRoot: homeBrain }, tmpHome)

    const loaded = loadCoreRuleset(tmpHome)
    expect(loaded.source).toBe('live')
    expect(loaded.version).toBe('3.3.3')

    fs.rmSync(homeBrain, { recursive: true, force: true })
  })

  it('env var 도 없고 홈 설정파일도 없으면 bundled', () => {
    delete process.env.YOHAN_BRAIN_ROOT
    expect(loadCoreRuleset(tmpHome).source).toBe('bundled')
  })

  it('홈 설정파일의 brainRoot 가 가리키는 경로에 yaml 이 없으면 bundled 로 폴백', () => {
    delete process.env.YOHAN_BRAIN_ROOT
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-empty2-'))
    writeHomeConfig({ brainRoot: emptyDir }, tmpHome)

    expect(loadCoreRuleset(tmpHome).source).toBe('bundled')

    fs.rmSync(emptyDir, { recursive: true, force: true })
  })

  it('homeDir 인자 생략 시 기존 무인자 호출과 하위호환(에러 없이 동작)', () => {
    delete process.env.YOHAN_BRAIN_ROOT
    expect(() => loadCoreRuleset()).not.toThrow()
  })

  // critic 재검증(2026-07-03, main 병합 후) 발견: readHomeConfig 는 "손상된 JSON"(파싱 에러)만
  // null 로 잡고, "파싱은 되지만 타입이 틀림"(brainRoot 가 문자열이 아님 — 수기 편집 오타 등)은
  // 그대로 통과시킨다. tryLoadLive 의 path.join(brainRoot, ...) 이 try 블록 밖에 있어서
  // 비문자열이 들어오면 loadCoreRuleset 을 쓰는 모든 명령(context/init/inject-bootstrap)이
  // ERR_INVALID_ARG_TYPE 로 죽었다 — "손상 시 null 폴백" 계약 위반. 재현 후 수정.
  it('홈 설정파일의 brainRoot 가 문자열이 아니면(수기 편집 손상) bundled 로 안전 폴백 — 크래시 안 함', () => {
    delete process.env.YOHAN_BRAIN_ROOT
    const configPath = getHomeConfigPath(tmpHome)
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify({ brainRoot: 123 }), 'utf-8')

    expect(() => loadCoreRuleset(tmpHome)).not.toThrow()
    expect(loadCoreRuleset(tmpHome).source).toBe('bundled')
  })
})
