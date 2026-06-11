#!/usr/bin/env node
// scripts/check-commands-doc.mjs — COMMANDS.md ↔ src/commands/*.ts drift 리포트 (governance T3).
// 새 명령이 생겼는데 COMMANDS.md(사용법 SoT)에 안 실리면 사용자는 명령의 존재를 모른다.
//
// v0 = 리포트 우선(check-no-raw-output 선례): 실측 기준 기존 미문서 명령 32건(부채)이라
// 바로 HARD 게이트로 안 건다 — 기본 exit 0 리포트, --strict 면 exit 1. 부채 정리 후 승격.
// 알려진 한계(v0): 명령 우주를 src/commands 파일명에서 유도 — command-registry.ts 의
// TOP_LEVEL_COMMANDS 가 진짜 SoT 라 ①비명령 파일이 부채로 과대집계 ②동명 파일 없는 명령
// (recall·blocker 등)은 검사 밖. --strict 승격 전에 registry 기반(vitest 테스트 고도)으로
// 재구현할 것 — 리뷰 발견, 후속.
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
