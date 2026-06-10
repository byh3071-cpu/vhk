#!/usr/bin/env node
// scripts/check-commands-doc.mjs — COMMANDS.md ↔ src/commands/*.ts drift 리포트 (governance T3).
// 새 명령이 생겼는데 COMMANDS.md(사용법 SoT)에 안 실리면 사용자는 명령의 존재를 모른다.
//
// v0 = 리포트 우선(check-no-raw-output 선례): 실측 기준 기존 미문서 명령 29건(부채)이라
// 바로 HARD 게이트로 안 건다 — 기본 exit 0 리포트, --strict 면 exit 1. 부채 정리 후 승격.
// 매칭은 영문 파일명 기준(한글 별칭만 실린 행은 미커버로 집계됨 — 영문 명령 1회 병기 권장).
// 사용: node scripts/check-commands-doc.mjs [--strict]
import { readdirSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** 명령 이름이 문서 텍스트에 단어 경계로 등장하는지 — `diff-cover` 등장이 `diff` 를 커버하지 않게. */
export function findUndocumentedCommands(names, docText) {
  return names.filter((name) => {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return !new RegExp(`(?<![\\w-])${esc}(?![\\w-])`).test(docText)
  })
}

function main() {
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

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) main()
