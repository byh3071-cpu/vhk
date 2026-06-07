import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import chalk from 'chalk'
import { safeExecFile, NETWORK_EXEC_TIMEOUT_MS } from '../lib/exec.js'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import {
  VHK_DIR,
  collectVhkFiles,
  loadVhkignore,
  partitionGistFiles,
  readCloudConfig,
  writeCloudConfig,
} from '../lib/vhk-cloud.js'

/** gh CLI 인증 확인 — 미설치/미인증이면 친절한 안내 후 false */
function ensureGhReady(): boolean {
  const ver = safeExecFile('gh', ['--version'])
  if (!ver.ok) {
    console.log(chalk.red(`  ${ko.cloud.noGh}`))
    console.log(chalk.dim('  설치: https://cli.github.com/  (설치 후 `gh auth login`)'))
    return false
  }
  const auth = safeExecFile('gh', ['auth', 'status'])
  if (!auth.ok) {
    console.log(chalk.red(`  ${ko.cloud.noAuth}`))
    console.log(chalk.dim('  실행: gh auth login  (gist 권한 필요)'))
    return false
  }
  return true
}

/** gist URL 또는 출력에서 gist id 추출 */
export function parseGistId(output: string): string | null {
  const match = output.match(/gist\.github\.com\/(?:[^/]+\/)?([0-9a-f]+)/i)
  if (match) return match[1]
  const trimmed = output.trim()
  if (/^[0-9a-f]{8,}$/i.test(trimmed)) return trimmed
  return null
}

/** vhk cloud push — .vhk/ 를 secret gist 로 백업 */
export async function cloudPush(): Promise<void> {
  if (!ensureNotHardStopped('cloudPush')) return
  console.log(chalk.bold(`\n${ko.cloud.pushTitle}\n`))
  const cwd = process.cwd()

  if (!fs.existsSync(path.join(cwd, VHK_DIR))) {
    console.log(chalk.yellow(`  ${ko.cloud.noVhkDir}`))
    return
  }

  // ignore 인스턴스를 한 번만 만들어 collect + gist purge 양쪽에 같은 규칙 적용.
  const ig = loadVhkignore(cwd)
  const files = collectVhkFiles(cwd, ig)
  if (files.length === 0) {
    console.log(chalk.yellow(`  ${ko.cloud.nothingToSync}`))
    return
  }

  if (!ensureGhReady()) {
    process.exitCode = 1
    return
  }

  const filePaths = files.map(f => path.join(cwd, VHK_DIR, f))
  console.log(chalk.dim(`  📦 백업 대상 ${files.length}개: ${files.join(', ')}\n`))

  const existing = readCloudConfig(cwd)
  const desc = `vhk .vhk backup — ${path.basename(cwd)}`

  if (existing) {
    // 기존 gist 갱신 — 각 파일을 덮어쓰기(-f), 새 파일은 추가(-a)
    const gistFiles = listGistFiles(existing.gistId)
    for (let i = 0; i < files.length; i++) {
      const name = files[i]
      const src = filePaths[i]
      const args = gistFiles.includes(name)
        ? ['gist', 'edit', existing.gistId, '-f', name, src]
        : ['gist', 'edit', existing.gistId, '-a', src]
      const res = safeExecFile('gh', args)
      if (!res.ok) {
        console.log(chalk.red(`  ${ko.cloud.pushFail}: ${name}`))
        console.log(chalk.dim(`    ${res.err}`))
        process.exitCode = 1
        return
      }
    }

    // privacy purge — 과거에 올라간 제외 대상(memory.json·refs.json 등)을 gist 에서 제거.
    // 백업 대상(files)을 먼저 add/edit 했으므로 gist 에 항상 파일이 남는다 (gist 는 마지막 파일
    // 제거 불가). 제외 대상과 백업 대상은 서로소.
    const { excluded } = partitionGistFiles(gistFiles, ig)
    const purgeFailed: string[] = []
    if (excluded.length > 0) {
      const purgeOk = purgeExcludedFromGist(existing.gistId, excluded)
      if (!purgeOk) purgeFailed.push(...excluded)
      // 검증 — PATCH 후에도 남았는지 재확인 (원자적이지만 silent partial 방어 backstop).
      const stillThere = partitionGistFiles(listGistFiles(existing.gistId), ig).excluded
      for (const name of stillThere) {
        if (!purgeFailed.includes(name)) purgeFailed.push(name)
      }
    }

    console.log(chalk.green.bold(`  ${ko.cloud.pushDone}`))
    console.log(chalk.dim(`  gist: ${existing.gistId} (갱신)`))
    if (excluded.length > 0) {
      const purged = excluded.filter(n => !purgeFailed.includes(n))
      if (purged.length > 0) {
        console.log(chalk.dim(`  🔒 제외 대상 ${purged.length}개 gist 에서 제거: ${purged.join(', ')}`))
      }
      if (purgeFailed.length > 0) {
        console.log(chalk.yellow(`  ⚠️  제외 대상 제거 실패: ${purgeFailed.join(', ')} (수동 제거 권장 — pull 시엔 복원 안 됨)`))
      }
    }
    printPushNext()
    return
  }

  // 첫 백업 — secret gist 생성
  const res = safeExecFile('gh', ['gist', 'create', '--desc', desc, ...filePaths])
  if (!res.ok) {
    console.log(chalk.red(`  ${ko.cloud.pushFail}`))
    console.log(chalk.dim(`    ${res.err || res.out}`))
    process.exitCode = 1
    return
  }

  const gistId = parseGistId(res.out)
  if (!gistId) {
    console.log(chalk.red(`  ${ko.cloud.pushFail} — gist id 파싱 실패`))
    console.log(chalk.dim(`    출력: ${res.out}`))
    process.exitCode = 1
    return
  }

  writeCloudConfig(cwd, { gistId })
  console.log(chalk.green.bold(`  ${ko.cloud.pushDone}`))
  console.log(chalk.dim(`  gist: ${gistId} (신규, secret) → .vhk/cloud.json 저장`))
  printPushNext()
}

