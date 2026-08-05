// RFC 0061 T1 — 기록 집행 커밋훅(record-net) 템플릿.
// 두 산출물: ① .vhk/hooks/record-check.mjs (판정 본체, 버전관리됨)
//           ② .git/hooks/commit-msg (얇은 shim — git 이 직접 실행)
// commit-msg 훅인 이유: pre-commit 은 커밋 메시지를 못 보므로 [skip-record] 우회 판정 불가.
// 전부 LF 고정 — 셔뱅+CRLF 조합이 Windows CI 를 전멸시킨 교훈(governance-v2, .gitattributes).

/** shim 식별 마커 — 이 마커가 있는 훅만 vhk 가 갱신 대상으로 삼는다(남의 훅 불가침). */
export const RECORD_HOOK_MARKER = 'vhk:record-net'

/**
 * `.vhk/hooks/record-check.mjs` — 자립형(의존성 0) 판정 스크립트.
 * vhk 본체 scripts/check-records.mjs 의 판정 규칙 이식: 실질 코드변경(src/**)이
 * 스테이지됐는데 세션일지(docs/log/오늘|어제-*.md)가 미스테이지면 차단.
 * 차단 = exit 1 (git 훅은 비0 이면 커밋 중단) · stderr = AI 작업지시서.
 * fail-open: 게이트 자체 결함은 exit 0 — 의도된 누락만 막는다.
 */
