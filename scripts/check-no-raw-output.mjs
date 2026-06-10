#!/usr/bin/env node
// Goal 51: 신규 raw `console.log(chalk…)` 재도입 차단 (선례: check-no-raw-json-parse.mjs / check-no-silent-fallback.mjs).
// 이유: src/utils/logger.ts 가 출력 SoT — 모든 렌더는 logger 단일 sink 를 거쳐야
//       조용한 모드·테스트 캡처를 한 지점에서 제어할 수 있다. raw console.log(chalk…) 는 이 지점을 우회한다.
//
// v0 = 보수적 탐지 + 리포트 우선(과안정화 경계). 기존 다수 raw 출력 부채가 크므로 바로 HARD 게이트로 안 건다.
//   기본 exit 0(현황 리포트), --strict 면 exit 1. 의도된 raw 출력은 `// vhk-allow-raw-output: <이유>` 주석으로 통과.
//   logger SoT 본인(src/utils/logger.ts)은 sink 가 console.log 를 호출하지만 `console.log(chalk…)` 인접 패턴이 아니므로 미탐.
//
// 범위: src/**/*.ts 만. 생성물(scripts/*.mjs)은 self-contained 라 제외(ROOT=src 기본이라 자동 제외).
// 사용: node scripts/check-no-raw-output.mjs [scanRoot=src] [--strict]

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const ROOT = args.find((a) => !a.startsWith('--')) || 'src'

// console.log(chalk…) 만 대상 — console.error/warn 는 제외(에러 경로는 logger 와 별개).
// \s 가 개행 포함 → console.log(\n  chalk... 다중라인도 매칭.
const RAW = /console\.log\(\s*chalk\b/g
const ALLOW = 'vhk-allow-raw-output'

function tsFiles(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...tsFiles(p))
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

const root = ROOT
let files
try {
  files = statSync(root).isDirectory() ? tsFiles(root) : [root]
} catch {
  console.log(`[check-no-raw-output] 스캔 경로 없음: ${root}`)
  process.exit(0)
}

const hits = []
for (const file of files) {
  const text = readFileSync(file, 'utf-8')
  RAW.lastIndex = 0
  let m
  while ((m = RAW.exec(text))) {
    // 라인 주석(`//`) 안의 매치는 오탐 — 매치 앞에 주석 시작 `//` 가 있으면 스킵.
    // 단 'https://' 같은 URL 의 `//`(앞 글자가 `:`)는 주석이 아니므로 제외.
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1
    if (/(^|[^:/])\/\//.test(text.slice(lineStart, m.index))) continue
    // 화이트리스트: 매치 직전 ~160자 안에 `// vhk-allow-raw-output:` 있으면 의도된 raw 출력 → 통과.
    const before = text.slice(Math.max(0, m.index - 160), m.index)
    if (before.includes(ALLOW)) continue
    const line = text.slice(0, m.index).split('\n').length
    hits.push(`${file}:${line}`)
  }
}

if (hits.length === 0) {
  console.log(`[check-no-raw-output PASS] ${root}/ raw console.log(chalk…) 0건`)
  process.exit(0)
}

const head = strict ? 'FAIL' : 'REPORT'
console.log(`[check-no-raw-output ${head}] raw console.log(chalk…) ${hits.length}건 (logger SoT 우회):`)
for (const h of hits) console.log('  ' + h)
console.log(`  → import { log } from "../utils/logger.js"; log.plain(chalk…) / log.info(…) 로 교체,`)
console.log(`     의도된 raw 출력이면 직전 줄에 \`// ${ALLOW}: <이유>\` 추가.`)
if (strict) process.exit(1)
console.log(`  (리포트 전용 — baseline. HARD 차단은 --strict 또는 baseline 정리 후 승격.)`)
process.exit(0)
