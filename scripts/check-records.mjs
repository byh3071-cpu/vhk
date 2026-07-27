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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
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

// PS `if ($?) { git commit }`·bash 서브셸 `(git commit)`·env 할당 접두(GIT_X=1 git commit)·
// 명령 래퍼(command/exec/time/env/nohup 등)가 빠지지 않게 세그먼트 선두의 비-git 토큰을
// 건너뛴다(적대검증 D1-1). 따옴표 내부는 구분 못 하는 한계(문자열 속 `; git commit` 오감지)는
// 수용 — staged 위반 상태에서만 발현 + [skip-record] 탈출구.
const WRAPPER_TOKEN =
  /^(if|then|do|else|elif|fi|done|try|finally|\{|\(|\(\$\?\)|\$\?|&&|\|\||command|exec|time|env|nohup|sudo|builtin|cmd)$/i
const ENV_ASSIGN = /^[A-Za-z_]\w*=/
const CMD_FLAG = /^\/[a-z]+$/i // cmd.exe /d /s /c

/** 따옴표 보존 토큰화 — `-C "a b/c"` 가 공백에서 쪼개지지 않게 (적대검증 D1-2). */
function tokenize(seg) {
  return seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
}

/** git/풀경로/git.exe 전부 git 으로 인식 (적대검증 D1-1). */
function isGitToken(t) {
  if (!t) return false
  const base = unquoteGitPath(t).split(/[\\/]/).pop()?.toLowerCase()
  return base === 'git' || base === 'git.exe'
}

/**
 * 명령 문자열에서 git 서브커맨드 호출 감지 + 전역 `-C <path>` 추출 + 서브커맨드 뒤 인자
 * (commit/add 공용 토크나이저). 줄연속(bash `\`·PS 백틱 + 개행)은 접어서 세그먼트 분리가
 * 한 명령을 못 쪼개게 한다(적대검증 D1-3).
 */
export function findGitSubcommand(cmd, sub) {
  if (!cmd) return { found: false, cPath: null, args: [] }
  const folded = String(cmd).replace(/(\\|`)\r?\n/g, ' ')
  const segments = folded.split(/(?:&&|\|\||[;|\n])/)
  for (const seg of segments) {
    const tokens = tokenize(seg)
    let i = 0
    while (
      i < tokens.length &&
      (WRAPPER_TOKEN.test(tokens[i]) || ENV_ASSIGN.test(tokens[i]) || CMD_FLAG.test(tokens[i]))
    )
      i++
    // `(git commit ...)` 처럼 토큰에 괄호가 붙은 형태
    if (tokens[i]?.startsWith('(')) tokens[i] = tokens[i].slice(1)
    if (tokens[i] === 'rtk') i++
    if (!isGitToken(tokens[i])) continue
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
    if (tokens[i] === sub) {
      return {
        found: true,
        cPath: cPath ? unquoteGitPath(cPath) : null,
        args: tokens.slice(i + 1).map(unquoteGitPath),
      }
    }
  }
  return { found: false, cPath: null, args: [] }
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

// 공개 경계 정리(ADR-008·ADR-010) 이후 세션 기록의 소재지. 비추적이다.
export const SESSION_RECORD_DIR = 'docs/devlog'

// 빈 파일로 게이트를 통과시키지 못하게 하는 최소 길이. 한 줄짜리 진짜 기록은 통과시키되
// touch 로 만든 0바이트 파일은 막는 선 — 강제력이 아니라 "실수 방지" 수준으로만 잡는다.
const MIN_RECORD_BYTES = 40

/**
 * 비추적 세션 기록 디렉터리에 해당 날짜의 **내용 있는** 기록이 있는지.
 *
 * why: 원래 이 게이트는 `docs/log/<날짜>-*.md` 의 **스테이지 여부**를 봤다. 그런데 공개 경계
 * 정리로 `docs/log/` 가 `.gitignore` 에 들어가면서 그 파일은 스테이지 자체가 불가능해졌다.
 * 즉 게이트가 **어떤 코드 커밋에서도 충족될 수 없는** 상태였고, 결과적으로 모든 커밋이
 * `[skip-record]` 우회를 강제당했다 — 집행하는 척만 하고 실제로는 아무것도 집행하지 않았다.
 *
 * 비추적 경로는 git 으로 검사할 수 없으므로 **파일시스템 존재**로 판정한다. 스테이지 검사보다
 * 강제력이 약한 것은 사실이나, 원래 검사도 파일 존재만 봤지 내용을 안 봤으므로 실질 차이는
 * 작다. 반대로 "충족 불가능한 게이트"는 규율 자체를 0 으로 만든다.
 */
export function hasSessionRecordOnDisk(dates, dir = SESSION_RECORD_DIR) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return false // 디렉터리 없음 = 기록 없음
  }
  return entries.some((name) => {
    if (!name.endsWith('.md')) return false
    if (!dates.some((d) => name.startsWith(`${d}-`))) return false
    try {
      return statSync(join(dir, name)).size >= MIN_RECORD_BYTES
    } catch {
      return false
    }
  })
}

/** 오늘 기준 인정 날짜 — 자정 넘긴 연속 세션이 전날 기록에 append 하는 관행 수용. */
export function acceptedRecordDates(today) {
  return today === localToday() ? [today, localDateOffset(-1)] : [today]
}

/**
 * 기록 집행 판정. stagedFiles 는 repo-relative forward-slash 경로.
 * hasSessionRecord 는 비추적 세션 기록 존재 여부(IO 는 호출부가 수행 — 이 함수는 순수 유지).
 * @returns {{ ok: boolean, reason: string, codeFiles?: string[] }}
 */
export function evaluateRecords({ stagedFiles, commandText, today, hasSessionRecord = false }) {
  if (commandText && commandText.includes('[skip-record]')) {
    return { ok: true, reason: '[skip-record] 토큰 — 의도된 우회' }
  }
  const codeFiles = stagedFiles.filter(isCodeChange)
  if (codeFiles.length === 0) {
    return { ok: true, reason: '실질 코드변경 없음(문서/테스트만)' }
  }
  const dates = acceptedRecordDates(today)
  // 레거시 경로(docs/log/)가 추적되던 시절의 커밋·저장소 호환 — 스테이지돼 있으면 그대로 인정.
  if (stagedFiles.some((f) => isSessionDevlog(f, dates))) {
    return { ok: true, reason: '세션 dev log 스테이지됨' }
  }
  if (hasSessionRecord) {
    return { ok: true, reason: `세션 기록 존재(${SESSION_RECORD_DIR}/, 비추적)` }
  }
  return {
    ok: false,
    reason:
      `실질 코드변경 ${codeFiles.length}건이 커밋 범위(staged 또는 add 예정)에 있는데 오늘자 세션 기록이 없음. ` +
      `${SESSION_RECORD_DIR}/${today}-<주제>.md 를 작성하거나, 사소한 변경이면 커밋 메시지에 [skip-record] 를 넣으세요.`,
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
  const add = commandText ? findGitSubcommand(commandText, 'add') : { found: false, args: [] }
  if (add.found) {
    const wt = gitRaw(['status', '--porcelain', '-uall'], cPath)
      .split(/\r?\n/)
      .filter(Boolean)
      .map(porcelainPath)
    // pathspec 이 명시된 add(`git add docs/x.md`)는 그 범위만 합산 — 무관한 더티 파일로
    // docs-only 커밋이 오차단되는 것 방지(적대검증 D1-4). -A/--all/-u/'.'/무인자는 전량.
    const spec = add.args.filter((a) => !a.startsWith('-'))
    const broad =
      spec.length === 0 ||
      spec.includes('.') ||
      add.args.some((a) => ['-A', '--all', '-u', '--update'].includes(a))
    const extra = broad
      ? wt
      : wt.filter((f) =>
          spec.some((p) => {
            const n = p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
            return f === n || f.startsWith(`${n}/`)
          })
        )
    return [...new Set([...staged, ...extra])]
  }
  return staged
}

/** git 메타경로(MERGE_HEAD 등) 존재 확인 — worktree(.git 파일)에서도 올바른 경로. */
function gitMetaExists(marker) {
  try {
    return existsSync(gitRaw(['rev-parse', '--git-path', marker], null).trim())
  } catch {
    return false
  }
}

/**
 * commit-msg 훅 모드 (goal 65 — 도구 무관 기록 집행 백스톱).
 * git 이 커밋 메시지 파일 경로를 $1 로 넘긴다. git 은 commit 시에만 이 훅을 호출하므로
 * "커밋인가" 판정이 불필요하고, staged 는 이미 최종 확정(add 체인 합산 불필요).
 * Claude 는 PreToolUse 가 먼저 잡으므로 이 훅은 비-Claude(Cursor/Codex/터미널) 커밋 +
 * PreToolUse 의 worktree cwd 불일치(파일 헤더 한계) 백스톱 — 훅은 항상 repo root 에서 실행됨.
 * 차단 exit 2 (git 훅은 비0 이면 커밋 중단).
 */
function commitMsgMode(msgPath) {
  // 자동화 전면 중단 — 우회 토큰보다 먼저.
  if (hardStopActive()) {
    console.error('[check-records BLOCK] .vhk/HARD_STOP 활성 — 자동 커밋 중단. 해제는 vhk resume --confirm (사람).')
    process.exit(2)
  }
  // merge/cherry-pick/revert/rebase 진행 중이면 새 세션일지가 없는 게 정상 — 차단하면 사용자가
  // MERGE_HEAD 걸린 중간 상태에 갇힌다(RFC 0061 record-check 와 동일 화이트리스트). commit-msg 는
  // PreToolUse 와 달리 merge 커밋에도 발동하므로 이 가드가 필수.
  for (const m of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD', 'rebase-merge', 'rebase-apply']) {
    if (gitMetaExists(m)) process.exit(0)
  }
  let msg = ''
  try {
    msg = readFileSync(msgPath, 'utf-8')
  } catch {
    process.exit(0) // 메시지 파일 못 읽음 — fail-open
  }
  const staged = gitRaw(['diff', '--cached', '--name-only'], null)
    .split(/\r?\n/)
    .map((l) => unquoteGitPath(l.trim()))
    .filter(Boolean)
  // [skip-record] 는 msg 내용에서 판정(evaluateRecords 가 commandText.includes 로 처리).
  const today = localToday()
  const verdict = evaluateRecords({
    stagedFiles: staged,
    commandText: msg,
    today,
    hasSessionRecord: hasSessionRecordOnDisk(acceptedRecordDates(today)),
  })
  if (verdict.ok) process.exit(0)
  // 알려진 한계: amend 완화 없음 — 이미 로그가 든 커밋을 amend 하면 오차단될 수 있으나 [skip-record]
  // 로 우회 가능하고, 이 레포는 amend 지양 관행이라 수용(RFC 0061 record-check 는 HEAD 완화 보유).
  console.error(`[check-records BLOCK] ${verdict.reason}`)
  for (const f of verdict.codeFiles ?? []) console.error(`  - ${f}`)
  process.exit(2)
}

function main() {
  // commit-msg 훅($1=메시지파일)은 별도 경로 — stdin/커밋감지 로직을 타지 않는다.
  const msgFileIdx = process.argv.indexOf('--commit-msg-file')
  if (msgFileIdx >= 0) {
    commitMsgMode(process.argv[msgFileIdx + 1])
    return
  }

  // stdin 은 --hook 모드에서만 읽는다 — 비-TTY 인데 stdin 이 안 닫힌 환경(파이프라인·셸 래퍼)
  // 에서 readFileSync(0) 가 무한 블록되는 행 방지(라이브 실측). hook 등록(.claude/settings.json)
  // 이 --hook 을 넘기고, Claude Code 는 페이로드 후 stdin 을 닫으므로 hook 경로는 안전.
  const hookMode = process.argv.includes('--hook')
  let raw = ''
  if (hookMode) {
    try {
      raw = readFileSync(0, 'utf-8')
    } catch {
      raw = ''
    }
  }

  let input = null
  if (raw.trim()) {
    try {
      input = JSON.parse(raw)
    } catch {
      // hook 페이로드 손상 — fail-open (단독모드 폴백 시 모든 명령 차단 위험이 있었음).
      process.exit(0)
    }
  }
  if (hookMode && !input) process.exit(0) // hook 인데 페이로드 없음 — 판단 불가, fail-open

  const commandText =
    input?.tool_input?.command ?? process.argv.slice(2).filter((a) => a !== '--hook').join(' ')

  // hook 은 모든 Bash/PowerShell 호출에 발동 → 커밋이 아니면 즉시 통과.
  // HARD_STOP 검사를 이 뒤에 두는 건 의도: non-commit 명령까지 exit 2 로 막으면 해제 명령
  // (`vhk resume --confirm`)·진단(git status)조차 차단되는 자기잠금. HARD_STOP 의 전역 중단은
  // vhk CLI 자체 가드(runGuarded)와 게이트들 소관 — 이 hook 은 커밋 행위만 막는다.
  const commit = findGitSubcommand(commandText, 'commit')
  if (input && !commit.found) process.exit(0)

  // HARD_STOP = 자동화 중단 — 커밋 평가 지점에서 차단(.vhk/README 보장 이행).
  if (hardStopActive()) {
    console.error('[check-records BLOCK] .vhk/HARD_STOP 활성 — 자동 커밋 중단. 해제는 vhk resume --confirm (사람).')
    process.exit(2)
  }

  const files = collectFiles(commandText, commit.cPath)
  const today = localToday()
  const verdict = evaluateRecords({
    stagedFiles: files,
    commandText,
    today,
    // 세션 기록은 비추적 경로라 git 이 아니라 파일시스템으로 본다(위 hasSessionRecordOnDisk 주석).
    // cPath 가 있으면 그 worktree 기준으로 찾는다 — 부모 트리의 기록을 오인정하지 않게.
    hasSessionRecord: hasSessionRecordOnDisk(
      acceptedRecordDates(today),
      commit.cPath ? join(commit.cPath, SESSION_RECORD_DIR) : SESSION_RECORD_DIR,
    ),
  })

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
