import fs from 'node:fs'
import path from 'node:path'

const skills = ['vhk-gate','vhk-evolve-loop','vhk-dogfood-issue','vhk-goal-health','vhk-bootstrap-cursor']
const base = process.argv[2]
const output = process.argv[3] ?? 'src/lib/cursor-skill-templates.ts'
const blockStart = '// VHK-GENERATED-SKILL-BODIES:BEGIN'
const blockEnd = '// VHK-GENERATED-SKILL-BODIES:END'
if (!base) {
  throw new Error('사용법: node scripts/gen-cursor-skills.mjs <skills-root> [output-file]')
}
const entries = {}
for (const name of skills) {
  entries[name] = fs.readFileSync(path.join(base, name, 'SKILL.md'), 'utf8')
}
const source = fs.readFileSync(output, 'utf8')
const eol = source.includes('\r\n') ? '\r\n' : '\n'
const generatedBlockLf = [
  blockStart,
  `const CURSOR_SKILL_TEMPLATE_BODIES: Readonly<Record<string, string>> = ${JSON.stringify(entries, null, 2)}`,
  blockEnd,
].join('\n')
const generatedBlock = eol === '\n' ? generatedBlockLf : generatedBlockLf.replace(/\n/g, '\r\n')
const blockPattern = /\/\/ VHK-GENERATED-SKILL-BODIES:BEGIN[\s\S]*?\/\/ VHK-GENERATED-SKILL-BODIES:END/
if (!blockPattern.test(source)) {
  throw new Error(`생성 본문 표식이 없습니다: ${output}`)
}
const out = source.replace(blockPattern, generatedBlock)
fs.writeFileSync(output, out, 'utf8')
process.stdout.write(`생성 완료: ${output}\n`)
