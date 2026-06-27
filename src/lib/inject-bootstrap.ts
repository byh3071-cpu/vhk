import fs from 'node:fs'
import path from 'node:path'
import { ECOSYSTEM_MDC_TEMPLATE, ECOSYSTEM_MDC_VERSION } from '../templates/ecosystem-mdc.js'
import { writeFile, fileExists } from '../utils/file.js'

export const ECOSYSTEM_MDC_REL = '.cursor/rules/ecosystem.mdc'

export type InjectBootstrapResult = 'created' | 'updated' | 'unchanged' | 'skipped'

export type InjectBootstrapOptions = {
  yes?: boolean
  force?: boolean
}

function isCurrentTemplate(content: string): boolean {
  return (
    content.includes(`ECOSYSTEM-MDC:START v${ECOSYSTEM_MDC_VERSION}`)
    && content.includes('ECOSYSTEM-MDC:END')
  )
}

export function generateEcosystemMdcContent(): string {
  return ECOSYSTEM_MDC_TEMPLATE()
}

export function injectBootstrap(
  cwd: string,
  options: InjectBootstrapOptions = {}
): InjectBootstrapResult {
  const fullPath = path.join(cwd, ECOSYSTEM_MDC_REL)
  const next = generateEcosystemMdcContent()

  if (fileExists(fullPath)) {
    const current = fs.readFileSync(fullPath, 'utf-8')
    if (isCurrentTemplate(current)) return 'unchanged'
    if (!options.force && !options.yes) return 'skipped'
  }

  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  const existed = fileExists(fullPath)
  writeFile(fullPath, next)
  return existed ? 'updated' : 'created'
}
