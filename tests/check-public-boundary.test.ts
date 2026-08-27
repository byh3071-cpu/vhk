import { describe, expect, it } from 'vitest'
import {
  buildHistorySearchPattern,
  checkPublicBoundary,
  scanPublicText,
  stripKnownExceptions,
  KNOWN_HISTORY_EXCEPTIONS,
} from '../scripts/check-public-boundary.mjs'

const RS = String.fromCharCode(0x1e)
const US = String.fromCharCode(0x1f)
/** `git log --format=%H%x1F...%x1E` 가 내는 레코드 스트림 모양. */
const record = (sha: string, meta: string): string => `${sha}${US}${meta}${RS}`

const manifest = (paths: string[]) => ({ files: paths.map((path) => ({ path })) })
const requiredPackageFiles = [
  'package.json',
  'README.md',
  'SECURITY.md',
  'LICENSE',
  'dist/index.js',
  'dist/mcp/index.js',
]

describe('공개 경계 검사', () => {
  it('범용 공개 파일과 noreply 메타데이터는 통과한다', () => {
    const result = checkPublicBoundary({
      manifest: manifest(requiredPackageFiles),
      trackedEntries: [{ path: 'src/index.ts', content: 'export const name = "vhk"' }],
      metadata: 'yohanstudio\n246838173+byh3071-cpu@users.noreply.github.com\nfeat: public release',
    })
    expect(result.problems).toEqual([])
  })

  it('npm 필수 실행 파일이 없으면 fail-closed한다', () => {
    const result = checkPublicBoundary({ manifest: manifest(['package.json']) })
    expect(result.problems).toContain('dist/index.js: npm 패키지 필수 실행 파일 누락')
    expect(result.problems).toContain('dist/mcp/index.js: npm 패키지 필수 실행 파일 누락')
  })

  it('개인 운영 경로는 Git 트리에서 차단한다', () => {
    const privatePath = ['docs', 'log', 'session.md'].join('/')
    const result = checkPublicBoundary({
      trackedEntries: [{ path: privatePath, content: 'session' }],
    })
    expect(result.problems.some((problem: string) => problem.includes('개인 운영 경로'))).toBe(true)
  })

  it.each([
    '.vhk/policy.json',
    '.vhk/policy-baseline.json',
    '.vhk/.policy-baseline.json.tmp-123-0',
    '.vhk/run-state.json',
    '.vhk/run-state.lock',
    '.vhk/run-state-recovery.lock',
    '.vhk/.run-state.json.tmp-123-0',
    '.vhk/.cloud.json.tmp-123-0',
  ])('gitignore가 없어져 %s가 추적돼도 공개 경계에서 차단한다', (privatePath) => {
    const result = checkPublicBoundary({
      trackedEntries: [{ path: privatePath, content: '{}' }],
    })
    expect(result.problems).toContain(`${privatePath}: 공개 Git 트리에 개인 운영 경로가 포함됨`)
  })

  it('개인 저장소명·메일·절대경로를 내용과 메타데이터에서 차단한다', () => {
    const repositoryName = ['yohan', 'brain'].join('-')
    const personalEmail = ['byh3071', 'gmail.com'].join('@')
    const windowsPath = ['C:', 'Users', 'Public', 'dev', 'private'].join('\\')
    expect(scanPublicText('파일', repositoryName)).not.toEqual([])
    expect(scanPublicText('작성자', personalEmail)).not.toEqual([])
    expect(scanPublicText('파일', windowsPath)).not.toEqual([])
  })

  it('실제처럼 보이는 UUID는 차단하고 명백한 영 UUID fixture는 허용한다', () => {
    const objectId = ['12345678', '1234', '1234', '1234', '123456789abc'].join('-')
    const zeroId = ['00000000', '0000', '0000', '0000', '000000000000'].join('-')
    expect(scanPublicText('문서', objectId)).not.toEqual([])
    expect(scanPublicText('테스트', zeroId)).toEqual([])
  })

  it('실제처럼 보이는 외부 객체 ID는 차단하고 명백한 fixture는 허용한다', () => {
    const objectIds = [
      ['wf_', 'abcdef'].join(''),
      ['cus_', 'NffrFeUfNV2Hib'].join(''),
      ['C', '0123456789'].join(''),
    ]
    const placeholders = [
      ['wf_', 'sample-123'].join(''),
      ['cus_', 'sample'].join(''),
      ['C', '0000000000'].join(''),
    ]

    for (const objectId of objectIds) {
      expect(scanPublicText('문서', objectId)).not.toEqual([])
    }
    for (const placeholder of placeholders) {
      expect(scanPublicText('테스트', placeholder)).toEqual([])
    }
  })

  it('전체 이력 검사 패턴은 영 UUID fixture를 제외한다', () => {
    const pattern = new RegExp(buildHistorySearchPattern(), 'iu')
    const privateRepository = ['yohan', 'brain'].join('-')
    const objectId = ['12345678', '1234', '1234', '1234', '123456789abc'].join('-')
    const zeroId = ['00000000', '0000', '0000', '0000', '000000000000'].join('-')
    expect(pattern.test(privateRepository)).toBe(true)
    expect(pattern.test(objectId)).toBe(true)
    expect(pattern.test(zeroId)).toBe(false)
  })

  it('전체 이력 검사 패턴은 실제 외부 객체 ID만 포함한다', () => {
    const pattern = new RegExp(buildHistorySearchPattern(), 'iu')
    expect(pattern.test(['wf_', 'abcdef'].join(''))).toBe(true)
    expect(pattern.test(['cus_', 'NffrFeUfNV2Hib'].join(''))).toBe(true)
    expect(pattern.test(['C', '0123456789'].join(''))).toBe(true)
    expect(pattern.test(['wf_', 'sample-123'].join(''))).toBe(false)
    expect(pattern.test(['C', '0000000000'].join(''))).toBe(false)
  })
})

