#!/usr/bin/env node
// scripts/check-records.mjs — 기록 집행 게이트 (governance-v2 T1).
// Claude Code PreToolUse hook(Bash|PowerShell)으로 발동: 명령이 `git commit` 이고
// staged 에 실질 코드변경이 있는데 세션 dev log(docs/log/<오늘|어제>-*.md)가 미스테이지면
// exit 2 로 커밋을 차단한다(stderr 사유가 AI 에게 전달됨). `[skip-record]` 토큰 = 의도된 우회.
//
// hook 외 단독 실행(stdin 없음)도 지원 — 현재 staged 상태를 그대로 평가(수동 게이트/e2e 용).
//
// 설계 결정:
// - 차단 exit code = 2 (spec 초안의 1 에서 수정): Claude Code PreToolUse 는 exit 2 만
//   차단으로 해석하고 stderr 를 모델에 피드백, exit 1 은 비차단 경고라 집행이 안 됨.
// - 코드변경 글롭 = src/** + scripts/check-*.(mjs|sh) — 초안의 src/commands·src/lib 한정은
//   src/mcp·i18n·templates 누락(이 PR 자신이 글롭 밖 src 파일을 변경했음 — 리뷰 발견)이라 확대.
//   tests/·docs/·goals/ 는 여전히 제외(과안정화 경계).
// - dev log 날짜 = 오늘 또는 어제 허용: 자정 넘긴 연속 세션이 전날 파일에 append 하는
//   관행(append-only)과 충돌 방지 — 단 그 파일이 이 커밋에 staged 일 때만 인정.
// - fail-open: 게이트 자체 버그/손상 hook 페이로드는 exit 0 (작업을 못 막음).
//   의도된 누락만 fail-closed. 알려진 한계(vhk save·MCP 경유 커밋, cd 후 worktree 커밋의
//   cwd 불일치)는 ADR-001 §결과 참조 — pre-commit L2 재검토 트리거.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { isMainModule, unquoteGitPath, porcelainPath, hardStopActive } from './_lib.mjs'

// ─── 순수 판정부 (테스트 대상) ────────────────────────────────────────────────

