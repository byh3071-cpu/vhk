import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseEnvKeys } from '../lib/worktree-env.js'
import type { CopyItem, CopyResult } from './types.js'

// 파일 복사 의존성(주입) — 테스트에서 fs mock 격리.
export interface CopyDeps {
  exists: (p: string) => boolean
  copyFile: (src: string, dst: string) => void
  readKeys: (p: string) => number // env 키 개수만(값 미노출)
}

// 한 건 복사. throw 하지 않고 CopyResult 로 상태 반환 → 호출자가 나머지를 계속 처리.
// 비밀값은 detail 에 절대 출력하지 않음(env 는 키 개수만).
export function copyOne(item: CopyItem, deps: CopyDeps): CopyResult {
  if (!deps.exists(item.source)) {
    return { item, status: 'missing-source', detail: '원본 없음' }
  }
  try {
    deps.copyFile(item.source, item.target)
    if (item.kind === 'env') {
      const keyCount = deps.readKeys(item.source)
      return { item, status: 'copied', keyCount, detail: `${keyCount} keys` }
    }
    return { item, status: 'copied', detail: '복사됨' }
  } catch (e) {
    // 에러 메시지는 시스템 메시지(EACCES 등)뿐 — env 값 노출 위험 없음.
    const msg = e instanceof Error ? e.message : String(e)
    return { item, status: 'error', detail: `복사 실패: ${msg}` }
  }
}

// 여러 건 복사 — 한 건 실패해도 나머지 계속(copyOne 이 throw 안 함).
export function copyAll(items: CopyItem[], deps: CopyDeps): CopyResult[] {
  return items.map((it) => copyOne(it, deps))
}

// 실제 fs 주입(심볼릭 링크 금지 — copyFileSync 만 사용, Windows 안정).
export function realCopyDeps(): CopyDeps {
  return {
    exists: (p) => existsSync(p),
    // 대상 부모 디렉터리 보장 — .vscode/settings.json 같은 중첩 경로도 복사되게(없으면 ENOENT).
    copyFile: (src, dst) => {
      mkdirSync(dirname(dst), { recursive: true })
      copyFileSync(src, dst)
    },
    readKeys: (p) => {
      try {
        return parseEnvKeys(readFileSync(p, 'utf-8')).length
      } catch {
        return 0
      }
    },
  }
}
