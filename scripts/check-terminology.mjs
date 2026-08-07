#!/usr/bin/env node
// scripts/check-terminology.mjs — ADR-011·ADR-015 사용자 표면 용어 회귀 게이트.
//
// ADR-011 이 문서·CLI 출력의 조어를 업계 통용어로 전면 교체했다. 교체는 한 번 하면 끝이지만
// **되돌아오는 것**이 문제다 — 새 문장을 쓸 때 옛 어휘가 손에 붙어 있으면 조용히 다시 섞인다.
// 그래서 종전 용어가 외부 표면에 다시 나타나면 실패시킨다.
//
// 대상은 **외부 표면만**이다(ADR-011 §회귀 방지, ADR-015 §결정).
//   - 외부 문서: README.md · COMMANDS.md · README.en.md · VISION.md · docs/PRD.md
//   - CLI 출력: src/i18n/ko.ts · src/lib/nlp-router.ts · src/commands/verify.ts
// ADR·RFC·goal 카드는 제외한다. ADR 은 append-only 라 과거 문서를 고칠 수 없고, 고치면
// 그 자체가 규율 위반이다. 대응표(ADR-011·ADR-015)가 두 어휘의 대조를 담당한다.
//
// 사용: node scripts/check-terminology.mjs [파일...]  (인자 없으면 기본 대상)
import { existsSync, readFileSync } from 'node:fs'
import { isMainModule } from './_lib.mjs'

/** 검사 대상 — 외부 문서 + CLI 출력. 없는 파일은 건너뛴다(소비자 레포 이식성). */
export const TERMINOLOGY_TARGETS = [
  'README.md',
  'COMMANDS.md',
  'README.en.md',
  'VISION.md',
  'docs/PRD.md',
  'src/i18n/ko.ts',
  'src/lib/nlp-router.ts',
  'src/commands/verify.ts',
]

/**
 * ADR-011·ADR-015 대응표. `pattern` 은 종전 용어, `to` 는 대체어.
 *
 * 주의 — 자기 자신 예외: 이 파일과 그 테스트는 종전 용어를 **데이터로** 담으므로 대상에서
 * 뺀다(TERMINOLOGY_TARGETS 에 없음). 검사기가 자기 자신을 잡는 자기모순 방지.
 */
const ADR_011_TERMS = [
  { pattern: /거짓\s*완료/g, to: '완료 보고 검증 / 허위 완료 보고' },
  { pattern: /기계증거\s*영수증/g, to: '검증 리포트' },
  { pattern: /증거\s*영수증/g, to: '검증 리포트' },
  { pattern: /Evidence\s+Receipt/gi, to: '검증 리포트' },
  { pattern: /감사층/g, to: '검증 계층' },
  { pattern: /자문형/g, to: '경고만' },
  { pattern: /강제형/g, to: '빌드 실패 처리' },
  { pattern: /규칙\s*집행\s*파이프/g, to: '규칙을 문서가 아니라 검사로' },
  { pattern: /승급\s*다이얼/g, to: '권한 단계' },
  { pattern: /티어\s*레인/g, to: '위험도별 승인 규칙' },
  { pattern: /트립와이어/g, to: '중단 기준' },
  { pattern: /킬게이트/g, to: '중단 판정 기준' },
  { pattern: /드리프트/g, to: '설정 불일치(drift) — goal 상태 맥락이면 상태 불일치(drift)' },
  { pattern: /의도\s*장갑/g, to: '(폐기 — "의도 대조"로 서술)' },
]

export const OUTPUT_LANGUAGE_TERMS = [
  { pattern: /미착수/g, to: '아직 시작하지 않은 작업' },
  { pattern: /최고령/g, to: '가장 오래된 작업' },
  { pattern: /반복 무시/g, to: '같은 문제가 다시 발생함' },
  { pattern: /권고\s*무시\s*기록/g, to: '알림을 숨김' },
  { pattern: /미반영/g, to: '계속됨 또는 최신 변경사항이 반영되지 않음' },
]

export const FORBIDDEN_TERMS = [...ADR_011_TERMS, ...OUTPUT_LANGUAGE_TERMS]

/** 한 파일 내용에서 종전 용어 위반을 찾는다. 반환: {line, term, to, text}[] */
export function findLegacyTerms(content, terms = FORBIDDEN_TERMS) {
  const out = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const { pattern, to } of terms) {
      // 전역 정규식은 lastIndex 가 남으므로 매 줄 새로 만든다(상태 누수로 홀수 줄만 검사되는 함정).
      const re = new RegExp(pattern.source, pattern.flags.replace('g', ''))
      const m = re.exec(line)
      if (m) out.push({ line: i + 1, term: m[0], to, text: line.trim().slice(0, 120) })
    }
  }
  return out
}

function main() {
  const explicitTargets = process.argv.slice(2)
  const targets = explicitTargets.length > 0 ? explicitTargets : TERMINOLOGY_TARGETS
  let total = 0
  let scanned = 0

  for (const file of targets) {
    if (!existsSync(file)) continue
    scanned++
    let content
    try {
      content = readFileSync(file, 'utf-8')
    } catch (err) {
      // 읽기 실패는 판정 불가 — 경고 후 계속(검사기가 작업을 못 막게).
      console.log(`  (스킵) ${file}: 읽기 실패 — ${err?.code ?? err}`)
      continue
    }
    const normalizedFile = file.replaceAll('\\', '/')
    const usesOutputLanguageTermsOnly = normalizedFile.endsWith('/COMMANDS.md') ||
      normalizedFile === 'COMMANDS.md' || normalizedFile.endsWith('/src/commands/verify.ts') ||
      normalizedFile === 'src/commands/verify.ts'
    const hits = findLegacyTerms(
      content,
      usesOutputLanguageTermsOnly ? OUTPUT_LANGUAGE_TERMS : FORBIDDEN_TERMS,
    )
    if (hits.length === 0) continue
    total += hits.length
    console.log(`\n✗ ${file} — 종전 용어 ${hits.length}건`)
    for (const h of hits) {
      console.log(`    ${file}:${h.line}  "${h.term}" → ${h.to}`)
      console.log(`      ${h.text}`)
    }
  }

  if (total > 0) {
    console.log(`\n[check-terminology] 사용자 표면 용어 ${total}건 — 대응표대로 교체하세요.`)
    console.log('  대응표: docs/adr/ADR-011-terminology.md · docs/adr/ADR-015-user-facing-output-language.md')
    console.log('  대상은 외부 표면만입니다(ADR·RFC 는 append-only 라 제외).')
    process.exit(1)
  }
  console.log(`[check-terminology] 통과 — 외부 표면 ${scanned}개 파일에 금지된 표현 0건 (ADR-011·ADR-015)`)
}

if (isMainModule(import.meta.url)) {
  main()
}
