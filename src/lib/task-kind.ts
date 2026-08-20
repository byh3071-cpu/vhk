import { gitOut } from './git-repo.js'

// Goal 110-T3: 자율 런의 작업 유형을 **커밋 diff 경로에서 기계 유도**한다.
//
// why 자기 신고가 아니라 기계 유도인가:
//   110 전체의 전제가 "자기 보고는 카운터 자격이 없다"인데, 유형만 에이전트 플래그로 받으면
//   같은 구멍이 새로 뚫린다. 특히 ADR-009 ③ 이 chore·docs·deps 를 자동 허용 후보로 지정해
//   놓았으므로(작업 단위 124), 스키마 변경을 chore 로 신고하면 승인 경계를 우회할 수 있다.
//   값 자체는 allowlist 를 통과하므로 닫힌집합 대조(PAT-001)로도 못 걸러낸다.
//   → 유형은 변경된 파일 경로에서 유도하고, 에이전트 신고는 힌트로만 받는다.
//
// 한계(정직): 경로는 내용이 아니다. 같은 `src/` 안에서 위험한 변경과 안전한 변경을 못 가른다.
//   그래서 매칭 실패는 'unknown' 으로 남기고, 승인 규칙 쪽에서 fail-closed 로 취급하게 한다.

/** 작업 유형 닫힌집합. ADR-009 ③ 의 자동 허용(chore·docs·deps) / 사람 필수(schema·security) 대응. */
export type TaskKind = 'chore' | 'docs' | 'deps' | 'source' | 'schema' | 'security' | 'unknown'

/**
 * 위험도 오름차순. 한 런이 여러 유형을 건드리면 **가장 위험한 쪽**으로 판정한다(fail-closed).
 * 'unknown' 은 여기 없다 — 하나라도 유도되면 그 값을 쓰고, 전부 실패했을 때만 unknown 이다.
 */
const RISK_ORDER: readonly TaskKind[] = ['chore', 'docs', 'deps', 'source', 'schema', 'security']

/** 닫힌집합 대조용(PAT-001) — 외부에서 들어온 문자열을 그대로 믿지 않는다. */
const VALID_KINDS = new Set<string>([...RISK_ORDER, 'unknown'])

/**
 * 경로 → 유형 규칙. 위에서부터 첫 매칭이 그 파일의 유형이다.
 * VHK 는 다른 프로젝트에서도 실행되므로 이 레포 전용 경로를 넣지 않는다(범용 패턴만).
 */
const PATH_RULES: ReadonlyArray<{ kind: TaskKind; test: (p: string) => boolean }> = [
  // 보안·집행 경계 — CI 워크플로, 경계 검사, 셸 실행 통로, 무시 규칙, 키 파일.
  {
    kind: 'security',
    test: (p) =>
      p.startsWith('.github/workflows/') ||
      // RFC 0066 §7.3 조치3 — 권한 정책 설정. 이 파일이 바뀌면 자율 실행의 상한 자체가 바뀐다.
      /(^|\/)\.vhk\/policy\.json$/.test(p) ||
      /(^|\/)(\.gitignore|\.npmrc|\.npmignore)$/.test(p) ||
      /(^|\/)[^/]*(secur|boundary|auth|secret|credential)[^/]*\.[a-z]+$/i.test(p) ||
      /(^|\/)exec\.[a-z]+$/i.test(p) ||
      /\.(pem|key|p12|pfx)$/i.test(p),
  },
  // 기록 스키마 — 원장·로그 형식과 마이그레이션. 한 번 굳으면 되돌리기 비싼 축.
  {
    kind: 'schema',
    test: (p) =>
      /(^|\/)migrations?\//.test(p) ||
      /(^|\/)[^/]*(schema|migration)[^/]*\.[a-z]+$/i.test(p) ||
      /(^|\/)[^/]*-(log|ledger)\.[a-z]+$/i.test(p) ||
      /\.(sql|prisma)$/i.test(p),
  },
  // 의존성 — 매니페스트와 잠금 파일만. 그 외 설정은 chore.
  {
    kind: 'deps',
    test: (p) =>
      /(^|\/)package\.json$/.test(p) ||
      /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|pnpm-workspace\.yaml)$/.test(p) ||
      /(^|\/)(requirements\.txt|Pipfile(\.lock)?|poetry\.lock|go\.(mod|sum)|Cargo\.(toml|lock))$/.test(p),
  },
  // 잡무 — 테스트·빌드 스크립트·설정. 제품 동작을 직접 바꾸지 않는 축.
  {
    kind: 'chore',
    test: (p) =>
      /(^|\/)(tests?|__tests__|spec)\//.test(p) ||
      /\.(test|spec)\.[a-z]+$/i.test(p) ||
      p.startsWith('scripts/') ||
      /(^|\/)[^/]*\.config\.[a-z]+$/i.test(p) ||
      /(^|\/)(tsconfig|eslint|vitest|vite|tsup)[^/]*\.(json|js|ts|mjs|cjs|yaml|yml)$/i.test(p),
  },
  // 문서 — 확장자 우선이라 docs/ 밖 README 도 잡힌다.
  { kind: 'docs', test: (p) => p.startsWith('docs/') || /\.(md|mdx|adoc|rst|txt)$/i.test(p) },
  // 나머지 소스. 위 규칙에 안 걸린 실제 구현 코드.
  {
    kind: 'source',
    test: (p) => /^(src|lib|app|packages)\//.test(p) || /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java)$/i.test(p),
  },
]

