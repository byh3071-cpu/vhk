import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function fail(message) {
  throw new Error(`Agent Skill npm pack 검사 실패: ${message}`)
}

function main() {
  const root = process.cwd()
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'))
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, '.agents', 'skills', 'manifest.json'), 'utf-8'),
  )
  const isWindows = process.platform === 'win32'
  const npmCommand = isWindows ? process.env.ComSpec ?? 'cmd.exe' : 'npm'
  const npmArgs = isWindows
    ? ['/d', '/s', '/c', 'npm.cmd pack --dry-run --json --ignore-scripts']
    : ['pack', '--dry-run', '--json', '--ignore-scripts']
  const packed = spawnSync(
    npmCommand,
    npmArgs,
    {
      cwd: root,
      encoding: 'utf-8',
      windowsHide: true,
    },
  )
  if (packed.error) fail(packed.error.message)
  if (packed.status !== 0) fail(packed.stderr.trim() || `npm exit ${String(packed.status)}`)

  let result
  try {
    result = JSON.parse(packed.stdout)?.[0]
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
  if (!result || !Array.isArray(result.files)) fail('npm pack JSON에 files가 없습니다')
  if (result.version !== packageJson.version) {
    fail(`package version 불일치: ${String(result.version)} != ${String(packageJson.version)}`)
  }

  const packedPaths = new Set(result.files.map((item) => item.path))
  for (const required of ['README.md', 'dist/index.js']) {
    if (!packedPaths.has(required)) fail(`필수 파일 누락: ${required}`)
  }
  const javascriptPaths = [...packedPaths].filter(
    (filePath) => /^dist\/.+\.js$/.test(filePath),
  )
  if (javascriptPaths.length === 0) fail('배포 JavaScript가 없습니다')
  const javascript = javascriptPaths
    .map((filePath) => fs.readFileSync(path.join(root, ...filePath.split('/')), 'utf-8'))
    .join('\n')

  if (!javascript.includes('vhk-agent-skill:')) fail('관리 표식 코드가 dist에 없습니다')
  if (!javascript.includes(`"bundleVersion": ${manifest.bundleVersion}`)) {
    fail(`bundleVersion ${String(manifest.bundleVersion)}이 dist에 없습니다`)
  }
  for (const skill of manifest.skills) {
    if (!javascript.includes(`"name": "${skill.name}"`)) {
      fail(`Skill 본문이 dist에 없습니다: ${skill.name}`)
    }
    for (const fileName of skill.files) {
      if (fileName !== 'SKILL.md' && !javascript.includes(`"${fileName}"`)) {
        fail(`Skill 보조 파일이 dist에 없습니다: ${skill.name}/${fileName}`)
      }
    }
  }

  process.stdout.write(
    `Agent Skill npm pack 일치: ${packageJson.name}@${packageJson.version} · ${result.files.length} files\n`,
  )
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
