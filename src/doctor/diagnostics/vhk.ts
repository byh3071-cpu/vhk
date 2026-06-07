import { compareSemver } from '../../lib/version-check.js'
import type { Diagnostic } from '../types.js'

// VHK 설치/버전 진단 (Phase 2). 기존 doctor 명령의 인라인 VHK 블록을 진단으로 흡수.
export function buildVhkDiag(input: { version: string | undefined; latest: string | null }): Diagnostic {
  if (!input.version) {
    return { name: 'VHK', status: 'warn', value: '버전 확인 불가', advice: '전역 설치 확인: npm i -g @byh3071/vhk' }
  }
  if (input.latest && compareSemver(input.latest, input.version) > 0) {
    return { name: 'VHK', status: 'warn', value: `v${input.version}`, advice: `업데이트 가능: v${input.latest} — vhk update` }
  }
  return { name: 'VHK', status: 'ok', value: `v${input.version}${input.latest ? ' (최신)' : ''}` }
}
