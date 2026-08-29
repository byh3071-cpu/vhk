import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const check = args.includes('--check')
const positional = args.filter((arg) => arg !== '--check')
const skillsRoot = path.resolve(positional[0] ?? '.agents/skills')
const outputPath = path.resolve(positional[1] ?? 'src/lib/agent-skill-templates.ts')
const manifestPath = path.join(skillsRoot, 'manifest.json')
const ownerRoot = path.resolve(skillsRoot, '..', '..')
const blockStart = '// VHK-GENERATED-AGENT-SKILLS:BEGIN'
const blockEnd = '// VHK-GENERATED-AGENT-SKILLS:END'

function isInside(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function assertSafeRegularFile(filePath, label) {
  const absolute = path.resolve(filePath)
  if (!isInside(ownerRoot, absolute)) {
    throw new Error(`${label} 경로가 프로젝트 밖입니다: ${absolute}`)
  }

  const relative = path.relative(ownerRoot, absolute)
  let current = ownerRoot
  for (const segment of relative.split(path.sep)) {
    if (segment === '') continue
    current = path.join(current, segment)
    const stat = fs.lstatSync(current, { throwIfNoEntry: false })
    if (stat === undefined) throw new Error(`${label} 파일이 없습니다: ${absolute}`)
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} 경로의 symlink/junction을 따라가지 않습니다: ${current}`)
    }
  }

  const stat = fs.lstatSync(absolute)
  if (!stat.isFile()) throw new Error(`${label}는 일반 파일이어야 합니다: ${absolute}`)
  const realOwner = fs.realpathSync(ownerRoot)
  const realFile = fs.realpathSync(absolute)
  if (!isInside(realOwner, realFile)) {
    throw new Error(`${label} 실제 경로가 프로젝트 밖입니다: ${realFile}`)
  }
}

assertSafeRegularFile(manifestPath, 'Agent Skill manifest')
assertSafeRegularFile(outputPath, 'Agent Skill 생성 번들')

function frontmatterValue(content, field, skillName) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  if (match === null) throw new Error(`SKILL.md frontmatter가 없습니다: ${skillName}`)
  const values = [...match[1].matchAll(new RegExp(`^${field}:\\s*(.+)$`, 'gm'))]
    .map((item) => item[1].trim())
    .filter(Boolean)
  if (values.length !== 1) {
    throw new Error(`SKILL.md frontmatter ${field}가 없거나 중복입니다: ${skillName}`)
  }
  return values[0]
}

const windowsReservedName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

function portableSkillFileName(fileName, skillName) {
  if (typeof fileName !== 'string' || path.isAbsolute(fileName)) {
    throw new Error(`안전하지 않은 skill 파일 경로: ${skillName}/${String(fileName)}`)
  }
  const segments = fileName.split(/[\\/]/)
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`안전하지 않은 skill 파일 경로: ${skillName}/${fileName}`)
  }
  for (const segment of segments) {
    if (segment !== segment.normalize('NFC')) {
      throw new Error(`NFC가 아닌 skill 파일 이름: ${skillName}/${fileName}`)
    }
    if (/[<>:"|?*\u0000-\u001f]/.test(segment) || /[. ]$/.test(segment)) {
      throw new Error(`이식 불가능한 skill 파일 이름: ${skillName}/${fileName}`)
    }
    if (windowsReservedName.test(segment)) {
      throw new Error(`Windows 예약어 skill 파일 이름: ${skillName}/${fileName}`)
    }
  }
  return segments.join('/')
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
const supportedPlatforms = new Set(['google-antigravity', 'claude-code', 'openai-codex', 'cursor'])
if (manifest.schemaVersion !== 1 || !Number.isInteger(manifest.bundleVersion) || manifest.bundleVersion < 1) {
  throw new Error(`지원하지 않는 Agent Skill manifest: ${manifestPath}`)
}
if (!Array.isArray(manifest.skills)) throw new Error(`skills 배열이 없습니다: ${manifestPath}`)

const names = new Set()
const skills = manifest.skills.map((entry) => {
  if (!entry || typeof entry !== 'object') throw new Error('잘못된 skill 항목')
  if (typeof entry.name !== 'string' || !/^[a-z0-9-]+$/.test(entry.name)) {
    throw new Error(`잘못된 skill 이름: ${String(entry.name)}`)
  }
  if (windowsReservedName.test(entry.name)) {
    throw new Error(`Windows 예약어 skill 이름: ${entry.name}`)
  }
  if (names.has(entry.name)) throw new Error(`중복 skill 이름: ${entry.name}`)
  names.add(entry.name)
  if (!['project', 'repository'].includes(entry.distribution)) {
    throw new Error(`잘못된 distribution: ${entry.name}`)
  }
  if (!Array.isArray(entry.platforms) || entry.platforms.length === 0) {
    throw new Error(`platforms가 비었습니다: ${entry.name}`)
  }
  if (entry.platforms.some((platform) => !supportedPlatforms.has(platform))) {
    throw new Error(`지원하지 않는 platform: ${entry.name}`)
  }
  if (
    entry.platforms.length !== supportedPlatforms.size
    || entry.platforms.some((platform, index) => platform !== [...supportedPlatforms][index])
  ) {
    throw new Error(
      `공통 Skill 지원 platform은 ${[...supportedPlatforms].join(', ')} 전부여야 합니다: ${entry.name}`,
    )
  }
  if (!Array.isArray(entry.files) || !entry.files.includes('SKILL.md')) {
    throw new Error(`SKILL.md가 manifest에 없습니다: ${entry.name}`)
  }

  const files = {}
  const portableFileKeys = new Set()
  for (const fileName of entry.files) {
    const normalizedFileName = portableSkillFileName(fileName, entry.name)
    const portableKey = normalizedFileName.toLowerCase()
    if (portableFileKeys.has(portableKey)) {
      throw new Error(`플랫폼 간 충돌 skill 파일: ${entry.name}/${normalizedFileName}`)
    }
    portableFileKeys.add(portableKey)
    const fullPath = path.join(skillsRoot, entry.name, ...normalizedFileName.split('/'))
    assertSafeRegularFile(fullPath, `Agent Skill 정본 ${entry.name}/${normalizedFileName}`)
    files[normalizedFileName] = fs.readFileSync(fullPath, 'utf-8').replace(/\r\n/g, '\n')
  }
  const declaredName = frontmatterValue(files['SKILL.md'], 'name', entry.name)
  if (declaredName !== entry.name) {
    throw new Error(`SKILL.md name 불일치: ${entry.name} != ${String(declaredName)}`)
  }
  frontmatterValue(files['SKILL.md'], 'description', entry.name)
  return {
    name: entry.name,
    distribution: entry.distribution,
    platforms: entry.platforms,
    files,
  }
})

const sourceBundle = {
  schemaVersion: manifest.schemaVersion,
  bundleVersion: manifest.bundleVersion,
  skills: skills.map((skill) => ({
    ...skill,
    files: Object.fromEntries(
      Object.entries(skill.files).map(([fileName, content]) => [fileName, content.split('\n')]),
    ),
  })),
}
const source = fs.readFileSync(outputPath, 'utf-8')
const eol = source.includes('\r\n') ? '\r\n' : '\n'
const generatedLf = [
  blockStart,
  `const GENERATED_AGENT_SKILL_SOURCE: AgentSkillSourceBundleData = ${JSON.stringify(sourceBundle, null, 2)}`,
  blockEnd,
].join('\n')
const generated = eol === '\n' ? generatedLf : generatedLf.replace(/\n/g, '\r\n')
const pattern = /\/\/ VHK-GENERATED-AGENT-SKILLS:BEGIN[\s\S]*?\/\/ VHK-GENERATED-AGENT-SKILLS:END/
const currentBlock = pattern.exec(source)?.[0]
if (currentBlock === undefined) throw new Error(`생성 본문 표식이 없습니다: ${outputPath}`)
const currentBundleMatch = /const GENERATED_AGENT_SKILL_SOURCE: AgentSkillSourceBundleData = ([\s\S]*?)\r?\n\/\/ VHK-GENERATED-AGENT-SKILLS:END$/.exec(currentBlock)
if (currentBundleMatch === null) throw new Error(`기존 Agent Skill 생성 번들을 읽을 수 없습니다: ${outputPath}`)
let currentBundle
try {
  currentBundle = JSON.parse(currentBundleMatch[1])
} catch (error) {
  throw new Error(`기존 Agent Skill 생성 번들이 올바른 JSON이 아닙니다: ${outputPath}`, {
    cause: error,
  })
}
if (!Number.isInteger(currentBundle.bundleVersion)) {
  throw new Error(`기존 Agent Skill 생성 번들 버전이 올바르지 않습니다: ${outputPath}`)
}
const bundlePayload = (bundle) => JSON.stringify({
  schemaVersion: bundle.schemaVersion,
  skills: bundle.skills,
})
const contentChanged = bundlePayload(currentBundle) !== bundlePayload(sourceBundle)
if (manifest.bundleVersion < currentBundle.bundleVersion) {
  throw new Error(
    `Agent Skill bundleVersion을 낮출 수 없습니다: ${currentBundle.bundleVersion} -> ${manifest.bundleVersion}`,
  )
}
if (contentChanged && manifest.bundleVersion <= currentBundle.bundleVersion) {
  throw new Error(
    `Agent Skill 정본 본문을 바꾸려면 bundleVersion을 ${currentBundle.bundleVersion + 1} 이상으로 올려야 합니다.`,
  )
}
const next = source.replace(pattern, generated)

if (check) {
  if (next !== source) {
    process.stderr.write(`Agent Skill 번들이 정본과 다릅니다: ${outputPath}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(`Agent Skill 번들 일치: ${outputPath}\n`)
  }
} else {
  fs.writeFileSync(outputPath, next, 'utf-8')
  process.stdout.write(`Agent Skill 번들 생성: ${outputPath}\n`)
}
