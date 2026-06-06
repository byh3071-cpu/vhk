import type { Runner } from '../lib/preflight.js'

// Goal 31 — vhk doctor (환경 정기검진) 타입. 진단만 — 자동 수정 없음.

export type DiagStatus = 'ok' | 'warn' | 'fail' | 'skip'

export interface Diagnostic {
  name: string
  status: DiagStatus
  value: string
  advice?: string // non-ok 일 때 권장 조치
}

export interface DoctorOptions {
  online?: boolean // CVE DB 보정(Phase 2)
  audit?: boolean // pnpm audit(Phase 2)
  json?: boolean
  strict?: boolean // 드리프트 게이트(기존)
}

// 진단 의존성(주입) — 외부 명령/환경값을 mock 으로 격리.
export interface DiagDeps {
  run: Runner // safeExecFile 래퍼
  nodeVersion: string // process.version
  platform: string // process.platform
  osRelease: string // os.release()
}

export type DiagFn = (opts: DoctorOptions, deps: DiagDeps) => Diagnostic | Promise<Diagnostic>
