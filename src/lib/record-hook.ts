// RFC 0061 T1 — record-net 커밋훅 배선.
// 설계 결정(RFC 0061 §5-1): core.hooksPath 전역 지정은 husky 등 기존 사용자 훅 전체를
// 무력화할 수 있어 기각 — .git/hooks/commit-msg 직접 설치 + 마커 기반 소유권 판별.
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { COMMIT_MSG_HOOK_TEMPLATE, RECORD_HOOK_MARKER } from '../templates/record-hook.js'

export type RecordHookInstallResult =
  | 'installed'
  | 'updated'
  | 'respected-existing'
  | 'hooks-path-set'
  | 'no-git'

/**
 * `.git/hooks/commit-msg` 에 record-net shim 을 배선한다.
 * - `.git` 디렉터리가 없으면(git init 전 · worktree 의 .git 파일 포함) 'no-git' — 아무것도 쓰지 않음.
 * - 기존 훅에 vhk 마커가 없으면 'respected-existing' — 남의 훅은 불가침(내용 보존).
 * - 마커가 있으면 최신 템플릿으로 갱신('updated'). 멱등.
 */
export function installRecordCommitMsgHook(projectDir: string): RecordHookInstallResult {
  const gitDir = path.join(projectDir, '.git')
  let isDir = false
  try {
    isDir = fs.statSync(gitDir).isDirectory()
  } catch {
    isDir = false
  }
  if (!isDir) return 'no-git'

  // core.hooksPath(husky·lefthook 등)가 설정돼 있으면 git 은 .git/hooks 를 무시한다 —
  // 그런데도 써넣고 성공을 찍으면 "집행이 조용히 죽는 거짓 배선"(적대검증 #3 실측).
  // 미배선으로 정직 보고하고 수동 통합을 안내한다.
  let hooksPathConfigured = ''
  try {
    hooksPathConfigured = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      cwd: projectDir,
      encoding: 'utf-8',
    }).trim()
  } catch {
    // 미설정이면 git config 가 exit 1 — 정상 경로(직접 설치 가능).
    hooksPathConfigured = ''
  }
  if (hooksPathConfigured) return 'hooks-path-set'

  const hookPath = path.join(gitDir, 'hooks', 'commit-msg')
  let result: RecordHookInstallResult = 'installed'
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf-8')
    if (!existing.includes(RECORD_HOOK_MARKER)) return 'respected-existing'
    result = 'updated'
  }

  fs.mkdirSync(path.dirname(hookPath), { recursive: true })
  fs.writeFileSync(hookPath, COMMIT_MSG_HOOK_TEMPLATE(), 'utf-8')
  try {
    fs.chmodSync(hookPath, 0o755)
  } catch (e) {
    // chmod 미지원/실패(Windows 등) — Git for Windows 는 실행비트 없이도 sh 훅을 실행한다.
    void e
  }
  return result
}
