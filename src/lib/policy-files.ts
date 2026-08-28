import { ensureVhkIgnored } from './backup.js'

/**
 * 정책 설정·신뢰 기준·런 카운터는 모두 프로젝트 로컬 상태다.
 * Git과 VHK cloud 어느 쪽에도 공유하지 않는 동일 보호 묶음으로 관리한다.
 */
export const POLICY_LOCAL_FILES = [
  'policy.json',
  'policy-baseline.json',
  'run-state.json',
  'run-state.lock',
  'run-state-recovery.lock',
] as const

/** 원자 교체 직전 프로세스가 중단돼도 Git·cloud로 새면 안 되는 비공개 임시본. */
export const POLICY_LOCAL_TEMP_PATTERNS = [
  '.policy-baseline.json.tmp-*',
  '.run-state.json.tmp-*',
] as const

/** 기존 프로젝트의 `.vhk/.gitignore`도 보존하며 로컬 정책 파일을 멱등 보강한다. */
export function ensurePolicyFilesIgnored(cwd: string): void {
  ensureVhkIgnored(cwd, ...POLICY_LOCAL_FILES, ...POLICY_LOCAL_TEMP_PATTERNS)
}
