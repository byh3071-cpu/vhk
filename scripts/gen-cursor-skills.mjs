import fs from 'node:fs'
import path from 'node:path'
const skills = ['vhk-gate','vhk-evolve-loop','vhk-dogfood-issue','vhk-goal-health','vhk-bootstrap-cursor']
const base = 'C:/Users/Public/dev/yohan-ecosystem/yohan-cc-skills/plugins/workflow/skills'
const entries = {}
for (const name of skills) {
  entries[name] = fs.readFileSync(path.join(base, name, 'SKILL.md'), 'utf8')
}
const header = "import { existsSync, mkdirSync, writeFileSync } from 'node:fs'\nimport { join } from 'node:path'\n\n/** yohan-cc-skills workflow skills bundle — bootstrap cursor installs create-if-missing. */\nexport const CURSOR_SKILL_TEMPLATES: Readonly<Record<string, string>> = "
const footer = "\n\nexport interface InstallCursorSkillsResult {\n  created: string[]\n  skipped: string[]\n}\n\nexport function installCursorSkills(cwd: string = process.cwd()): InstallCursorSkillsResult {\n  const skillsRoot = join(cwd, '.cursor', 'skills')\n  const created: string[] = []\n  const skipped: string[] = []\n  for (const [name, content] of Object.entries(CURSOR_SKILL_TEMPLATES)) {\n    const skillDir = join(skillsRoot, name)\n    const skillFile = join(skillDir, 'SKILL.md')\n    if (existsSync(skillFile)) {\n      skipped.push(name)\n      continue\n    }\n    mkdirSync(skillDir, { recursive: true })\n    writeFileSync(skillFile, content, 'utf-8')\n    created.push(name)\n  }\n  return { created, skipped }\n}\n"
const out = header + JSON.stringify(entries, null, 2) + footer
fs.writeFileSync('C:/Users/Public/dev/yohan-ecosystem/vhk/src/lib/cursor-skill-templates.ts', out, 'utf8')
console.log('ok')