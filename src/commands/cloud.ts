import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { safeExecFile } from '../lib/exec.js'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import {
  VHK_DIR,
  collectVhkFiles,
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
  console.log(chalk.bold(`\n${ko.cloud.pushTitle}\n`))
  const cwd = process.cwd()

  if (!fs.existsSync(path.join(cwd, VHK_DIR))) {
    console.log(chalk.yellow(`  ${ko.cloud.noVhkDir}`))
    return
  }

  const files = collectVhkFiles(cwd)
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
    console.log(chalk.green.bold(`  ${ko.cloud.pushDone}`))
    console.log(chalk.dim(`  gist: ${existing.gistId} (갱신)`))
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

  const names = listGistFiles(gistId)
  if (names.length === 0) {
    console.log(chalk.red(`  ${ko.cloud.pullFail} — gist 비었거나 접근 불가: ${gistId}`))
    process.exitCode = 1
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
