/*
 * 원격 기록 집행 게이트 (#526).
 *
 * 로컬 커밋은 .githooks 의 check-records 가 세션 기록을 강제한다. 그런데 그 기록은
 * docs/devlog/ 와 .vhk/events/*.jsonl 로 전부 비추적이다(공개 경계 정책 — 개인 세션 기록은
 * 커밋하지 않는다). 클론만 받는 CI 와 원격 에이전트는 그 파일을 원리적으로 볼 수 없어서,
 * "기록했는가" 를 원격에서 검증하는 건 불가능하다. 훅을 CI 로 옮겨도 해결되지 않는다.
 *
 * 그래서 검증 축을 바꾼다. 비공개 세션 기록 대신 **추적되는 공개 기록물**을 요구한다 —
 * 코드가 바뀌었으면 CHANGELOG·docs·README·RULES 중 하나는 같이 움직여야 한다는 규칙이고,
 * 이건 클론에 그대로 들어오므로 원격 에이전트가 만든 PR 도 동일하게 걸린다.
 *
 * 커밋이 아니라 PR 전체 diff 를 본다: 이 레포는 논리 단위로 커밋을 쪼개서
 * 코드 커밋과 CHANGELOG 커밋이 분리되는 게 정상이다.
 *
 * 사용: node scripts/check-pr-record.mjs <baseSha> <headSha>
 */
import { execFileSync } from 'node:child_process'

/** 기록을 동반해야 하는 실질 변경. */
export const CODE_PATTERNS = [/^src\//, /^scripts\//]

/** 기록으로 인정하는 추적 산출물. */
export const RECORD_PATTERNS = [
  /^CHANGELOG\.md$/,
  /^README\.md$/,
  /^RULES\.md$/,
  /^docs\//,
]

/** 커밋 메시지에 이게 있으면 의도된 우회로 인정한다(로컬 훅과 같은 토큰). */
export const BYPASS_TOKEN = '[skip-record]'

export function classify(files) {
  const code = files.filter((f) => CODE_PATTERNS.some((p) => p.test(f)))
  const records = files.filter((f) => RECORD_PATTERNS.some((p) => p.test(f)))
  return { code, records }
}

/**
 * @returns {{ok: boolean, reason: string}}
 */
export function judge(files, commitMessages) {
  const { code, records } = classify(files)
  if (code.length === 0) return { ok: true, reason: '실질 코드변경 없음 — 검사 대상 아님' }
  if (records.length > 0) {
    return { ok: true, reason: `기록 동반 확인(${records.length}건): ${records.slice(0, 3).join(', ')}` }
  }
  if (commitMessages.some((m) => m.includes(BYPASS_TOKEN))) {
    return { ok: true, reason: `${BYPASS_TOKEN} — 의도된 우회` }
  }
  return {
    ok: false,
    reason:
      `실질 코드변경 ${code.length}건에 기록물 변경이 없습니다: ${code.slice(0, 5).join(', ')}\n`
      + 'CHANGELOG.md · README.md · RULES.md · docs/ 중 해당하는 곳을 함께 갱신하거나, '
      + `사소한 변경이면 커밋 메시지에 ${BYPASS_TOKEN} 을 넣으세요.\n`
      + '(로컬 훅의 세션 기록은 비추적이라 원격에서 확인할 수 없습니다 — #526)',
  }
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf-8' })
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const [base, head] = process.argv.slice(2)
  if (!base || !head) {
    process.stderr.write('사용법: node scripts/check-pr-record.mjs <baseSha> <headSha>\n')
    process.exit(1)
  }
  let files
  let messages
  try {
    files = git(['diff', '--name-only', `${base}...${head}`]).split('\n').filter(Boolean)
    messages = git(['log', '--format=%B', `${base}..${head}`]).split('\n')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // fail-open: 게이트 자체가 못 도는 상황(얕은 클론 등)으로 작업을 막지 않는다.
    process.stdout.write(`기록 게이트 실행 불가 — 통과 처리: ${message}\n`)
    process.exit(0)
  }
  const verdict = judge(files, messages)
  if (!verdict.ok) {
    process.stderr.write(`::error::${verdict.reason}\n`)
    process.exit(1)
  }
  process.stdout.write(`✅ ${verdict.reason}\n`)
}