/** 파일 경로 하나의 유형. 어떤 규칙에도 안 걸리면 unknown. */
export function classifyPath(path: string): TaskKind {
  // git 은 항상 POSIX 구분자를 주지만, 호출부가 OS 경로를 넘길 수 있어 정규화한다.
  const p = path.replace(/\\/g, '/').replace(/^\.\//, '').trim()
  if (!p) return 'unknown'
  for (const rule of PATH_RULES) {
    if (rule.test(p)) return rule.kind
  }
  return 'unknown'
}

/**
 * 변경 파일 목록 → 런 하나의 작업 유형. 혼합이면 위험도 최댓값(fail-closed).
 * 목록이 비었거나 전부 미분류면 unknown — "안전한 유형"으로 낙관 추정하지 않는다.
 */
export function deriveTaskKind(paths: readonly string[]): TaskKind {
  let best = -1
  for (const path of paths) {
    const rank = RISK_ORDER.indexOf(classifyPath(path))
    if (rank > best) best = rank
  }
  return best < 0 ? 'unknown' : RISK_ORDER[best]
}

/**
 * 변경 파일 목록의 분류 내역 (RFC 0066 §5.3 — additive).
 *
 * why 별도 함수인가: `deriveTaskKind` 는 위험도 최댓값만 돌려주는데, `RISK_ORDER` 에 `unknown`
 * 이 없어서 미분류 경로는 `indexOf` 가 -1 을 주고 **어떤 분류된 유형에도 진다.** 그래서
 * `['docs/a.md', 'Dockerfile']` 이 통째로 `docs` 가 된다 — 컨테이너 정의·CI 보조 파일·확장자
 * 없는 스크립트가 문서 파일 하나에 묻어 낮은 위험도로 통과하는 구멍이다(적대 검증 치명 1).
 *
 * 기존 함수의 동작을 고치지 않는 이유는 원장에 이미 쓰인 `taskKind` 값의 의미가 달라지면
 * 과거 라인과 비교가 깨지기 때문이다. 대신 미분류 수를 같이 돌려주고, 위험도 판정은
 * 이 함수만 쓴다 — 미분류가 하나라도 있으면 `human` 이다.
 */
export interface TaskKindBreakdown {
  /** `deriveTaskKind` 와 동일한 값 */
  kind: TaskKind
  /** 검사한 경로 수 */
  total: number
  /** `classifyPath` 가 `unknown` 을 준 경로 수 */
  unclassified: number
}

export function deriveTaskKindDetailed(paths: readonly string[]): TaskKindBreakdown {
  let unclassified = 0
  for (const path of paths) {
    if (classifyPath(path) === 'unknown') unclassified++
  }
  return { kind: deriveTaskKind(paths), total: paths.length, unclassified }
}

/** 외부(에이전트 플래그·과거 로그 라인)에서 들어온 값을 닫힌집합에 대조. 미매칭은 unknown. */
export function normalizeTaskKind(raw: string | undefined | null): TaskKind {
  if (typeof raw !== 'string') return 'unknown'
  const v = raw.trim().toLowerCase()
  return VALID_KINDS.has(v) ? (v as TaskKind) : 'unknown'
}

/**
 * 두 커밋 사이 변경 파일 목록. 기존 git 통로(gitOut)만 사용 — 새 execSync 도입 없음.
 * git 레포 아님·잘못된 SHA·범위 계산 실패는 빈 배열(추측 금지 → 호출부에서 unknown 이 된다).
 */
export function changedPathsBetween(cwd: string, fromSha: string, toSha: string): string[] {
  if (!fromSha || !toSha) return []
  try {
    const out = gitOut(['diff', '--name-only', fromSha, toSha], cwd)
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  } catch {
    return []
  }
}
