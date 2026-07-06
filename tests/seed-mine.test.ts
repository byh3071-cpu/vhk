import { describe, it, expect } from 'vitest'
import {
  parsePatMarkdown,
  failureToSeed,
  tsToSeed,
  renderSeedPreview,
  type SeedCandidate,
} from '../src/lib/seed-mine.js'

describe('parsePatMarkdown — PAT 신형(frontmatter 해결 필드)', () => {
  it('패턴명+해결 프론트매터 → avoid SeedCandidate(사전 점검 프레이밍 — reinforce 아님, M1 회귀)', () => {
    const raw = [
      '---',
      'id: PAT-003',
      '패턴명: 테스트 패턴명',
      '카테고리: env',
      '증상: 증상 텍스트',
      '원인: 원인 텍스트',
      '해결: 해결 텍스트 한 줄',
      '적용조건: 적용조건 텍스트',
      '출처프로젝트: vhk-cli',
      '태그: [a, b]',
      '발견일: 2026-07-03',
      '출처DevLog: docs/log/x.md',
      '---',
      '',
      '# PAT-003 — 제목',
      '',
      '본문...',
    ].join('\n')

    const cand = parsePatMarkdown(raw, 'docs/patterns/PAT-003-x.md')

    expect(cand).toMatchObject({
      kind: 'avoid',
      axis: 'keyword',
      signal: '테스트 패턴명',
      count: 1,
      sources: ['docs/patterns/PAT-003-x.md'],
      summary: '해결 텍스트 한 줄',
      sourceTags: ['seed:pat'],
    })
  })
})

describe('parsePatMarkdown — PAT 구형(본문 ## 해결 섹션)', () => {
  it('frontmatter 에 해결 없음 → 본문 ## 해결 섹션 첫 문단 사용, 코드펜스 이후는 무시', () => {
    const raw = [
      '---',
      '패턴명: 구형 패턴 이름',
      '카테고리: build',
      '출처프로젝트: VHK',
      '태그: [a]',
      '발견일: 2026-05-24',
      '출처DevLog: docs/log/y.md',
      '---',
      '',
      '# 패턴: 구형 패턴 이름',
      '',
      '## 증상',
      '',
      '증상 설명',
      '',
      '## 원인',
      '',
      '원인 설명',
      '',
      '## 해결',
      '',
      '해결 첫 문단 텍스트.',
      '',
      '```ts',
      'code here',
      '```',
      '',
      '## 핵심 원리',
      '',
      '이후 내용은 무시되어야 함.',
    ].join('\n')

    const cand = parsePatMarkdown(raw, 'docs/patterns/build-x.md')

    expect(cand).not.toBeNull()
    expect(cand?.signal).toBe('구형 패턴 이름')
    expect(cand?.summary).toBe('해결 첫 문단 텍스트.')
    expect(cand?.sources).toEqual(['docs/patterns/build-x.md'])
    expect(cand?.kind).toBe('avoid')
  })

  it('## 해결 섹션의 첫 줄이 ### 하위헤딩이면 건너뛰고 그 다음 실제 프로즈를 찾는다(M1 감사 L1 회귀)', () => {
    const raw = [
      '---',
      '패턴명: 하위헤딩으로 시작하는 패턴',
      '카테고리: build',
      '출처프로젝트: VHK',
      '태그: [a]',
      '발견일: 2026-06-10',
      '출처DevLog: docs/log/w.md',
      '---',
      '',
      '## 해결',
      '',
      '### 세부 절차',
      '',
      '진짜 해결 문장입니다.',
      '',
      '## 핵심 원리',
      '',
      '무시되어야 함.',
    ].join('\n')

    const cand = parsePatMarkdown(raw, 'docs/patterns/sub-heading.md')

    expect(cand?.summary).toBe('진짜 해결 문장입니다.')
  })

  it('## 해결 섹션이 코드펜스로 시작해도 펜스 이후 첫 프로즈 문단을 찾는다(실물: auth-npm-scoped-publish-404.md 회귀)', () => {
    const raw = [
      '---',
      '패턴명: 코드펜스로 시작하는 패턴',
      '카테고리: auth',
      '출처프로젝트: VHK',
      '태그: [a]',
      '발견일: 2026-06-03',
      '출처DevLog: docs/log/z.md',
      '---',
      '',
      '## 해결',
      '',
      '```powershell',
      'npm login',
      '```',
      '',
      '펜스 이후 진짜 해결 문장.',
      '',
      '## 핵심 원리',
      '',
      '무시되어야 함.',
    ].join('\n')

    const cand = parsePatMarkdown(raw, 'docs/patterns/auth-x.md')

    expect(cand?.summary).toBe('펜스 이후 진짜 해결 문장.')
  })
})