// record-reminder.mjs 도 이 글롭을 import — "실질 코드변경" 판정 단일 SoT.
export const CODE_GLOBS = [/^src\//, /^scripts\/check-[^/]+\.(mjs|sh)$/]

export function localToday() {
  return localDateOffset(0)
}

function localDateOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// PS `if ($?) { git commit }`·bash 서브셸 `(git commit)` 같은 권장 체인이 빠지지 않게
// 세그먼트 선두의 제어 래퍼 토큰은 건너뛴다. 따옴표 내부는 구분 못 하는 한계(문자열 속
// `; git commit` 오감지)는 수용 — staged 위반 상태에서만 발현 + [skip-record] 탈출구.
const WRAPPER_TOKEN = /^(if|then|do|else|elif|fi|done|try|finally|\{|\(|\(\$\?\)|\$\?|&&|\|\|)$/

/** 명령 문자열에서 git 서브커맨드 호출 감지 + 전역 `-C <path>` 추출 (commit/add 공용 토크나이저). */
export function findGitSubcommand(cmd, sub) {
  if (!cmd) return { found: false, cPath: null }
  const segments = String(cmd).split(/(?:&&|\|\||[;|\n])/)
  for (const seg of segments) {
    const tokens = seg.trim().split(/\s+/).filter(Boolean)
    let i = 0
    while (i < tokens.length && WRAPPER_TOKEN.test(tokens[i])) i++
    // `(git commit ...)` 처럼 토큰에 괄호가 붙은 형태
    if (tokens[i]?.startsWith('(')) tokens[i] = tokens[i].slice(1)
    if (tokens[i] === 'rtk') i++
    if (tokens[i] !== 'git') continue
    i++
    let cPath = null
    while (i < tokens.length) {
      const t = tokens[i]
      if (t === '-C') {
        cPath = tokens[i + 1] ?? null
        i += 2
        continue
      }
      if (t === '-c') {
        i += 2
        continue
      }
      if (t.startsWith('-')) {
        i += 1
        continue
      }
      break
    }
    if (tokens[i] === sub) return { found: true, cPath: cPath ? unquoteGitPath(cPath) : null }
  }
  return { found: false, cPath: null }
}

export function isGitCommitCommand(cmd) {
  return findGitSubcommand(cmd, 'commit').found
}

function isCodeChange(file) {
  return CODE_GLOBS.some((re) => re.test(file))
}

function isSessionDevlog(file, dates) {
  return dates.some((d) => file.startsWith(`docs/log/${d}-`)) && file.endsWith('.md')
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
  // 자정 넘긴 연속 세션의 전날 devlog append 허용 — staged 일 때만(스테일 자동 인정 아님).
  const dates = today === localToday() ? [today, localDateOffset(-1)] : [today]
  if (stagedFiles.some((f) => isSessionDevlog(f, dates))) {
    return { ok: true, reason: '세션 dev log 스테이지됨' }
  }
  return {
    ok: false,
    reason:
      `실질 코드변경 ${codeFiles.length}건이 staged 인데 세션 dev log(docs/log/${today}-*.md)가 ` +
      `스테이지되지 않음. dev log 를 작성·스테이지하거나, 사소한 변경이면 커밋 메시지에 [skip-record] 를 넣으세요.`,
    codeFiles,
  }
}

// ─── IO 부 (hook/단독 실행) ──────────────────────────────────────────────────

function gitRaw(args, cPath) {
  // core.quotepath=false: 한글 등 비ASCII 경로의 octal 이스케이프("docs/\355…") 방지 —
  // 켜져 있으면 한글 dev log 가 미스테이지로 오판돼 false block (리뷰 실측 발견).
  const base = cPath ? ['-C', cPath] : []
  return execFileSync('git', [...base, '-c', 'core.quotepath=false', ...args], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

function collectFiles(commandText, cPath) {
  const staged = gitRaw(['diff', '--cached', '--name-only'], cPath)
    .split(/\r?\n/)
    .map((l) => unquoteGitPath(l.trim()))
    .filter(Boolean)
  // `git add …; git commit` 체인은 hook 시점에 add 가 아직 안 돌았음 → 워킹트리 변경도 합산.
  // add 감지도 commit 과 같은 토크나이저 — 커밋 메시지 속 "add" 단어 오매칭 방지(리뷰 발견).
  // -uall: untracked 디렉토리가 `?? src/` 로 접히면 글롭 매칭 불가 → 파일 단위 강제.
  if (commandText && findGitSubcommand(commandText, 'add').found) {
    const wt = gitRaw(['status', '--porcelain', '-uall'], cPath)
      .split(/\r?\n/)
      .filter(Boolean)
      .map(porcelainPath)
    return [...new Set([...staged, ...wt])]
  }
  return staged
}

function main() {
  let raw = ''
  try {
    if (!process.stdin.isTTY) raw = readFileSync(0, 'utf-8')
  } catch {
    raw = ''
  }

  let input = null
  if (raw.trim()) {
    try {
      input = JSON.parse(raw)
    } catch {
      // hook 페이로드 손상 — fail-open (예전엔 단독모드 폴백 → 모든 명령 차단 위험이 있었음).
      process.exit(0)
    }
  }

  const commandText = input?.tool_input?.command ?? process.argv.slice(2).join(' ')

  // hook 은 모든 Bash/PowerShell 호출에 발동 → 커밋이 아니면 즉시 통과.
  const commit = findGitSubcommand(commandText, 'commit')
  if (input && !commit.found) process.exit(0)

  // HARD_STOP = 모든 자동화 중단 — 커밋 평가 지점에서도 차단(.vhk/README 보장 이행).
  if (hardStopActive()) {
    console.error('[check-records BLOCK] .vhk/HARD_STOP 활성 — 자동 커밋 중단. 해제는 vhk resume --confirm (사람).')
    process.exit(2)
  }

  const files = collectFiles(commandText, commit.cPath)
  const verdict = evaluateRecords({ stagedFiles: files, commandText, today: localToday() })

  if (verdict.ok) {
    process.exit(0)
  }
  console.error(`[check-records BLOCK] ${verdict.reason}`)
  for (const f of verdict.codeFiles ?? []) console.error(`  - ${f}`)
  process.exit(2)
}

if (isMainModule(import.meta.url)) {
  try {
    main()
  } catch (err) {
    // fail-open: 게이트 자체 결함으로 작업을 막지 않는다(의도된 누락만 차단).
    console.error(`[check-records] 게이트 내부 오류 — fail-open: ${err?.message ?? err}`)
    process.exit(0)
  }
}
