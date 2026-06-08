// Goal 42: 릴리즈 준비 게이트.
// v2.4.0 사고(CHANGELOG 본문 빈칸인 채 버전만 올라감)가 동기. publish 는 발행 후 본문
// "_변경 내역 작성 필요._" 스텁만 꽂으므로, 그게 안 채워진 채 릴리즈되는 드리프트를 막는다.
//
// 순수 파서 — IO 없음(테스트 용이). CHANGELOG 텍스트만 받아 판정.

export interface ChangelogSection {
  /** 버전 문자열(예: "2.5.0"). [Unreleased] 는 포함하지 않음. */
  version: string
  /** 헤더 다음 ~ 다음 `## ` 직전까지의 본문(raw). */
  body: string
}

const SECTION_RE = /^## \[(\d+\.\d+\.\d+)\][^\n]*$/gm

/** `## [x.y.z]` 릴리즈 섹션을 파싱(Unreleased 제외). 각 본문 = 다음 `## ` 직전까지. */
export function parseReleasedSections(changelog: string): ChangelogSection[] {
  const out: ChangelogSection[] = []
  const matches = [...changelog.matchAll(SECTION_RE)]
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const start = (m.index ?? 0) + m[0].length
    // 다음 어떤 `## ` 헤더(릴리즈든 Unreleased든) 전까지가 이 섹션 본문.
    const nextHeader = changelog.indexOf('\n## ', start)
    const end = nextHeader === -1 ? changelog.length : nextHeader
    out.push({ version: m[1], body: changelog.slice(start, end) })
  }
  return out
}

/** 본문에서 실제 내용 라인만 남긴다(### 소제목·> 블록인용·공백 제거). */
function contentLines(body: string): string {
  return body
    .split('\n')
    .filter((raw) => {
      const t = raw.trim()
      if (!t) return false
      if (t.startsWith('###')) return false // Added/Changed/Fixed 소제목
      if (t.startsWith('>')) return false // 테마 블록인용
      return true
    })
    .join('\n')
    .trim()
}

const PLACEHOLDER_RE = /작성\s*필요|변경\s*내역\s*작성|TBD|^_[^\n]*_$/m

/** 릴리즈 섹션 본문이 비었거나(내용 0) 플레이스홀더 스텁인가. */
export function isPlaceholderBody(body: string): boolean {
  const c = contentLines(body)
  if (!c) return true // 소제목/인용 빼면 실제 내용 0 → 빈 섹션
  return PLACEHOLDER_RE.test(c) // "_변경 내역 작성 필요._" 등 스텁
}

/** 본문이 비었거나 플레이스홀더인 릴리즈 버전 목록(없으면 []). v2.4.0 드리프트 탐지. */
export function findEmptyReleasedSections(changelog: string): string[] {
  return parseReleasedSections(changelog)
    .filter((s) => isPlaceholderBody(s.body))
    .map((s) => s.version)
}

/** [Unreleased] 섹션이 비었는가(발행할 게 없음). 없으면 true 취급. */
export function isUnreleasedEmpty(changelog: string): boolean {
  const m = changelog.match(/^## \[Unreleased\][^\n]*$/m)
  if (!m || m.index === undefined) return true
  const start = m.index + m[0].length
  const next = changelog.indexOf('\n## ', start)
  const body = changelog.slice(start, next === -1 ? changelog.length : next)
  return contentLines(body).length === 0
}

export interface ReleaseReadiness {
  ok: boolean
  problems: string[]
}

/**
 * 발행 준비 점검(순수). 고신뢰 차단 사유:
 *  - 이전 릴리즈 섹션이 빈/플레이스홀더(직전 릴리즈가 미문서화 — v2.4.0 사고형).
 * 경고(차단 아님): [Unreleased] 비어있음(발행할 변경 없음 — 워크플로마다 다름).
 */
export function checkReleaseReadiness(changelog: string): ReleaseReadiness {
  const problems: string[] = []
  const empty = findEmptyReleasedSections(changelog)
  for (const v of empty) {
    problems.push(`CHANGELOG [${v}] 본문이 비었거나 플레이스홀더 — 릴리즈 노트를 채우세요.`)
  }
  return { ok: problems.length === 0, problems }
}
