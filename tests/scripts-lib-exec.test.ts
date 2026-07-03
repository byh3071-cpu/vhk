import { describe, it, expect } from 'vitest'
import { safeExec } from '../scripts/_lib.mjs'

// scripts/_lib.mjs 의 safeExec 는 src/lib/exec.ts 의 safeExecFile 과 동일 패턴(헤더 주석에
// 명시) — 같은 CodeQL 하드닝(#1·#3·#7·#9 dismiss 후속)을 여기도 적용해야 한다.
// exec.test.ts 에서 직접 프로브로 실증한 것과 동일: '" & echo X & "' 조합이 cmd.exe 인용
// 경계를 탈출해 실제 인젝션으로 이어짐(CVE-2024-27980 과 같은 근본원인 클래스).
describe('scripts/_lib.mjs safeExec — Windows shim 하드닝', () => {
  it('shim 바이너리(pnpm) 호출 시 cmd.exe 인용 탈출 인자는 거부해 실제 인젝션을 막는다', () => {
    const original = process.platform
    try {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      const result = safeExec('pnpm', ['--version', '" & echo VHK_INJECTION_PROBE & "'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.out).not.toContain('VHK_INJECTION_PROBE')
      }
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
    }
  })

  it('비-shim 바이너리(git)는 같은 인자도 거부 없이 통과(과잉차단 방지)', () => {
    const original = process.platform
    try {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      const result = safeExec('git', ['status', '" & echo VHK_INJECTION_PROBE & "'])
      if (!result.ok) {
        expect(result.err).not.toContain('안전하지 않은')
      }
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
    }
  })
})
