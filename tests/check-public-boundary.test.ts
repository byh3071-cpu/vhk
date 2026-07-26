import { describe, expect, it } from 'vitest'
import { checkPublicBoundary, scanPublicText } from '../scripts/check-public-boundary.mjs'

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
})
