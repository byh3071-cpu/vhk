import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const ALLOWED_PACKAGE_FILES = new Set(['package.json', 'README.md', 'README.en.md', 'LICENSE', 'SECURITY.md'])
const PRIVATE_PATH_PARTS = [
  '.agents/',
  '.claude/',
  '.cursor/',
  '.vhk/',
  'docs/log/',
  'docs/state/',
  'goals/',
]
const PRIVATE_RUNTIME_PATTERNS = [
  { name: '개인 규칙 저장소명', pattern: /private-rules-repository/iu },
  { name: '개인 스킬 저장소명', pattern: /private-skills-repository/iu },
  { name: '개인 운영 런타임명', pattern: /yohan-(?:os|mcp)/iu },
  { name: '개인 생태계 절대경로', pattern: /(?:[a-z]:\\|\/)(?:[^\r\n]*[\\/])?private-workspace[\\/]/iu },
]

function packManifest() {
  const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm'
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm.cmd pack --dry-run --json --ignore-scripts']
    : ['pack', '--dry-run', '--json', '--ignore-scripts']
  const output = execFileSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const parsed = JSON.parse(output)
  const manifest = Array.isArray(parsed) ? parsed[0] : parsed
  if (!manifest || !Array.isArray(manifest.files)) {
    throw new Error('npm pack --dry-run 결과에서 파일 목록을 읽지 못했습니다.')
  }
  return manifest
}

export function checkPublicBoundary(manifest = packManifest()) {
  const problems = []
  const packageFiles = manifest.files.map(file => String(file.path).replaceAll('\\', '/'))

  for (const file of packageFiles) {
    const lower = file.toLowerCase()
    if (PRIVATE_PATH_PARTS.some(part => lower === part.slice(0, -1) || lower.startsWith(part))) {
      problems.push(`${file}: 개인 운영 경로가 npm 패키지에 포함됨`)
    }
    if (!file.startsWith('dist/') && !ALLOWED_PACKAGE_FILES.has(file)) {
      problems.push(`${file}: 허용되지 않은 npm 패키지 파일`)
    }
  }

  const textFiles = packageFiles.filter(file => /\.(?:c?js|mjs|json|md|ts)$/iu.test(file))
  for (const file of textFiles) {
    const content = readFileSync(resolve(ROOT, file), 'utf8')
    for (const forbidden of PRIVATE_RUNTIME_PATTERNS) {
      if (forbidden.pattern.test(content)) {
        problems.push(`${file}: ${forbidden.name} 노출`)
      }
    }
  }

  return { packageFiles, problems }
}

function main() {
  const result = checkPublicBoundary()
  if (result.problems.length > 0) {
    console.error('공개 경계 검사 실패:')
    for (const problem of result.problems) console.error(`- ${problem}`)
    process.exitCode = 1
    return
  }
  console.log(`공개 경계 검사 통과: npm 파일 ${result.packageFiles.length}개, 개인 운영 경로·런타임 참조 0건`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main()