export function RECORD_CHECK_TEMPLATE(): string {
  return [
    '#!/usr/bin/env node',
    '// .vhk/hooks/record-check.mjs — 기록 집행 커밋 게이트 (vhk record-net, RFC 0061)',
    '// git commit-msg 훅이 호출: node .vhk/hooks/record-check.mjs <커밋메시지파일>',
    '// 도구 불가지론: Claude Code·Cursor·Codex 어디서 커밋해도 git 이 실행한다.',
    "import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs'",
    "import { execFileSync } from 'node:child_process'",
    '',
    '// 실질 코드변경 판정 글롭 — 문서·테스트만의 커밋은 막지 않는다(과안정화 경계).',
    'const CODE_GLOBS = [/^src\\//]',
    '',
    'function localDateOffset(days) {',
    '  const d = new Date()',
    '  d.setDate(d.getDate() + days)',
    "  const p = (n) => String(n).padStart(2, '0')",
    '  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`',
    '}',
    '',
    'function gitOut(args) {',
    "  return execFileSync('git', args, { encoding: 'utf-8' })",
    '}',
    '',
    'function recordCommit(ran, reason, changedFiles = 0, sessionRecord = false, bypassed = false) {',
    '  try {',
    "    mkdirSync('.vhk/events', { recursive: true })",
    "    appendFileSync('.vhk/events/ai-actions.jsonl', JSON.stringify({",
    '      ts: new Date().toISOString(),',
    "      action: 'commit',",
    "      channel: 'git-hook',",
    "      guard: 'record-net',",
    "      ran, reason, result: ran ? 'ALLOW' : 'BLOCK', changedFiles, sessionRecord, bypassed,",
    "    }) + '\\n', 'utf-8')",
    '  } catch { /* 행동 기록 실패가 커밋 허용·차단 판정을 바꾸지 않음 */ }',
    '}',
    '',
    'function main() {',
    '  // HARD_STOP 은 우회 토큰보다 먼저 — 자동화 전면 중단 상태에선 커밋 자체를 막는다.',
    "  if (existsSync('.vhk/HARD_STOP')) {",
    "    recordCommit(false, 'hard-stop')",
    "    console.error('[record-check BLOCK] .vhk/HARD_STOP 활성 — 커밋 중단. 해제는 vhk resume --confirm (사람만).')",
    '    process.exit(1)',
    '  }',
    '',
    '  // merge/pull·cherry-pick·revert·rebase 는 남의 작업 병합이라 새 세션일지가 없는 게 정상 —',
    '  // 차단하면 사용자가 MERGE_HEAD 걸린 중간 상태에 갇힌다(적대검증 #1 실측). 화이트리스트 통과.',
    '  // rev-parse --git-path: worktree(.git 파일)에서도 올바른 경로를 준다.',
    "  for (const m of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD', 'rebase-merge', 'rebase-apply']) {",
    "    if (existsSync(gitOut(['rev-parse', '--git-path', m]).trim())) { recordCommit(true, 'git-operation'); process.exit(0) }",
    '  }',
    '',
    '  const msgFile = process.argv[2]',
    "  const message = msgFile && existsSync(msgFile) ? readFileSync(msgFile, 'utf-8') : ''",
    '',
    '  // core.quotepath=false: 한글 등 비ASCII 경로가 octal 이스케이프되면 세션일지가',
    '  // 미스테이지로 오판돼 false block(vhk 본체 실측 교훈).',
    '  const staged = execFileSync(',
    "    'git',",
    "    ['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only'],",
    "    { encoding: 'utf-8' }",
    '  )',
    '    .split(/\\r?\\n/)',
    '    .map((l) => l.trim().replace(/^"|"$/g, \'\'))',
    '    .filter(Boolean)',
    '',
    '  const codeFiles = staged.filter((f) => CODE_GLOBS.some((re) => re.test(f)))',
    "  if (message.includes('[skip-record]')) { recordCommit(true, 'skip-record', codeFiles.length, false, true); process.exit(0) }",
    "  if (codeFiles.length === 0) { recordCommit(true, 'no-code-change'); process.exit(0) }",
    '',
    '  // 자정 넘긴 연속 세션의 전날 일지 append 허용.',
    '  const dates = [localDateOffset(0), localDateOffset(-1)]',
    "  const isLog = (f) => dates.some((d) => f.startsWith(`docs/log/${d}-`)) && f.endsWith('.md')",
    "  if (staged.some(isLog)) { recordCommit(true, 'session-record', codeFiles.length, true); process.exit(0) }",
    '',
    '  // amend·같은 날 후속 커밋 완화: 오늘/어제 일지가 이미 HEAD 커밋에 들어 있으면 인정.',
    '  // amend 시 diff --cached 는 신규 스테이지분만 보여줘 일지가 안 보이는 false block',
    '  // (적대검증 #2 실측) 회피 — 일지 존재가 목적이지 커밋마다 일지 수정 강제가 목적이 아님.',
    '  // HEAD 존재를 -q(quiet)로 먼저 확인 — 첫 커밋(HEAD 없음)에 show HEAD 를 부르면 git 이',
    "  // fatal(\"ambiguous argument 'HEAD'\")을 stderr 로 흘려 정상 차단을 실패처럼 보이게 한다(도그푸딩 P2).",
    '  let hasHead = false',
    "  try { execFileSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { stdio: 'ignore' }); hasHead = true } catch { /* 첫 커밋 */ }",
    '  if (hasHead) {',
    '    try {',
    '      const headFiles = gitOut([',
    "        '-c', 'core.quotepath=false', 'show', '--name-only', '--format=', 'HEAD',",
    '      ])',
    '        .split(/\\r?\\n/)',
    '        .map((l) => l.trim().replace(/^"|"$/g, \'\'))',
    '        .filter(Boolean)',
    "      if (headFiles.some(isLog)) { recordCommit(true, 'prior-session-record', codeFiles.length, true); process.exit(0) }",
    '    } catch { /* show 방어 — 완화 없이 아래 차단 판정으로 진행 */ }',
    '  }',
    '',
    '  // 차단 사유 = AI 작업지시서 — 커밋 버튼은 AI 가 누르므로 마찰은 AI 가 흡수한다(RFC 0061 §2).',
    "  recordCommit(false, 'missing-session-record', codeFiles.length)",
    '  console.error(',
    '    `[record-check BLOCK] 실질 코드변경 ${codeFiles.length}건이 스테이지됐는데 오늘 세션일지(docs/log/${dates[0]}-*.md)가 스테이지되지 않았습니다.`',
    '  )',
    "  for (const f of codeFiles) console.error(`  - ${f}`)",
    '  console.error(',
    "    'AI 작업지시: ① docs/log/' + dates[0] + '-<작업명>.md 에 이 세션의 작업 내역을 기록 ② git add 로 스테이지 ③ 커밋 재시도. 사소·문서성 변경이면 커밋 메시지에 [skip-record] 를 넣어 우회하세요.'",
    '  )',
    '  process.exit(1)',
    '}',
    '',
    'try {',
    '  main()',
    '} catch (err) {',
    '  // fail-open: 게이트 자체 결함(git 부재 등)이 작업을 막지 않는다 — 의도된 누락만 차단.',
    '  console.error(`[record-check] 게이트 내부 오류 — fail-open: ${err?.message ?? err}`)',
    '  process.exit(0)',
    '}',
    '',
  ].join('\n')
}

/**
 * `.git/hooks/commit-msg` shim — node 가 없거나 판정 스크립트가 없으면 조용히 통과(fail-open).
 * exec 하지 않고 node 종료코드를 그대로 전달한다.
 */
export function COMMIT_MSG_HOOK_TEMPLATE(): string {
  return [
    '#!/bin/sh',
    `# ${RECORD_HOOK_MARKER} — vhk 가 관리하는 기록 집행 훅(RFC 0061). 이 마커를 지우면 vhk 는 이 파일을 다시 건드리지 않습니다.`,
    '# 세션일지 없는 실질 코드변경 커밋을 차단합니다. 우회: 커밋 메시지에 [skip-record].',
    'command -v node >/dev/null 2>&1 || exit 0',
    '[ -f ".vhk/hooks/record-check.mjs" ] || exit 0',
    'exec node ".vhk/hooks/record-check.mjs" "$1"',
    '',
  ].join('\n')
}