/** vhk cloud pull — gist 에서 .vhk/ 복원 */
export async function cloudPull(gistIdArg?: string): Promise<void> {
  console.log(chalk.bold(`\n${ko.cloud.pullTitle}\n`))
  const cwd = process.cwd()

  const gistId = gistIdArg || readCloudConfig(cwd)?.gistId
  if (!gistId) {
    console.log(chalk.yellow(`  ${ko.cloud.noGistId}`))
    console.log(chalk.dim('  사용법: vhk cloud pull <gistId>  (또는 cloud.json 이 있는 곳에서 실행)'))
    return
  }

  if (!ensureGhReady()) {
    process.exitCode = 1
    return
  }

  const allNames = listGistFiles(gistId)
  if (allNames.length === 0) {
    console.log(chalk.red(`  ${ko.cloud.pullFail} — gist 비었거나 접근 불가: ${gistId}`))
    process.exitCode = 1
    return
  }

  // 복원 시에도 제외 규칙 적용 — 과거에 올라간 개인 파일(memory.json 등)이 있어도
  // 로컬로 되살아나지 않게 한다 (privacy 약속의 복원측 backstop).
  const { keep: names, excluded: skipped } = partitionGistFiles(allNames, loadVhkignore(cwd))
  if (skipped.length > 0) {
    console.log(chalk.dim(`  🔒 제외 대상 ${skipped.length}개 복원 스킵: ${skipped.join(', ')}`))
  }
  if (names.length === 0) {
    console.log(chalk.yellow(`  복원 대상이 없습니다 (gist 파일이 모두 제외 규칙에 해당).`))
    return
  }

  const vhkDir = path.join(cwd, VHK_DIR)
  fs.mkdirSync(vhkDir, { recursive: true })

  let restored = 0
  for (const name of names) {
    const res = safeExecFile('gh', ['gist', 'view', gistId, '-f', name, '--raw'])
    if (!res.ok) {
      console.log(chalk.red(`  ${ko.cloud.pullFail}: ${name}`))
      console.log(chalk.dim(`    ${res.err}`))
      continue
    }
    fs.writeFileSync(path.join(vhkDir, name), ensureTrailingNewline(res.out), 'utf-8')
    restored++
  }

  // gistId 를 로컬에 기록 (다음 push/pull 용)
  writeCloudConfig(cwd, { gistId })

  console.log(chalk.green.bold(`  ${ko.cloud.pullDone}`))
  console.log(chalk.dim(`  ${restored}개 파일 복원 (gist: ${gistId})`))
  printNextStep({
    message: '클라우드에서 .vhk/ 복원 완료!',
    command: 'vhk 맥락',
    cursorHint: '프로젝트 맥락 보여줘',
  })
}

/**
 * 제외 대상 파일들을 gist 에서 한 번의 PATCH 로 원자적 제거.
 *
 * `gh gist edit -r <file>` 는 (1) 파일당 호출 → 중간 실패 시 partial 잔존, (2) CLI flag
 * 의존(gh 버전에 따라 변할 수 있음) 이라는 두 약점이 있다. 대신 GitHub REST 를
 * `gh api` 로 직접 호출한다:
 *   PATCH /gists/{id}  body { files: { "memory.json": null, ... } }
 * GitHub API 가 null 값 파일을 삭제 → 다수 파일을 **단일 원자적 요청**으로 제거.
 * `gh api` 는 REST 버전 관리를 따르므로 CLI flag 변화에 덜 취약.
 *
 * 반환: 전부 제거되면 true. transient 오류 대비 1 회 재시도. 실패해도 pull 측 제외가 backstop.
 */
function purgeExcludedFromGist(gistId: string, names: string[]): boolean {
  if (names.length === 0) return true
  const body = JSON.stringify({
    files: Object.fromEntries(names.map(n => [n, null])),
  })
  const tmp = path.join(os.tmpdir(), `vhk-gist-purge-${process.pid}.json`)
  try {
    fs.writeFileSync(tmp, body, 'utf-8')
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = safeExecFile(
        'gh',
        ['api', '--method', 'PATCH', `/gists/${gistId}`, '--input', tmp],
        { timeoutMs: NETWORK_EXEC_TIMEOUT_MS }
      )
      if (res.ok) return true
    }
    return false
  } finally {
    try { fs.unlinkSync(tmp) } catch { /* 임시파일 정리 실패는 무시 */ }
  }
}

/** gist 내 파일명 목록 (실패 시 빈 배열) */
function listGistFiles(gistId: string): string[] {
  const res = safeExecFile('gh', ['gist', 'view', gistId, '--files'])
  if (!res.ok) return []
  return res.out.split('\n').map(l => l.trim()).filter(Boolean)
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s : s + '\n'
}

function printPushNext(): void {
  printNextStep({
    message: '클라우드 백업 완료! 다른 환경에서 vhk cloud pull 로 복원하세요.',
    command: 'vhk cloud pull',
    cursorHint: '다른 컴퓨터에서 .vhk 복원해줘',
  })
}
