#!/usr/bin/env node
// scripts/check-rules-sync.mjs — RULES.md ↔ CLAUDE.md 자동생성 블록 drift 게이트 (governance T3).
// RULES.md 를 고치고 `vhk sync` 를 안 돌리면(또는 CLAUDE.md 블록을 직접 고치면) 단일출처가 깨진다 —
// CLAUDE.md vhk:rules 블록 안의 모든 섹션이 RULES.md 동명 섹션과 내용 일치하는지 대조해 FAIL.
//
// 판정 방향: CLAUDE 블록 ⊆ RULES (블록 섹션이 RULES 에 없거나 내용 다름 = drift).
// 알려진 한계(v0, 적대검증 D2-1): 역방향 — RULES 의 **매핑된** 섹션이 CLAUDE 블록에서
// 통째로 빠진 경우(예: sync 미실행 + 블록 수동 삭제)는 무탐지. sync 의 unmapped 경고는
// 무매핑 섹션 전용이라 이 갭을 못 메움. 양방향 대조는 키 목록 복제가 필요(drift 검사기
// 자신의 drift 위험) → `vhk sync --check` CLI 내장이 맞는 고도 — 후속 goal 후보.
// 사용: node scripts/check-rules-sync.mjs [rulesPath=RULES.md] [claudePath=CLAUDE.md]
import { readFileSync } from 'node:fs'
import { isMainModule, ensureNoHardStop } from './_lib.mjs'

const VHK_BLOCK_START = '<!-- vhk:rules:start -->'
const VHK_BLOCK_END = '<!-- vhk:rules:end -->'

/** `## ` 기준 섹션 분리(src/commands/sync.ts parseRulesMd 와 동형 — .mjs 라 TS import 불가, _lib.mjs 선례). */
export function parseSections(md) {
  const sections = []
  let title = ''
  let buf = []
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      if (title) sections.push({ title, content: buf.join('\n').trim() })
      title = line.slice(3).trim()
      buf = []
    } else if (title) {
      buf.push(line)
    }
  }
  if (title) sections.push({ title, content: buf.join('\n').trim() })
  return sections
}

/** CLAUDE.md vhk:rules 마커 안의 섹션들. 마커 없으면 null(pre-migration — 게이트 비적용). */
export function extractVhkBlockSections(claudeMd) {
  const start = claudeMd.indexOf(VHK_BLOCK_START)
  const end = claudeMd.indexOf(VHK_BLOCK_END)
  if (start === -1 || end === -1 || end < start) return null
  const block = claudeMd.slice(start + VHK_BLOCK_START.length, end)
  return parseSections(block)
}

/** 라인 단위 rtrim + 빈 줄 정규화 — CRLF/트레일링 공백을 drift 로 오탐하지 않게. */
function normalize(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .trim()
}

/** drift 목록: [{title, kind: 'missing'|'mismatch'}]. 빈 배열 = 동기화 상태. */
export function findRulesDrift(rulesMd, claudeMd) {
  const blockSections = extractVhkBlockSections(claudeMd)
  if (blockSections === null) return [] // 마커 없음 — 호출부가 비적용 처리
  const rules = new Map(parseSections(rulesMd).map((s) => [s.title, normalize(s.content)]))
  const drift = []
  for (const s of blockSections) {
    const expected = rules.get(s.title)
    if (expected === undefined) {
      drift.push({ title: s.title, kind: 'missing' })
    } else if (expected !== normalize(s.content)) {
      drift.push({ title: s.title, kind: 'mismatch' })
    }
  }
  return drift
}

function main() {
  ensureNoHardStop('rules-sync')
  const rulesPath = process.argv[2] || 'RULES.md'
  const claudePath = process.argv[3] || 'CLAUDE.md'
  let rules, claude
  try {
    rules = readFileSync(rulesPath, 'utf-8')
    claude = readFileSync(claudePath, 'utf-8')
  } catch {
    console.log('[check-rules-sync] RULES.md/CLAUDE.md 없음 — 비적용 통과')
    process.exit(0)
  }
  if (extractVhkBlockSections(claude) === null) {
    console.log('[check-rules-sync] CLAUDE.md 에 vhk:rules 마커 없음(pre-migration) — 비적용 통과')
    process.exit(0)
  }
  const drift = findRulesDrift(rules, claude)
  if (drift.length === 0) {
    console.log('[check-rules-sync PASS] RULES.md ↔ CLAUDE.md 블록 동기화 상태')
    process.exit(0)
  }
  console.log(`[check-rules-sync FAIL] drift ${drift.length}건 — vhk sync 필요:`)
  for (const d of drift) console.log(`  - ## ${d.title}: ${d.kind === 'missing' ? 'RULES.md 에 없는 섹션(스테일)' : '내용 불일치'}`)
  console.log('  → RULES.md 에서 고치고 `vhk sync` 로 재전파하세요 (CLAUDE.md 블록 직접 수정 금지).')
  process.exit(1)
}

if (isMainModule(import.meta.url)) main()
