import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { safeExecFile } from '../lib/exec.js'

/**
 * MCP 서버가 위임하는 vhk CLI 실행 경로 해석.
 * 전역 `vhk` 가 PATH 에 없어도(글로벌 미설치/npx 일회성) 로컬 `dist/index.js` 로
 * fallback 해 MCP 도구 위임이 끊기지 않게 한다. (배치3 §5)
 */
export interface VhkCliInvocation {
  /** 실행 바이너리/명령 */
  bin: string
  /** bin 뒤에 먼저 붙는 인자 (node 로 dist/index.js 실행 시 [스크립트경로]) */
  prefixArgs: string[]
  /** 전역 vhk 대신 로컬 dist/index.js 로 fallback 했는가 */
  fallback: boolean
}

/**
 * 순수 결정 로직 — 환경 사실(전역 가용 여부 / 로컬 CLI 경로·존재)을 받아
 * 어떤 CLI 를 실행할지 고른다. (테스트 가능 seam)
 */
export function pickCliInvocation(
  globalAvailable: boolean,
  localCli: string,
  localExists: boolean
): VhkCliInvocation {
  if (globalAvailable) return { bin: 'vhk', prefixArgs: [], fallback: false }
  if (localExists) return { bin: process.execPath, prefixArgs: [localCli], fallback: true }
  // 마지막 수단: 그래도 vhk 시도 — 실패는 호출부(runVhkCli)가 표면화.
  return { bin: 'vhk', prefixArgs: [], fallback: false }
}

/**
 * resolve 결과(VhkCliInvocation) + 호출 인자 → 실제 실행할 `{ bin, args }`.
 * (runVhkCli 가 쓰는 인자 합성 — 순수 함수라 fallback(node dist/index.js) 합성을 단위테스트 가능.)
 */
export function composeInvocation(
  cli: VhkCliInvocation,
  args: string[]
): { bin: string; args: string[] } {
  return { bin: cli.bin, args: [...cli.prefixArgs, ...args] }
}

/** dist/mcp/cli-path.js 기준 로컬 CLI(dist/index.js) 절대경로. */
export function localCliPath(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  return resolve(here, '..', 'index.js')
}

/** 전역 vhk 존재(--version 성공)면 vhk, 아니면 로컬 dist/index.js 를 node 로 실행하도록 resolve. */
export function resolveVhkCliInvocation(): VhkCliInvocation {
  const globalAvailable = safeExecFile('vhk', ['--version']).ok
  const local = localCliPath()
  return pickCliInvocation(globalAvailable, local, existsSync(local))
}
