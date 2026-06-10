#!/usr/bin/env node
// scripts/check-records.mjs — 기록 집행 게이트 (governance-v2 T1).
// Claude Code PreToolUse hook(Bash|PowerShell)으로 발동: 명령이 `git commit` 이고
// staged 에 실질 코드변경이 있는데 오늘자 dev log(docs/log/<오늘>-*.md)가 미스테이지면
// exit 2 로 커밋을 차단한다(stderr 사유가 AI 에게 전달됨). `[skip-record]` 토큰 = 의도된 우회.
//
// hook 외 단독 실행(stdin 없음)도 지원 — 현재 staged 상태를 그대로 평가(수동 게이트/e2e 용).
//
// 설계 결정:
// - 차단 exit code = 2 (spec 초안의 1 에서 수정): Claude Code PreToolUse 는 exit 2 만
//   차단으로 해석하고 stderr 를 모델에 피드백, exit 1 은 비차단 경고라 집행이 안 됨.
// - 코드변경 글롭 = 스펙 보수기본값(src/commands·src/lib·scripts/check-goal-*.mjs).
//   tests/·docs/·goals/ 는 제외 — 과안정화(사소 변경까지 차단) 경계.
// - fail-open: 게이트 자체 버그/예외는 exit 0 (작업을 못 막음). 의도된 누락만 fail-closed.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// ─── 순수 판정부 (테스트 대상) ────────────────────────────────────────────────

// record-reminder.mjs 도 이 글롭을 import — "실질 코드변경" 판정 단일 SoT.
export const CODE_GLOBS = [/^src\/(commands|lib)\//, /^scripts\/check-goal-\d+\.mjs$/]

export function localToday() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 명령 문자열이 git commit 호출인가. 세그먼트 첫 토큰이 git(rtk 접두 허용)이고
 *  전역 플래그(-C path / -c k=v / --flag) 뒤 첫 서브커맨드가 commit 일 때만 true —
 *  `git log --grep commit` 같은 read-only 명령 오차단 방지. */
export function isGitCommitCommand(cmd) {
  if (!cmd) return false
  const segments = String(cmd).split(/(?:&&|\|\||[;|\n])/)
  for (const seg of segments) {
    const tokens = seg.trim().split(/\s+/)
    if (tokens[0] === 'rtk') tokens.shift()
    if (tokens[0] !== 'git') continue
    let i = 1
    while (i < tokens.length) {
      const t = tokens[i]
      if (t === '-C' || t === '-c') {
        i += 2
        continue
      }
      if (t.startsWith('-')) {
        i += 1
        continue
      }
      break
    }
    if (tokens[i] === 'commit') return true
  }
  return false
}

function isCodeChange(file) {
  return CODE_GLOBS.some((re) => re.test(file))
}

function isTodayDevlog(file, today) {
  return file.startsWith(`docs/log/${today}-`) && file.endsWith('.md')
}

/**
 * 기록 집행 판정. stagedFiles 는 repo-relative forward-slash 경로.
 * @returns {{ ok: boolean, reason: string, codeFiles?: string[] }}
 */
export function evaluateRecords({ stagedFiles, commandText, today }) {
  if (commandText && commandText.includes('[skip-record]')) {
    return { ok: true, reason: '[skip-record] 토큰 — 의도된 우회' }
  }
  const codeFiles = stagedFiles.filter(isCodeChange)
  if (codeFiles.length === 0) {
    return { ok: true, reason: '실질 코드변경 없음(문서/테스트만)' }
  }
  if (stagedFiles.some((f) => isTodayDevlog(f, today))) {
    return { ok: true, reason: '오늘자 dev log 스테이지됨' }
  }
  return {
    ok: false,
    reason:
      `실질 코드변경 ${codeFiles.length}건이 staged 인데 오늘자 dev log(docs/log/${today}-*.md)가 ` +
      `스테이지되지 않음. dev log 를 작성·스테이지하거나, 사소한 변경이면 커밋 메시지에 [skip-record] 를 넣으세요.`,
    codeFiles,
  }
}

// ─── IO 부 (hook/단독 실행) ──────────────────────────────────────────────────

function gitRaw(args) {
  return execFileSync('git', args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
}

/** porcelain 라인에서 경로 추출 — XY+공백 3칸 고정 오프셋(trim 금지), 리네임은 new 쪽. */
function porcelainPath(line) {
  const body = line.slice(3)
  const arrow = body.indexOf(' -> ')
  const raw = arrow >= 0 ? body.slice(arrow + 4) : body
  return raw.replace(/^"|"$/g, '')
}

function collectFiles(commandText) {
  const staged = gitRaw(['diff', '--cached', '--name-only'])
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  // `git add …; git commit` 체인은 hook 시점에 add 가 아직 안 돌았음 → 워킹트리 변경도 합산해 선반영.
  // -uall: untracked 디렉토리가 `?? src/` 로 접히면 개별 파일 글롭 매칭이 안 됨 → 파일 단위 강제.
  if (commandText && /\bgit\b[^;&|\n]*\badd\b/.test(commandText)) {
    const wt = gitRaw(['status', '--porcelain', '-uall'])
      .split(/\r?\n/)
      .filter(Boolean)
      .map(porcelainPath)
    return [...new Set([...staged, ...wt])]
  }
  return staged
}

function main() {
  let input = null
  try {
    if (!process.stdin.isTTY) {
      const raw = readFileSync(0, 'utf-8')
      if (raw.trim()) input = JSON.parse(raw)
    }
  } catch {
    input = null // stdin 파싱 실패 = hook 컨텍스트 아님 → 단독 게이트 모드
  }

  const commandText = input?.tool_input?.command ?? process.argv.slice(2).join(' ')

  // hook 은 모든 Bash/PowerShell 호출에 발동 → 커밋이 아니면 즉시 통과.
  if (input && !isGitCommitCommand(commandText)) process.exit(0)

  const files = collectFiles(commandText)
  const verdict = evaluateRecords({ stagedFiles: files, commandText, today: localToday() })

  if (verdict.ok) {
    process.exit(0)
  }
  console.error(`[check-records BLOCK] ${verdict.reason}`)
  for (const f of verdict.codeFiles ?? []) console.error(`  - ${f}`)
  process.exit(2)
}

// 테스트가 import 해도 부수효과 0 — 직접 실행일 때만 main (chokepoint 오염 방지).
const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) {
  try {
    main()
  } catch (err) {
    // fail-open: 게이트 자체 결함으로 작업을 막지 않는다(의도된 누락만 차단).
    console.error(`[check-records] 게이트 내부 오류 — fail-open: ${err?.message ?? err}`)
    process.exit(0)
  }
}
