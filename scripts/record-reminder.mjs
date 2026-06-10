#!/usr/bin/env node
// scripts/record-reminder.mjs — 기록 자문 넛지 (governance-v2 T1, Stop hook).
// 턴 종료 시점에 미커밋 실질 코드변경이 있는데 오늘자 dev log(docs/log/<오늘>-*.md)가
// 레포에 없으면 안내만 출력한다. 차단하지 않음 — 항상 exit 0 (차단은 check-records.mjs 소관).
// ADR/트러블슈팅 후보 감지는 `vhk work handoff` 가 담당(RFC 0051) — 여기선 중복 감지 없이 참조만.
import { existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { CODE_GLOBS, localToday } from './check-records.mjs'

/** 워킹트리(스테이지 포함) 변경 중 실질 코드변경만. */
export function uncommittedCodeChanges(porcelainLines) {
  const files = porcelainLines.filter(Boolean).map((line) => {
    const body = line.slice(3)
    const arrow = body.indexOf(' -> ')
    const raw = arrow >= 0 ? body.slice(arrow + 4) : body
    return raw.replace(/^"|"$/g, '')
  })
  return files.filter((f) => CODE_GLOBS.some((re) => re.test(f)))
}

export function hasTodayDevlog(logDir, today) {
  if (!existsSync(logDir)) return false
  try {
    return readdirSync(logDir).some((n) => n.startsWith(`${today}-`) && n.endsWith('.md'))
  } catch {
    return false
  }
}

function main() {
  const out = execFileSync('git', ['status', '--porcelain', '-uall'], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const code = uncommittedCodeChanges(out.split(/\r?\n/))
  if (code.length === 0) return

  const today = localToday()
  if (hasTodayDevlog('docs/log', today)) return

  console.log(`[record-reminder] 미커밋 코드변경 ${code.length}건, 오늘자 dev log(docs/log/${today}-*.md) 없음.`)
  console.log('  → 커밋 전 dev log 작성 권장(check-records 가 커밋 시점에 차단함).')
  console.log('  → 교훈이 있으면 vhk learn 으로 졸업, ADR/트러블슈팅 후보는 vhk work handoff 가 보고(RFC 0051).')
}

// 자문 전용 — 어떤 경우에도 exit 0 (Stop hook 차단 금지).
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) {
  try {
    main()
  } catch {
    /* 자문 게이트 내부 오류는 침묵 — 작업 흐름에 영향 0 */
  }
  process.exit(0)
}