// 이미 공개된 커밋의 작성자 정보는 되돌리려면 이력 재작성 + force push 가 필요한데,
// fork 가 있어 그래도 노출이 안 끝난다. 방치하면 릴리스 워크플로가 영구 red 가 되므로
// **조용한 우회 대신 선언된 예외**로 처리한다. 검사 자체는 죽이지 않는다.
describe('알려진 이력 예외 (커밋 메타데이터 한정)', () => {
  const privateMail = ['byh3071', '@', 'gmail.com'].join('')
  const EXEMPT = 'a'.repeat(40)
  const OTHER = 'b'.repeat(40)
  const exceptions = [{ sha: EXEMPT, label: 'x', reason: 'y', pending: 'z' }]

  it('예외 SHA 의 레코드는 검사 대상에서 빠진다', () => {
    const raw = record(EXEMPT, `이름\n${privateMail}\nGitHub\nnoreply@github.com\n제목`)
    expect(stripKnownExceptions(raw, exceptions)).not.toContain(privateMail)
  })

  it('예외가 아닌 커밋은 그대로 남아 계속 잡힌다 (검사 무력화 아님)', () => {
    const raw = record(OTHER, `이름\n${privateMail}\nGitHub\nnoreply@github.com\n제목`)
    const kept = stripKnownExceptions(raw, exceptions)
    expect(kept).toContain(privateMail)
    expect(scanPublicText('메타', kept).length).toBeGreaterThan(0)
  })

  it('예외와 비예외가 섞이면 비예외만 남는다', () => {
    const raw =
      record(EXEMPT, `이름\n${privateMail}\n제목A`) + record(OTHER, '이름\nok@users.noreply.github.com\n제목B')
    const kept = stripKnownExceptions(raw, exceptions)
    expect(kept).not.toContain(privateMail)
    expect(kept).toContain('제목B')
  })

  it('구분자가 없는 입력은 SHA 판정 불가라 그대로 남긴다 (fail-closed)', () => {
    const raw = `이름\n${privateMail}\n제목`
    expect(stripKnownExceptions(raw, exceptions)).toContain(privateMail)
  })

  it('예외 목록이 비면 아무것도 걸러내지 않는다', () => {
    const raw = record(EXEMPT, `이름\n${privateMail}\n제목`)
    expect(stripKnownExceptions(raw, [])).toContain(privateMail)
  })

  it('실제 예외 항목은 사유와 남은 일을 반드시 적는다 (영구 회피 방지)', () => {
    expect(KNOWN_HISTORY_EXCEPTIONS.length).toBeGreaterThan(0)
    for (const e of KNOWN_HISTORY_EXCEPTIONS) {
      expect(e.sha).toMatch(/^[0-9a-f]{40}$/)
      expect(e.reason.length).toBeGreaterThan(10)
      expect(e.pending.length).toBeGreaterThan(10)
    }
  })

  // 예외가 늘어나기 시작하면 "선언"이 아니라 "회피"가 된다.
  it('예외는 1건을 넘지 않는다 — 새 위반은 예외가 아니라 수정 대상', () => {
    expect(KNOWN_HISTORY_EXCEPTIONS.length).toBeLessThanOrEqual(1)
  })
})
