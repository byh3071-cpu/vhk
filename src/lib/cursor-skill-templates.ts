import {
  installAgentSkills,
  projectSkillTemplates,
} from './agent-skill-templates.js'

/*
 * 호환성 모듈: 신규 설치의 정본은 .agents/skills다. 기존 export 이름은 유지하지만
 * .cursor/skills에는 더 이상 쓰지 않는다.
 */
export const CURSOR_SKILL_TEMPLATES = projectSkillTemplates()

export interface InstallCursorSkillsResult {
  created: string[]
  updated: string[]
  skipped: string[]
  outdated: string[]
}

function skillNames(paths: string[]): string[] {
  return [...new Set(paths.map((item) => item.split('/')[2]).filter((name) => name !== undefined))]
}

/** @deprecated 신규 코드는 installAgentSkills를 사용한다. */
export function installCursorSkills(cwd: string = process.cwd()): InstallCursorSkillsResult {
  const result = installAgentSkills(cwd)
  return {
    created: skillNames(result.created),
    updated: skillNames(result.updated),
    skipped: skillNames(result.unchanged),
    outdated: skillNames(result.conflicts),
  }
}
