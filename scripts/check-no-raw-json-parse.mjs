#!/usr/bin/env node
// 머지 게이트 — src/ 에 raw JSON.parse(readFileSync(...)) 재도입 금지.
// 이유: PowerShell `Set-Content -Encoding utf8` 의 UTF-8 BOM·손상 JSON 에서 JSON.parse 가 throw.
//       readJsonFile(BOM-safe, src/lib/read-json.ts) 로 읽어야 verify 등이 안 죽는다.
//       (v1.7.0 verify 증거화에서 재발 → #92 리뷰. 패턴: docs/patterns/build-json-parse-bom-strip.md)
// 범위: src/**/*.ts 만 — readJsonFile import 가능 영역. 생성물(scripts/*.mjs)은 self-contained 라 제외.
// 통과 규칙: parse 가 readFileSync 를 **직접** 감싸는 인접 패턴만 금지.
//           변수 경유(JSON.parse(stripBom(...)) / readJsonFile(...))는 허용 → BOM-safe 우회 강제.
// 사용: node scripts/check-no-raw-json-parse.mjs [scanRoot=src]
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.argv[2] || 'src'
const FORBIDDEN = /JSON\.parse\(\s*(?:fs\.)?readFileSync/g

function tsFiles(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...tsFiles(p))
    else if (e.name.endsWith('.ts')) out.push(p)
  }
  return out
}

const hits = []
for (const file of tsFiles(ROOT)) {
  const text = readFileSync(file, 'utf-8')
  FORBIDDEN.lastIndex = 0
  let m
  while ((m = FORBIDDEN.exec(text))) {
    const line = text.slice(0, m.index).split('\n').length
    hits.push(`${file}:${line}`)
  }
}

if (hits.length) {
  console.error('[check-no-raw-json-parse FAIL] raw JSON.parse(readFileSync(...)) 발견 — readJsonFile(BOM-safe) 로 교체:')
  for (const h of hits) console.error('  ' + h)
  console.error('  → import { readJsonFile } from "../lib/read-json.js"; const x = readJsonFile(path)')
  process.exit(1)
}
console.log(`[check-no-raw-json-parse PASS] ${ROOT}/ raw JSON.parse(readFileSync) 0건`)