describe('parsePatMarkdown — 비-PAT 파일 (graceful skip)', () => {
  it('frontmatter 자체가 없으면 → null', () => {
    const raw = '# README\n\n이건 PAT 파일이 아니다.'
    expect(parsePatMarkdown(raw, 'docs/patterns/README.md')).toBeNull()
  })

  it('frontmatter 있어도 패턴명 필드 없으면 → null', () => {
    const raw = ['---', '카테고리: env', '---', '', '본문'].join('\n')
    expect(parsePatMarkdown(raw, 'docs/patterns/weird.md')).toBeNull()
  })
})

describe('failureToSeed', () => {
  it('lesson 있으면 lesson 첫 줄이 signal', () => {
    const cand = failureToSeed({ id: 'f1', content: '', lesson: '교훈 텍스트\n2번째 줄', why: '원인 텍스트' })
    expect(cand).toMatchObject({
      kind: 'avoid',
      axis: 'keyword',
      signal: '교훈 텍스트',
      count: 1,
      summary: '원인: 원인 텍스트',
      sourceTags: ['seed:failure'],
    })
    expect(cand.sources[0]).toContain('f1')
  })

  it('lesson 없으면 content 로 폴백', () => {
    const cand = failureToSeed({ id: 'f2', content: '내용 텍스트' })
    expect(cand.signal).toBe('내용 텍스트')
  })

  it('lesson·content 둘 다 비면 id 로 폴백', () => {
    const cand = failureToSeed({ id: 'f3', content: '' })
    expect(cand.signal).toBe('f3')
  })

  it('why 없으면 summary 는 출처 backref', () => {
    const cand = failureToSeed({ id: 'f4', content: '', lesson: '교훈' })
    expect(cand.summary).toBe('출처: failures f4')
  })
})

describe('tsToSeed', () => {
  it('TS 제목 → avoid SeedCandidate', () => {
    const cand = tsToSeed('TS-001', 'Windows `.cmd` shim EINVAL', 'docs/troubleshooting/TS-001-x.md')
    expect(cand).toMatchObject({
      kind: 'avoid',
      axis: 'keyword',
      signal: 'Windows `.cmd` shim EINVAL',
      count: 1,
      sources: ['docs/troubleshooting/TS-001-x.md'],
      summary: '출처: TS-001',
      sourceTags: ['seed:ts'],
    })
  })
})

describe('renderSeedPreview', () => {
  it('빈 후보 → "채굴된 후보 없음" 안내', () => {
    const out = renderSeedPreview([], '2026-07-07 00:00:00')
    expect(out).toContain('채굴된 후보 없음')
  })

  it('reinforce/avoid 후보 개수·내용 반영, 결정적(같은 입력 → 같은 출력)', () => {
    const candidates: SeedCandidate[] = [
      { kind: 'reinforce', axis: 'keyword', signal: 'A', count: 1, sources: ['s1'], summary: 'sum-a', sourceTags: ['seed:pat'] },
      { kind: 'avoid', axis: 'keyword', signal: 'B', count: 1, sources: ['s2'], summary: 'sum-b', sourceTags: ['seed:failure'] },
    ]
    const out1 = renderSeedPreview(candidates, '2026-07-07 00:00:00')
    const out2 = renderSeedPreview(candidates, '2026-07-07 00:00:00')
    expect(out1).toBe(out2)
    expect(out1).toContain('reinforce 후보 (1)')
    expect(out1).toContain('avoid 후보 (1)')
    expect(out1).toContain('A')
    expect(out1).toContain('B')
  })

  it('dry-run 안내 문구 포함(memory.patterns 미변경 고지)', () => {
    const out = renderSeedPreview([], '2026-07-07 00:00:00')
    expect(out).toContain('--write')
  })
})
