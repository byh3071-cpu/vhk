#!/usr/bin/env node
// Goal 27: silent fallback 안티패턴 린트 (선례: check-no-raw-json-parse.mjs).
// catch 블록 본문이 **로그·throw 없이 곧장 기본값 return** 인 경우 = 실패를 조용히 숨기는 폴백.
// 커뮤니티 합의 + VHK 철학("실패하면 에러 그대로 노출 · 거짓완료 금지")과 같은 방향.
//
// v0 = 보수적 탐지 + 리포트 우선(과안정화 경계). 기본 exit 0(현황 리포트), --strict 면 exit 1.
//   기존 src 에 의도적 폴백(예: "git 레포 아님 → false")이 많아 baseline 부채가 크므로
//   바로 HARD 게이트로 안 건다. 의도된 폴백은 `// vhk-allow-fallback: <이유>` 주석으로 통과.
//
// 사용: node scripts/check-no-silent-fallback.mjs [scanRoot=src] [--strict]

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const ROOT = args.find((a) => !a.startsWith('--')) || 'src'

// catch 본문이 **오직** 기본값 return 1개인 패턴(다른 문장 없음 → 로그/throw 0).
// \s 가 개행 포함 → 단일/다중 라인 모두 매칭. 본문에 return 외 문장 있으면 (} 전에 다른 토큰) 매칭 안 됨.
const SILENT = /catch\s*(?:\([^)]*\))?\s*\{\s*return\s+(null|undefined|false|0|''|""|``|\[\]|\{\})\s*;?\s*\}/g
const ALLOW = 'vhk-allow-fallback'

function tsFiles(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...tsFiles(p))
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

const hits = []
for (const file of tsFiles(ROOT)) {
  const text = readFileSync(file, 'utf-8')
  SILENT.lastIndex = 0
  let m
  while ((m = SILENT.exec(text))) {
    // 화이트리스트: 매치 직전 ~160자 안에 `// vhk-allow-fallback:` 있으면 의도된 폴백 → 통과.
    const before = text.slice(Math.max(0, m.index - 160), m.index)
    if (before.includes(ALLOW)) continue
    const line = text.slice(0, m.index).split('\n').length
    hits.push(`${file}:${line}  →  ${m[0].replace(/\s+/g, ' ').slice(0, 60)}`)
  }
}

if (hits.length === 0) {
  console.log(`[check-no-silent-fallback PASS] ${ROOT}/ silent catch-default 0건`)
  process.exit(0)
}

const head = strict ? 'FAIL' : 'REPORT'
console.log(`[check-no-silent-fallback ${head}] silent catch-default ${hits.length}건 (로그·throw 없이 기본값 return):`)
for (const h of hits) console.log('  ' + h)
console.log(`  → 의도된 폴백이면 직전 줄에 \`// ${ALLOW}: <이유>\` 추가, 아니면 에러를 노출(throw/로그)하도록 수정.`)
if (strict) process.exit(1)
console.log(`  (리포트 전용 — baseline. HARD 차단은 --strict 또는 baseline 정리 후 승격.)`)
process.exit(0)
