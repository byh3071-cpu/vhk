/*
 * TS-005 — 테스트가 쓰는 임시 경로를 ASCII 로 고정한다.
 *
 * Windows + Node v24 의 fs.rmSync 는 경로에 비ASCII 가 있으면 프로세스를 죽이거나(상위 경로)
 * 조용히 삭제를 건너뛴다(이름). 사용자명이 한글이면 os.tmpdir() 이 통째로 여기 해당해서
 * 임시 디렉터리를 쓰는 테스트가 로컬에서만 무더기로 깨진다 — "로컬만 빨강, CI 는 초록" 오진의 원인(TS-004).
 *
 * vitest 설정에서 불리므로 어떤 경우에도 던지지 않는다. 여기서 예외가 새면 테스트를 살리려다
 * vitest 자체를 못 띄우게 된다. 쓸 수 있는 후보가 없으면 개입을 포기하고 안내만 남긴다.
 */
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, parse } from 'node:path'

const NON_ASCII = /[^\x20-\x7E]/

export function hasNonAscii(value) {
  return NON_ASCII.test(value)
}

/** 실제로 만들고 쓸 수 있는 디렉터리인지 — 권한만 보는 게 아니라 파일 하나를 써 본다. */
export function isUsableDir(dir) {
  if (hasNonAscii(dir)) return false
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.write-probe-${process.pid}`)
    writeFileSync(probe, '', 'utf-8')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

/**
 * 후보 경로들. 드라이브 루트가 막힌 환경(회사 PC·제한 계정)이 있으므로 한 곳에 걸지 않는다.
 * @param cwd 프로젝트 디렉터리
 * @param env process.env 스냅샷
 */
export function tempCandidates(cwd, env) {
  const out = [join(parse(cwd).root, 'vhk-test-tmp')]
  if (!hasNonAscii(cwd)) out.push(join(cwd, 'node_modules', '.vhk-test-tmp'))
  const systemRoot = env.SystemRoot ?? env.windir
  if (systemRoot) out.push(join(systemRoot, 'Temp', 'vhk-test-tmp'))
  return out
}

/**
 * 워커에 주입할 환경변수. 임시 경로가 이미 ASCII 면 빈 객체(개입 안 함).
 * @param currentTmp os.tmpdir() 값
 * @param cwd 프로젝트 디렉터리
 * @param options env·warn·candidates 주입(테스트에서 후보 고갈 경로를 재현하기 위함)
 */
export function asciiTempEnv(currentTmp, cwd, options = {}) {
  const { env = process.env, warn = console.warn, candidates } = options
  if (!hasNonAscii(currentTmp)) return {}
  for (const candidate of candidates ?? tempCandidates(cwd, env)) {
    if (isUsableDir(candidate)) {
      return { TEMP: candidate, TMP: candidate, TMPDIR: candidate }
    }
  }
  warn(
    `[TS-005] 임시 경로에 비ASCII 문자가 있는데(${currentTmp}) 대체할 ASCII 경로를 만들지 못했습니다. `
      + 'rmSync 를 쓰는 테스트가 깨질 수 있습니다 — TEMP·TMP·TMPDIR 를 쓰기 가능한 ASCII 경로로 지정하세요.',
  )
  return {}
}
