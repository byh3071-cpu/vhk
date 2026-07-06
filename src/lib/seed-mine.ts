import { parseFrontmatter } from './goal-frontmatter.js'

// Goal 100 (cold-start 역채굴): memory.patterns=0 이면 evolve suggest 가 즉시 죽는다
// (evolve.ts:evolveSuggest — activePatterns.length===0 → 📭 return). 과거 기록(PAT·failures·TS)을
// 결정적으로 채굴해 SeedCandidate[] 로 정규화 → reconcilePatterns(pattern.ts) 로 memory.patterns 에
// 병합하면 파이프라인이 켜진다. LLM 0 — 전부 frontmatter/구조 파싱(헌법 PAT-003: LLM 결정경로 배제).
//
// SeedCandidate 는 pattern.ts 의 RawCandidate 와 구조적으로 동일 — reconcilePatterns 에 캐스트 없이
// 바로 전달 가능(구조적 타이핑). seed-mine.ts 는 lib 전용 의존(commands 미import, 순환 방지).

export interface SeedCandidate {
  kind: 'avoid' | 'reinforce'
  axis: 'tag' | 'keyword'
  signal: string
  count: number
  sources: string[]
  summary: string
  sourceTags: string[]
}

function firstLine(text: string): string {
  return (text ?? '').split(/\r?\n/)[0].trim()
}

/**
 * `## <heading>` 섹션 본문(다음 `## ` 또는 EOF 까지) 추출. 없으면 빈 문자열.
 * 종료 앵커는 `$` 대신 `(?![\s\S])`(진짜 문자열 끝) 사용 — multiline(`m`) 플래그에서 `$` 는
 * 모든 줄 끝에도 매칭돼 섹션 중간(예: 코드펜스 첫 줄 직후)에서 잘못 잘릴 수 있다.
 */
function extractSection(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|(?![\\s\\S]))`, 'm')
  const m = re.exec(body)
  return m ? m[1] : ''
}

/** 섹션 본문의 첫 비어있지 않은 프로즈 줄(코드펜스·하위헤딩은 건너뛰고 이후까지 탐색). */
function firstParagraph(section: string): string {
  let inFence = false
  for (const raw of section.split(/\r?\n/)) {
    const t = raw.trim()
    if (t.startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence || !t || t.startsWith('#')) continue
    return t
  }
  return ''
}

/**
 * PAT 마크다운(신형: frontmatter `해결` 필드 / 구형: 본문 `## 해결` 섹션) → avoid SeedCandidate.
 * 패턴명 없으면(비-PAT 파일, 예 README.md) null — 호출자가 graceful skip.
 *
 * kind='avoid'(reinforce 아님, 적대리뷰 M1): PAT 패턴명은 저자마다 프레이밍이 갈린다 — "해결책/
 * 모범사례"를 이름 붙인 문서도 있고("BOM 제거"), "버그·함정"을 이름 붙인 문서도 있다("--since 가
 * 무시됨"). 후자를 reinforce("이 접근 계속 권장")로 씨딩하면 버그를 계속하라는 문장이 돼 의미가
 * 뒤집힌다. avoid("관련 작업 시 사전 점검 필수")는 방향 불문 항상 안전한 중립 프레이밍이라 기본값.
 */
export function parsePatMarkdown(raw: string, sourcePath: string): SeedCandidate | null {
  const { frontmatter, body } = parseFrontmatter(raw)
  const name = typeof frontmatter['패턴명'] === 'string' ? frontmatter['패턴명'].trim() : ''
  if (!name) return null

  const solutionField =
    typeof frontmatter['해결'] === 'string' ? frontmatter['해결'].trim() : ''
  const summary = solutionField || firstParagraph(extractSection(body, '해결')) || name

  return {
    kind: 'avoid',
    axis: 'keyword',
    signal: name,
    count: 1,
    sources: [sourcePath],
    summary,
    sourceTags: ['seed:pat'],
  }
}

export interface FailureLike {
  id: string
  content: string
  why?: string
  lesson?: string
}

/** 실패 교훈(lesson 우선, content→id 폴백) → avoid SeedCandidate. buildNegativeFromFailure 와 동일 폴백 체인. */
export function failureToSeed(f: FailureLike): SeedCandidate {
  const signal = firstLine(f.lesson || f.content || f.id)
  const why = firstLine(f.why || '')
  const summary = why ? `원인: ${why}` : `출처: failures ${f.id}`
  return {
    kind: 'avoid',
    axis: 'keyword',
    signal,
    count: 1,
    sources: [`memory.json#failures/${f.id}`],
    summary,
    sourceTags: ['seed:failure'],
  }
}

/** TS 트러블슈팅 제목 → avoid SeedCandidate. */
export function tsToSeed(id: string, title: string, sourcePath: string): SeedCandidate {
  return {
    kind: 'avoid',
    axis: 'keyword',
    signal: title.trim(),
    count: 1,
    sources: [sourcePath],
    summary: `출처: ${id}`,
    sourceTags: ['seed:ts'],
  }
}

/** 후보 → dry-run 미리보기 마크다운(순수·결정적 — 타임스탬프는 호출자가 generatedAt 으로 주입). */
export function renderSeedPreview(candidates: SeedCandidate[], generatedAt: string): string {
  const lines: string[] = []
  lines.push('# Seed Candidates — memory.patterns 채굴 미리보기')
  lines.push('')
  lines.push('> ⚠️ dry-run 미리보기 — `--write` 없이는 memory.patterns 를 변경하지 않는다.')
  lines.push(`> 생성: ${generatedAt}`)
  lines.push('')

  if (candidates.length === 0) {
    lines.push('(채굴된 후보 없음)')
    return lines.join('\n')
  }

  const reinforce = candidates.filter((c) => c.kind === 'reinforce')
  const avoid = candidates.filter((c) => c.kind === 'avoid')

  lines.push(`## reinforce 후보 (${reinforce.length})`)
  lines.push('')
  if (reinforce.length) {
    for (const c of reinforce) lines.push(`- **${c.signal}** — ${c.summary} (출처: ${c.sources.join(', ')})`)
  } else {
    lines.push('- (없음)')
  }
  lines.push('')

  lines.push(`## avoid 후보 (${avoid.length})`)
  lines.push('')
  if (avoid.length) {
    for (const c of avoid) lines.push(`- **${c.signal}** — ${c.summary} (출처: ${c.sources.join(', ')})`)
  } else {
    lines.push('- (없음)')
  }

  return lines.join('\n')
}
