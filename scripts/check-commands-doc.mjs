#!/usr/bin/env node
// scripts/check-commands-doc.mjs — COMMANDS.md ↔ src/commands/*.ts drift 리포트 (governance T3).
// 새 명령이 생겼는데 COMMANDS.md(사용법 SoT)에 안 실리면 사용자는 명령의 존재를 모른다.
//
// Goal 64 이후: **SoT 강제는 tests/commands-doc.test.ts**(command-registry 기반, test:run 에
// 포함되어 CI 자동) — 이 스크립트는 파일명 기준 보조 리포트로 격하(독립 실행용).
// 한계(파일명≠registry·토큰 우연 매칭)는 그대로이므로 단독 판정 기준으로 쓰지 말 것.
// 사용: node scripts/check-commands-doc.mjs [--strict]
import { readdirSync, readFileSync } from 'node:fs'
import { isMainModule, ensureNoHardStop } from './_lib.mjs'

/** 명령 이름이 문서에 [\w-] 토큰 단위로 등장하는지 — `diff-cover` 등장이 `diff` 를 커버하지 않게. */
export function findUndocumentedCommands(names, docText) {
  const words = new Set(docText.split(/[^\w-]+/))
  return names.filter((name) => !words.has(name))
}

function main() {
  ensureNoHardStop('commands-doc')
  const strict = process.argv.includes('--strict')
  let names, doc
  try {
    names = readdirSync('src/commands')
      .filter((n) => n.endsWith('.ts') && !n.endsWith('.d.ts'))
      .map((n) => n.slice(0, -3))
    doc = readFileSync('COMMANDS.md', 'utf-8')
  } catch {
    console.log('[check-commands-doc] src/commands 또는 COMMANDS.md 없음 — 비적용 통과')
    process.exit(0)
  }

  const missing = findUndocumentedCommands(names, doc)
  if (missing.length === 0) {
    console.log(`[check-commands-doc PASS] ${names.length}개 명령 전부 COMMANDS.md 에 등장`)
    process.exit(0)
  }
  const head = strict ? 'FAIL' : 'REPORT'
  console.log(`[check-commands-doc ${head}] COMMANDS.md 미등장 명령 ${missing.length}/${names.length}건:`)
  console.log('  ' + missing.join(', '))
  console.log('  → COMMANDS.md 에 사용법 행 추가(영문 명령 1회 병기).')
  if (strict) process.exit(1)
  console.log('  (리포트 전용 — 부채 정리 후 --strict 승격.)')
  process.exit(0)
}

if (isMainModule(import.meta.url)) main()
