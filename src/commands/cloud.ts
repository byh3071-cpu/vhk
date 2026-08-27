import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import chalk from 'chalk'
import { safeExecFile, NETWORK_EXEC_TIMEOUT_MS } from '../lib/exec.js'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import {
  CLOUD_EMPTY_PLACEHOLDER,
  CLOUD_EMPTY_PLACEHOLDER_CONTENT,
  VHK_DIR,
  assertSafeVhkLocalBoundary,
  collectVhkFiles,
  collectVhkFlatEntryNames,
  collectVhkSubdirs,
  hasPortableFilenameCollisions,
  isSafeFlatGistFilename,
  loadVhkignore,
  gistHeadCleanupSatisfied,
  partitionGistFiles,
  planGistHeadCleanup,
  readCloudConfig,
  writeCloudConfig,
} from '../lib/vhk-cloud.js'
import { removeDirSync } from '../lib/fs-remove.js'
import { atomicWriteFile } from '../lib/atomic-write.js'

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

function isSafeGistId(value: string): boolean {
  return /^[0-9a-f]{6,64}$/i.test(value)
}

/** vhk cloud push — .vhk/ 를 secret gist 로 백업 */
export async function cloudPush(): Promise<void> {
  if (!ensureNotHardStopped('cloud push')) return // HARD_STOP 활성 시 .vhk 백업 업로드 차단
  console.log(chalk.bold(`\n${ko.cloud.pushTitle}\n`))
  const cwd = process.cwd()

  try {
    assertSafeVhkLocalBoundary(cwd, ['cloud.json', '.gitignore'])
  } catch {
    console.log(chalk.red(`  ${ko.cloud.pushFail} — ${ko.cloud.unsafeLocalBoundary}`))
    process.exitCode = 1
    return
  }

  if (!fs.existsSync(path.join(cwd, VHK_DIR))) {
    console.log(chalk.yellow(`  ${ko.cloud.noVhkDir}`))
    return
  }

  // ignore 인스턴스를 한 번만 만들어 collect + gist purge 양쪽에 같은 규칙 적용.
  const ig = loadVhkignore(cwd)
  let files: string[]
  try {
    files = collectVhkFiles(cwd, ig)
  } catch {
    console.log(chalk.red(`  ${ko.cloud.pushFail} — ${ko.cloud.unsafeLocalBoundary}`))
    process.exitCode = 1
    return
  }
  if (files.some(name => !isSafeFlatGistFilename(name))) {
    console.log(chalk.red(`  ${ko.cloud.pushFail} — ${ko.cloud.unsafeLocalFilename}`))
    process.exitCode = 1
    return
  }
  if (hasPortableFilenameCollisions(files)) {
    console.log(chalk.red(`  ${ko.cloud.pushFail} — ${ko.cloud.filenameCollision}`))
    process.exitCode = 1
    return
  }
  let existing: ReturnType<typeof readCloudConfig>
  try {
    existing = readCloudConfig(cwd)
  } catch {
    console.log(chalk.red(`  ${ko.cloud.pushFail} — ${ko.cloud.configReadFail}`))
    process.exitCode = 1
    return
  }
  if (existing && !isSafeGistId(existing.gistId)) {
    console.log(chalk.red(`  ${ko.cloud.pushFail} — ${ko.cloud.invalidGistId}`))
    process.exitCode = 1
    return
  }
  if (files.length === 0 && !existing) {
    console.log(chalk.yellow(`  ${ko.cloud.nothingToSync}`))
    return
  }

  if (!ensureGhReady()) {
    process.exitCode = 1
    return
  }

  try {
    // 수집 뒤 인증을 기다리는 사이 파일이 링크로 바뀔 수 있다. 전송 후보 전체를
    // 네트워크 쓰기 전에 다시 확인해 외부 파일을 따라가는 업로드를 막는다.
    assertSafeVhkLocalBoundary(cwd, [...files, 'cloud.json', '.gitignore'])
  } catch {
    console.log(chalk.red(`  ${ko.cloud.pushFail} — ${ko.cloud.unsafeLocalBoundary}`))
    process.exitCode = 1
    return
  }

  const filePaths = files.map(f => path.join(cwd, VHK_DIR, f))
  if (files.length > 0) {
    console.log(chalk.dim(`  📦 백업 대상 ${files.length}개: ${files.join(', ')}\n`))
  } else {
    console.log(chalk.dim('  📦 새 백업 대상 없음 — 기존 gist의 제외 파일을 정리합니다.\n'))
  }

  // #160: 평면 파일만 백업 — 하위 폴더(.vhk/evolve/ 등)는 제외되므로 명시적으로 경고.
  let subdirs: string[]
  try {
    subdirs = collectVhkSubdirs(cwd)
  } catch {
    console.log(chalk.red(`  ${ko.cloud.pushFail} — ${ko.cloud.unsafeLocalBoundary}`))
    process.exitCode = 1
    return
  }
  if (subdirs.length > 0) {
    console.log(chalk.yellow(`  ${ko.cloud.flatOnlyWarn(subdirs.join(', '))}\n`))
  }

  const desc = `vhk .vhk backup — ${path.basename(cwd)}`

  if (existing) {
    if (!isSecretGist(existing.gistId)) {
      console.log(chalk.red(`  ${ko.cloud.pushFail} — ${ko.cloud.secretGistRequired}`))
      process.exitCode = 1
      return
    }
    // 기존 gist 갱신 — 각 파일을 덮어쓰기(-f), 새 파일은 추가(-a)
    const listed = inspectGistHead(existing.gistId)
    if (!listed.ok || listed.names.length === 0) {
      const reason = listed.unsafeNames
        ? '평면 파일이 아닌 이름이나 운영체제에서 안전하지 않은 이름이 있어 쓰기 전에 중단합니다.'
        : listed.markerConflict
          ? `예약 파일 ${CLOUD_EMPTY_PLACEHOLDER}의 내용이 VHK 마커와 달라 사용자 파일 보호를 위해 중단합니다.`
          : '기존 gist 파일 목록을 확인할 수 없습니다.'
      console.log(chalk.red(`  ${ko.cloud.pushFail} — ${reason}`))
      process.exitCode = 1
      return
    }
    const gistFiles = listed.names
    if (hasPortableFilenameCollisions([...gistFiles, ...files])) {
      console.log(chalk.red(`  ${ko.cloud.pushFail} — ${ko.cloud.filenameCollision}`))
      process.exitCode = 1
      return
    }
    for (let i = 0; i < files.length; i++) {
      const name = files[i]
      const src = filePaths[i]
      try {
        // 원격 목록 확인 중 교체된 파일도 각 gh 전송 직전에 다시 닫는다.
        assertSafeVhkLocalBoundary(cwd, [name, 'cloud.json', '.gitignore'])
      } catch {
        console.log(chalk.red(`  ${ko.cloud.pushFail} — ${ko.cloud.unsafeLocalBoundary}`))
        process.exitCode = 1
        return
      }
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

    // 현재 revision 정리 — 제외 대상을 head에서 제거한다. Gist는 Git 이력을 보존하므로 과거
    // revision의 완전 삭제를 뜻하지 않는다. 공유 파일이 0개면 기존 excluded 하나를 비민감
    // carrier로 rename해 마지막 파일 제약과 Update Gist의 기존-key 계약을 함께 지킨다.
    const cleanup = cleanupGistHead(existing.gistId, ig)
    if (!cleanup.ok) {
      console.log(chalk.red(`  ${ko.cloud.pushFail} — 제외 대상의 현재 revision 정리를 검증하지 못했습니다.`))
      process.exitCode = 1
      return
    }

    console.log(chalk.green.bold(`  ${ko.cloud.pushDone}`))
    console.log(chalk.dim(`  gist: ${existing.gistId} (갱신)`))
    if (cleanup.cleaned.length > 0) {
      console.log(chalk.dim(`  🔒 제외 대상 ${cleanup.cleaned.length}개 현재 revision에서 제거: ${cleanup.cleaned.join(', ')}`))
      console.log(chalk.yellow('  ⚠ 과거 Gist revision의 완전 삭제는 Gist 재생성이 필요한 사람 승인 작업입니다.'))
    }
    printPushNext()
    return
  }

  // 첫 백업 — secret gist 생성
  try {
    assertSafeVhkLocalBoundary(cwd, [...files, 'cloud.json', '.gitignore'])
  } catch {
    console.log(chalk.red(`  ${ko.cloud.pushFail} — ${ko.cloud.unsafeLocalBoundary}`))
    process.exitCode = 1
    return
  }
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

  if (!isSecretGist(gistId)) {
    console.log(chalk.red(`  ${ko.cloud.pushFail} — ${ko.cloud.secretGistRequired}`))
    process.exitCode = 1
    return
  }

  try {
    writeCloudConfig(cwd, { gistId })
  } catch {
    console.log(chalk.red(`  ${ko.cloud.pushFail} — ${ko.cloud.unsafeLocalBoundary}`))
    process.exitCode = 1
    return
  }
  console.log(chalk.green.bold(`  ${ko.cloud.pushDone}`))
  console.log(chalk.dim(`  gist: ${gistId} (신규, secret) → .vhk/cloud.json 저장`))
  printPushNext()
}

/** vhk cloud pull — gist 에서 .vhk/ 복원 */
export async function cloudPull(gistIdArg?: string): Promise<void> {
  console.log(chalk.bold(`\n${ko.cloud.pullTitle}\n`))
  const cwd = process.cwd()

  try {
    assertSafeVhkLocalBoundary(cwd, ['cloud.json', '.gitignore'])
  } catch {
    console.log(chalk.red(`  ${ko.cloud.pullFail} — ${ko.cloud.unsafeLocalBoundary}`))
    process.exitCode = 1
    return
  }

  let gistId = gistIdArg
  if (!gistId) {
    try {
      gistId = readCloudConfig(cwd)?.gistId
    } catch {
      console.log(chalk.red(`  ${ko.cloud.pullFail} — ${ko.cloud.configReadFail}`))
      process.exitCode = 1
      return
    }
  }
  if (!gistId) {
    console.log(chalk.yellow(`  ${ko.cloud.noGistId}`))
    console.log(chalk.dim('  사용법: vhk cloud pull <gistId>  (또는 cloud.json 이 있는 곳에서 실행)'))
    return
  }
  if (!isSafeGistId(gistId)) {
    console.log(chalk.red(`  ${ko.cloud.pullFail} — ${ko.cloud.invalidGistId}`))
    process.exitCode = 1
    return
  }

  if (!ensureGhReady()) {
    process.exitCode = 1
    return
  }

  const listed = inspectGistHead(gistId)
  if (!listed.ok || listed.names.length === 0) {
    const reason = listed.unsafeNames
      ? '평면 파일이 아닌 이름이나 운영체제에서 안전하지 않은 이름이 있어 복원 전에 중단합니다.'
      : listed.markerConflict
        ? `예약 파일 ${CLOUD_EMPTY_PLACEHOLDER}의 내용이 VHK 마커와 달라 복원을 중단합니다.`
        : `gist 비었거나 접근 불가: ${gistId}`
    console.log(chalk.red(`  ${ko.cloud.pullFail} — ${reason}`))
    process.exitCode = 1
    return
  }

  if (!isSecretGist(gistId)) {
    console.log(chalk.red(`  ${ko.cloud.pullFail} — ${ko.cloud.secretGistRequired}`))
    process.exitCode = 1
    return
  }
  const allNames = listed.names

  // 복원 시에도 제외 규칙 적용 — 과거에 올라간 개인 파일(memory.json 등)이 있어도
  // 로컬로 되살아나지 않게 한다 (privacy 약속의 복원측 backstop).
  const { keep: names, excluded: skipped } = partitionGistFiles(allNames, loadVhkignore(cwd))
  if (skipped.length > 0) {
    console.log(chalk.dim(`  🔒 제외 대상 ${skipped.length}개 복원 스킵: ${skipped.join(', ')}`))
  }
  if (names.length === 0) {
    // placeholder-only gist도 연결 자체는 유효하다. 파일 복원은 0건이어도 다음 push가 같은
    // gist를 정리·갱신할 수 있도록 포인터를 보존한다.
    try {
      writeCloudConfig(cwd, { gistId })
    } catch {
      console.log(chalk.red(`  ${ko.cloud.pullFail} — ${ko.cloud.unsafeLocalBoundary}`))
      process.exitCode = 1
      return
    }
    console.log(chalk.yellow(`  복원 대상이 없습니다 (gist 파일이 모두 제외 규칙에 해당).`))
    return
  }

  let localNames: string[]
  try {
    localNames = collectVhkFlatEntryNames(cwd)
  } catch {
    console.log(chalk.red(`  ${ko.cloud.pullFail} — ${ko.cloud.unsafeLocalBoundary}`))
    process.exitCode = 1
    return
  }
  if (hasPortableFilenameCollisions([...localNames, ...names])) {
    console.log(chalk.red(`  ${ko.cloud.pullFail} — ${ko.cloud.filenameCollision}`))
    process.exitCode = 1
    return
  }

  const vhkDir = path.resolve(cwd, VHK_DIR)
  const targets = names.map(name => path.resolve(vhkDir, name))
  if (targets.some(target => path.dirname(target) !== vhkDir)) {
    console.log(chalk.red(`  ${ko.cloud.pullFail} — 복원 대상 경로가 .vhk 평면 경계를 벗어납니다.`))
    process.exitCode = 1
    return
  }
  try {
    assertSafeVhkLocalBoundary(cwd, [...names, 'cloud.json', '.gitignore'])
  } catch {
    console.log(chalk.red(`  ${ko.cloud.pullFail} — ${ko.cloud.unsafeLocalBoundary}`))
    process.exitCode = 1
    return
  }
  const fetched: Array<{ name: string; target: string; content: string }> = []
  for (let index = 0; index < names.length; index++) {
    const name = names[index]
    const res = safeExecFile('gh', ['gist', 'view', gistId, '-f', name, '--raw'])
    if (!res.ok) {
      console.log(chalk.red(`  ${ko.cloud.pullFail}: ${name}`))
      console.log(chalk.dim(`    ${res.err}`))
      process.exitCode = 1
      return
    }
    fetched.push({ name, target: targets[index], content: ensureTrailingNewline(res.out) })
  }

  fs.mkdirSync(vhkDir, { recursive: true })
  try {
    assertSafeVhkLocalBoundary(cwd, [...names, 'cloud.json', '.gitignore'])
  } catch {
    console.log(chalk.red(`  ${ko.cloud.pullFail} — ${ko.cloud.unsafeLocalBoundary}`))
    process.exitCode = 1
    return
  }

  let restored = 0
  for (const item of fetched) {
    try {
      // 원격 조회 중 링크가 생긴 경우도 쓰기 직전에 다시 닫는다. atomic rename은 기존 링크를
      // 따라 덮지 않고 디렉터리 엔트리 자체를 교체한다.
      assertSafeVhkLocalBoundary(cwd, [item.name, 'cloud.json', '.gitignore'])
      atomicWriteFile(item.target, item.content)
      restored++
    } catch {
      console.log(chalk.red(`  ${ko.cloud.pullFail} — ${ko.cloud.unsafeLocalBoundary}`))
      process.exitCode = 1
      return
    }
  }

  // gistId 를 로컬에 기록 (다음 push/pull 용)
  try {
    writeCloudConfig(cwd, { gistId })
  } catch {
    console.log(chalk.red(`  ${ko.cloud.pullFail} — ${ko.cloud.unsafeLocalBoundary}`))
    process.exitCode = 1
    return
  }

  console.log(chalk.green.bold(`  ${ko.cloud.pullDone}`))
  console.log(chalk.dim(`  ${restored}개 파일 복원 (gist: ${gistId})`))
  printNextStep({
    message: '클라우드에서 .vhk/ 복원 완료!',
    command: 'vhk 맥락',
    cursorHint: '프로젝트 맥락 보여줘',
  })
}

/** 현재 Gist revision의 삭제·carrier rename을 한 PATCH로 적용. 성공 여부는 호출부가 재조회한다. */
function applyGistFileUpdates(gistId: string, files: Record<string, unknown>): boolean {
  const body = JSON.stringify({ files })
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-gist-head-cleanup-'))
  const tmp = path.join(tmpDir, 'request.json')
  let applied = false
  try {
    fs.writeFileSync(tmp, body, { encoding: 'utf-8', flag: 'wx', mode: 0o600 })
    const res = safeExecFile(
      'gh',
      ['api', '--method', 'PATCH', `/gists/${gistId}`, '--input', tmp],
      { timeoutMs: NETWORK_EXEC_TIMEOUT_MS },
    )
    applied = res.ok
  } finally {
    try {
      removeDirSync(tmpDir)
    } catch {
      applied = false
    }
  }
  return applied
}

interface GistFileListResult {
  ok: boolean
  names: string[]
  unsafeNames: boolean
}

/** 공개 Gist에는 로컬 맥락을 쓰지 않는다. 조회 실패도 비공개라고 낙관하지 않는다. */
function isSecretGist(gistId: string): boolean {
  const res = safeExecFile(
    'gh',
    ['api', `/gists/${gistId}`, '--jq', '.public'],
    { timeoutMs: NETWORK_EXEC_TIMEOUT_MS },
  )
  return res.ok && res.out.trim() === 'false'
}

interface GistHeadSnapshot extends GistFileListResult {
  markerTrusted: boolean
  markerConflict: boolean
}

/** gist 내 파일명 목록. 실패와 실제 빈 목록을 합치지 않는다. */
function listGistFiles(gistId: string): GistFileListResult {
  const res = safeExecFile(
    'gh',
    ['gist', 'view', gistId, '--files'],
    { timeoutMs: NETWORK_EXEC_TIMEOUT_MS, trimOutput: false },
  )
  if (!res.ok) return { ok: false, names: [], unsafeNames: false }
  const names = res.out.replace(/\r\n/g, '\n').split('\n')
  while (names.at(-1) === '') names.pop()
  const unsafeNames = names.some(name => !isSafeFlatGistFilename(name))
    || hasPortableFilenameCollisions(names)
  if (unsafeNames) return { ok: false, names: [], unsafeNames: true }
  return { ok: true, names, unsafeNames: false }
}

/** 예약 파일명만으로 내부 마커라 믿지 않는다. 기존 사용자 파일과 충돌하면 쓰기 전에 닫는다. */
function inspectGistHead(gistId: string): GistHeadSnapshot {
  const listed = listGistFiles(gistId)
  if (!listed.ok) return { ...listed, markerTrusted: false, markerConflict: false }
  if (!listed.names.includes(CLOUD_EMPTY_PLACEHOLDER)) {
    return { ...listed, markerTrusted: false, markerConflict: false }
  }
  const marker = safeExecFile(
    'gh',
    ['gist', 'view', gistId, '-f', CLOUD_EMPTY_PLACEHOLDER, '--raw'],
    { timeoutMs: NETWORK_EXEC_TIMEOUT_MS, trimOutput: false },
  )
  const normalized = marker.out.replace(/\r\n/g, '\n')
  if (!marker.ok || normalized !== CLOUD_EMPTY_PLACEHOLDER_CONTENT) {
    return {
      ok: false,
      names: listed.names,
      unsafeNames: false,
      markerTrusted: false,
      markerConflict: true,
    }
  }
  return { ...listed, markerTrusted: true, markerConflict: false }
}

interface GistHeadCleanupResult {
  ok: boolean
  cleaned: string[]
}

/**
 * 현재 revision 정리. PATCH 응답이 timeout이어도 먼저 재조회해 postcondition을 확인한다.
 * 미완료일 때만 최신 파일명으로 한 번 더 계획하므로 rename carrier에 낡은 body를 재전송하지 않는다.
 */
function cleanupGistHead(gistId: string, ig: ReturnType<typeof loadVhkignore>): GistHeadCleanupResult {
  const cleaned = new Set<string>()
  let listed = inspectGistHead(gistId)
  if (!listed.ok || listed.names.length === 0) return { ok: false, cleaned: [] }

  for (let attempt = 0; attempt < 2; attempt++) {
    const plan = planGistHeadCleanup(listed.names, ig, listed.markerTrusted)
    if (plan.markerConflict) return { ok: false, cleaned: [...cleaned].sort() }
    for (const name of plan.excluded) {
      if (name !== CLOUD_EMPTY_PLACEHOLDER) cleaned.add(name)
    }
    if (gistHeadCleanupSatisfied(listed.names, ig, listed.markerTrusted)) {
      return { ok: true, cleaned: [...cleaned].sort() }
    }
    if (Object.keys(plan.updates).length === 0) return { ok: false, cleaned: [...cleaned].sort() }

    // 결과가 false여도 서버 적용 뒤 응답만 유실됐을 수 있다. 동일 body를 즉시 재전송하지 않는다.
    applyGistFileUpdates(gistId, plan.updates)
    listed = inspectGistHead(gistId)
    if (!listed.ok || listed.names.length === 0) return { ok: false, cleaned: [...cleaned].sort() }
    if (gistHeadCleanupSatisfied(listed.names, ig, listed.markerTrusted)) {
      return { ok: true, cleaned: [...cleaned].sort() }
    }
  }
  return { ok: false, cleaned: [...cleaned].sort() }
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
