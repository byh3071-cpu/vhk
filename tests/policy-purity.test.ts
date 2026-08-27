import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const PURE_POLICY_MODULES = [
  'src/lib/command-allowlist.ts',
  'src/lib/execution-preflight.ts',
  'src/lib/execution-limits.ts',
] as const

const FORBIDDEN_EFFECTS = [
  {
    label: '프로세스 모듈',
    pattern: /(?:from\s+|import\s*\(|require\s*\()\s*['"](?:node:)?child_process['"]/u,
  },
  {
    label: '프로세스 생성 호출',
    pattern: /\b(?:exec|execFile|execFileSync|execSync|fork|spawn|spawnSync)\s*\(/u,
  },
  {
    label: '네트워크 모듈',
    pattern: /(?:from\s+|import\s*\(|require\s*\()\s*['"](?:node:)?(?:dns|dgram|http|https|net|tls)(?:\/[^'"]*)?['"]/u,
  },
  {
    label: '네트워크 호출',
    pattern: /\b(?:fetch|WebSocket)\s*\(/u,
  },
  {
    label: '파일시스템 모듈',
    pattern: /(?:from\s+|import\s*\(|require\s*\()\s*['"](?:node:)?fs(?:\/promises)?['"]/u,
  },
  {
    label: '파일 읽기 호출',
    pattern: /\b(?:createReadStream|readFile|readFileSync)\s*\(/u,
  },
  {
    label: '암묵적 현재 시각',
    pattern: /\bDate\.now\s*\(/u,
  },
] as const

describe('정책 판정 모듈 순수성 정적 가드', () => {
  it.each(PURE_POLICY_MODULES)('%s는 프로세스·네트워크·파일 읽기·Date.now를 사용하지 않는다', (file) => {
    const source = readFileSync(file, 'utf8')

    for (const forbidden of FORBIDDEN_EFFECTS) {
      expect(forbidden.pattern.test(source), `${file}: ${forbidden.label} 사용`).toBe(false)
    }
  })
})
