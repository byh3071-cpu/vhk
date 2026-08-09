#!/usr/bin/env node
// scripts/record-reminder.mjs — 기록 자문 넛지 (governance-v2 T1, Stop hook).
// 턴 종료 시점에 미커밋 실질 코드변경이 있는데 세션 dev log(docs/devlog/<오늘>-*.md)가
// 레포에 없으면 안내만 한다. 차단하지 않음 — 항상 exit 0 (차단은 check-records.mjs 소관).
// 출력은 JSON systemMessage — Stop hook 의 plain stdout 은 transcript 전용이라 아무에게도
// 안 보임(리뷰 발견) → systemMessage 로 사용자 화면에 경고 노출.
// ADR/트러블슈팅 후보 감지는 `vhk work handoff` 가 담당(RFC 0051) — 여기선 참조만.
import { existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { CODE_GLOBS, localToday, SESSION_RECORD_DIR } from './check-records.mjs'
import { isMainModule, porcelainPath, hardStopActive } from './_lib.mjs'

/** 워킹트리(스테이지 포함) 변경 중 실질 코드변경만. */
export function uncommittedCodeChanges(porcelainLines) {
  return porcelainLines
    .filter(Boolean)
    .map(porcelainPath)
    .filter((f) => CODE_GLOBS.some((re) => re.test(f)))
}

export function hasTodayDevlog(logDir, today) {
  try {
    return readdirSync(logDir).some((n) => n.startsWith(`${today}-`) && n.endsWith('.md'))
  } catch {
    return false // 폴더 부재 포함 — 자문이라 조용히 false
  }
}

function main() {
  if (hardStopActive()) return // HARD_STOP = 자동화 침묵 (자문도 정지)

  // 비용 역순 방지: devlog 존재(readdir ~1ms)를 먼저 — 세션 중반 이후 공통 케이스에서
  // 매 턴 git 워킹트리 스캔을 통째로 생략 (리뷰 발견).
  const today = localToday()
  if (hasTodayDevlog(SESSION_RECORD_DIR, today)) return
  if (!existsSync(SESSION_RECORD_DIR) && !existsSync('.git')) return

  // pathspec 한정: CODE_GLOBS 가 src/·scripts/check-* 만 매칭하므로 스캔 범위도 거기로.
  const out = execFileSync(
    'git',
    ['-c', 'core.quotepath=false', 'status', '--porcelain', '-uall', '--', 'src', 'scripts'],
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
  )
  const code = uncommittedCodeChanges(out.split(/\r?\n/))
  if (code.length === 0) return

  const msg = [
    `[record-reminder] 미커밋 코드변경 ${code.length}건, 오늘자 dev log(${SESSION_RECORD_DIR}/${today}-*.md) 없음.`,
    '커밋 전 dev log 작성 권장(check-records 가 커밋 시점에 차단함).',
    '교훈은 vhk learn 으로 졸업, ADR/트러블슈팅 후보는 vhk work handoff 가 보고(RFC 0051).',
  ].join(' ')
  console.log(JSON.stringify({ systemMessage: msg }))
}

// 자문 전용 — 어떤 경우에도 exit 0 (Stop hook 차단 금지).
if (isMainModule(import.meta.url)) {
  try {
    main()
  } catch {
    /* 자문 게이트 내부 오류는 침묵 — 작업 흐름에 영향 0 */
  }
  process.exit(0)
}
