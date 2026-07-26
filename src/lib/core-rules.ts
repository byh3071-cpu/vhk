/**
 * core-rules.ts — core-ruleset.yaml 로딩·렌더·마커 멱등 유틸
 *
 * 소스 우선순위:
 *   1. VHK_RULES_FILE 환경변수 → 사용자가 지정한 YAML
 *   2. ~/.vhk/config.json 의 rulesFile → 사용자가 지정한 YAML
 *   3. v2 호환 설정(YOHAN_BRAIN_ROOT / brainRoot) → v3 제거 예정 경고
 *   4. 모두 없거나 읽기 실패 → 번들 스냅샷 사용
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { CORE_RULESET_SNAPSHOT } from '../templates/core-ruleset-snapshot.js'
import { readHomeConfig } from './home-config.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CoreRuleset = {
  version?: string
  updated?: string
  identity?: { role?: string; doctrine?: string }
  non_negotiable?: string[]
  coding_execution?: string[]
  rule_design?: {
    layering?: string
    formulas?: string[]
  }
  judgment_routing?: {
    workflow_vs_agent?: string
    research_budget?: string
    tool_call_scaling?: string
    source_priority?: string
    product_facts?: string
    artifact_vs_inline?: string
  }
  safety?: {
    instruction_hierarchy?: string
    ingest_isolation?: string
    capability_gating?: string
    refusal?: string
    owasp_self_check?: string
  }
  cost?: string[]
  measurement?: string[]
  domain_addons?: Record<string, unknown>
  volatile?: Record<string, string>
  pattern_refs?: string[]
}

export type CoreRulesSource = 'live' | 'bundled'

export type LoadedCoreRuleset = {
  data: CoreRuleset
  source: CoreRulesSource
  version: string
  origin?: 'configured' | 'legacy' | 'bundled'
  sourcePath?: string
  warning?: string
}

// ---------------------------------------------------------------------------
// Marker constants (공유: MCP1·vhk sync·YS1 모두 동일 마커 사용)
// ---------------------------------------------------------------------------

export const CORE_RULES_START_TAG = '<!-- CORE-RULES:START'
export const CORE_RULES_END_TAG = '<!-- CORE-RULES:END -->'

function buildStartTag(version: string, sourceOrigin: NonNullable<LoadedCoreRuleset['origin']>): string {
  const origin = sourceOrigin === 'configured'
    ? 'configured rules file'
    : sourceOrigin === 'legacy'
      ? 'legacy rules source (deprecated)'
      : 'vhk bundled snapshot'
  return `<!-- CORE-RULES:START v${version} (generated from ${origin} — 직접 편집 금지) -->`
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

function isCoreRuleset(value: unknown): value is CoreRuleset {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const rules = value as Record<string, unknown>
  if (rules.version !== undefined && typeof rules.version !== 'string') return false
  for (const key of ['non_negotiable', 'coding_execution', 'cost', 'measurement', 'pattern_refs']) {
    const item = rules[key]
    if (item !== undefined && (!Array.isArray(item) || item.some(v => typeof v !== 'string'))) return false
  }
  return true
}

export function tryLoadRulesFile(
  rulesFile: string,
  origin: NonNullable<LoadedCoreRuleset['origin']> = 'configured',
): LoadedCoreRuleset | null {
  try {
    const resolvedPath = path.resolve(rulesFile)
    const raw = fs.readFileSync(resolvedPath, 'utf-8')
    const parsed: unknown = parseYaml(raw)
    if (!isCoreRuleset(parsed)) return null
    return {
      data: parsed,
      source: 'live',
      version: parsed.version ?? 'unknown',
      origin,
      sourcePath: resolvedPath,
    }
  } catch {
    return null
  }
}

// v2.12 호환: 기존 brain root를 범용 규칙 파일 경로로 변환한다. v3.0에서 제거.
export function tryLoadLive(brainRoot: string): LoadedCoreRuleset | null {
  try {
    // path.join 도 try 안에 포함 — brainRoot 가 문자열이 아니면(홈 설정파일 수기 편집 손상 등)
    // ERR_INVALID_ARG_TYPE 을 던지는데, 이 함수의 계약은 "실패 시 항상 null"이라 여기서 잡는다.
    const yamlPath = path.join(brainRoot, 'memory', 'core', 'core-ruleset.yaml')
    return tryLoadRulesFile(yamlPath, 'legacy')
  } catch {
    return null
  }
}

export function loadCoreRuleset(homeDir: string = os.homedir()): LoadedCoreRuleset {
  const warnings: string[] = []
  const envRulesFile = process.env.VHK_RULES_FILE
  if (envRulesFile) {
    const loaded = tryLoadRulesFile(envRulesFile)
    if (loaded) return loaded
    warnings.push(`VHK_RULES_FILE을 읽지 못했습니다: ${envRulesFile}`)
  }

  const homeConfig = readHomeConfig(homeDir)
  const configRulesFile = homeConfig?.rulesFile
  if (typeof configRulesFile === 'string' && configRulesFile) {
    const loaded = tryLoadRulesFile(configRulesFile)
    if (loaded) return { ...loaded, warning: warnings.join('\n') || undefined }
    warnings.push(`~/.vhk/config.json의 rulesFile을 읽지 못했습니다: ${configRulesFile}`)
  }

  const legacyEnabled = process.env.VHK_LEGACY_RULES !== '0'
  const envRoot = legacyEnabled ? process.env.YOHAN_BRAIN_ROOT : undefined
  if (envRoot) {
    const loaded = tryLoadLive(envRoot)
    if (loaded) return {
      ...loaded,
      warning: [
        ...warnings,
        'YOHAN_BRAIN_ROOT는 v2.12 호환 설정이며 v3.0에서 제거됩니다. VHK_RULES_FILE을 사용하세요.',
      ].join('\n'),
    }
  }

  const configRoot = legacyEnabled ? homeConfig?.brainRoot : undefined
  if (typeof configRoot === 'string' && configRoot) {
    const loaded = tryLoadLive(configRoot)
    if (loaded) return {
      ...loaded,
      warning: [
        ...warnings,
        'brainRoot는 v2.12 호환 설정이며 v3.0에서 제거됩니다. rulesFile로 이전하세요.',
      ].join('\n'),
    }
  }

  return {
    data: CORE_RULESET_SNAPSHOT,
    source: 'bundled',
    version: CORE_RULESET_SNAPSHOT.version ?? 'unknown',
    origin: 'bundled',
    warning: warnings.join('\n') || undefined,
  }
}

// ---------------------------------------------------------------------------
// Render: CoreRuleset → markdown string
// ---------------------------------------------------------------------------

function items(list: string[] | undefined): string {
  if (!list?.length) return ''
  return list.map((s) => `- ${s}`).join('\n')
}

function kvItems(obj: Record<string, string> | undefined): string {
  if (!obj) return ''
  return Object.entries(obj)
    .filter(([, v]) => v)
    .map(([k, v]) => `- **${k}:** ${v}`)
    .join('\n')
}

export function renderCoreRuleset(loaded: LoadedCoreRuleset): string {
  const { data, version, origin } = loaded
  const startTag = buildStartTag(version, origin ?? (loaded.source === 'live' ? 'configured' : 'bundled'))

  const sections: string[] = []

  // 0. 정체성
  if (data.identity) {
    const { role, doctrine } = data.identity
    sections.push(
      `## 0. 정체성 (Stable)\n\n- **role:** ${role ?? ''}\n- **doctrine:** ${doctrine ?? ''}`,
    )
  }

  // 1. 절대 규칙
  if (data.non_negotiable?.length) {
    sections.push(`## 1. 절대 규칙 (NON-NEGOTIABLE)\n\n${items(data.non_negotiable)}`)
  }

  // 2. 코딩 실행 규율
  if (data.coding_execution?.length) {
    sections.push(`## 2. 코딩 실행 규율\n\n${items(data.coding_execution)}`)
  }

  // 3. 규칙 설계 3공식
  if (data.rule_design) {
    const lines: string[] = []
    if (data.rule_design.layering) lines.push(`- **layering:** ${data.rule_design.layering}`)
    if (data.rule_design.formulas?.length) {
      lines.push('- **formulas:**')
      data.rule_design.formulas.forEach((f) => lines.push(`  - ${f}`))
    }
    if (lines.length) sections.push(`## 3. 규칙·프롬프트 설계 3공식\n\n${lines.join('\n')}`)
  }

  // 4. 판단·라우팅
  if (data.judgment_routing) {
    sections.push(`## 4. 판단·라우팅\n\n${kvItems(data.judgment_routing)}`)
  }

  // 5. 안전
  if (data.safety) {
    sections.push(`## 5. 안전\n\n${kvItems(data.safety)}`)
  }

  // 6. 비용·효율
  if (data.cost?.length) {
    sections.push(`## 6. 비용·효율\n\n${items(data.cost)}`)
  }

  // 7. 측정·진화
  if (data.measurement?.length) {
    sections.push(`## 7. 측정·진화\n\n${items(data.measurement)}`)
  }

  // pattern_refs
  if (data.pattern_refs?.length) {
    const refs = data.pattern_refs.map((p) => `- ${p}`).join('\n')
    sections.push(`## 패턴 참조\n\n${refs}`)
  }

  const body = sections.join('\n\n')

  return [startTag, body, CORE_RULES_END_TAG].join('\n\n')
}

// ---------------------------------------------------------------------------
// Marker 멱등: 기존 파일의 마커 안만 교체, 마커 밖(사람 작성분) 보존
// ---------------------------------------------------------------------------

function splitCoreBlock(
  existing: string,
): { before: string; after: string } | null {
  const startIdx = existing.indexOf(CORE_RULES_START_TAG)
  const endIdx = existing.indexOf(CORE_RULES_END_TAG)
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null
  return {
    before: existing.slice(0, startIdx),
    after: existing.slice(endIdx + CORE_RULES_END_TAG.length),
  }
}

/**
 * 마커 블록을 멱등하게 교체한다.
 *   - 기존 파일에 마커 있으면: 마커 안만 newBlock으로 교체, 마커 밖 보존.
 *   - 마커 없으면: newBlock + 특화 섹션 stub을 그대로 반환.
 */
export function applyMarkerBlock(existing: string | null, newBlock: string): string {
  if (existing !== null) {
    const split = splitCoreBlock(existing)
    if (split) {
      return split.before + newBlock + split.after
    }
  }
  // 신규 생성: 마커 블록 + 특화 섹션 stub
  return [
    newBlock,
    '',
    '## 이 프로젝트 특화 (사람이 작성 — sync가 건드리지 않음)',
    '',
    '<!-- 여기부터는 core-ruleset 상속 밖입니다. 프로젝트 고유 규칙을 자유롭게 추가하세요. -->',
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// High-level: 파일 경로를 받아 전체 생성/갱신 처리
// ---------------------------------------------------------------------------

export function generateCoreRulesContent(existingContent: string | null): string {
  const loaded = loadCoreRuleset()
  const rendered = renderCoreRuleset(loaded)
  return applyMarkerBlock(existingContent, rendered)
}
