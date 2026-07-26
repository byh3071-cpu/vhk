import fs from 'node:fs'
import path from 'node:path'
import { ECOSYSTEM_MDC_TEMPLATE, ECOSYSTEM_MDC_VERSION } from '../templates/ecosystem-mdc.js'
import { VHK_README_TEMPLATE, VHK_CONTEXT_SEED } from '../templates/vhk-dir.js'
import {
  detectMcpExampleVariant,
  MCP_JSON_EXAMPLE,
} from '../templates/mcp-json-example.js'
import {
  CORE_RULES_END_TAG,
  CORE_RULES_START_TAG,
  generateCoreRulesContent,
  loadCoreRuleset,
} from './core-rules.js'
import { writeFile, fileExists } from '../utils/file.js'

export const ECOSYSTEM_MDC_REL = '.cursor/rules/ecosystem.mdc'
export const CORE_RULES_REL = '.agents/CORE-RULES.md'
export const VHK_CONTEXT_REL = '.vhk/context.md'
export const VHK_README_REL = '.vhk/README.md'
export const MCP_JSON_EXAMPLE_REL = '.cursor/mcp.json.example'

export type InjectBootstrapResult = 'created' | 'updated' | 'unchanged' | 'skipped'

export type InjectBootstrapOptions = {
  yes?: boolean
  force?: boolean
}

export type InjectBootstrapSummary = {
  ecosystem: InjectBootstrapResult
  coreRules: InjectBootstrapResult
  context: InjectBootstrapResult
  mcpExample: InjectBootstrapResult
}

function isCurrentEcosystemMdc(content: string): boolean {
  return (
    content.includes(`ECOSYSTEM-MDC:START v${ECOSYSTEM_MDC_VERSION}`)
    && content.includes('ECOSYSTEM-MDC:END')
  )
}

function isCurrentCoreRules(content: string): boolean {
  const loaded = loadCoreRuleset()
  const version = loaded.version
  return (
    content.includes(CORE_RULES_START_TAG)
    && content.includes(CORE_RULES_END_TAG)
    && content.includes(`CORE-RULES:START v${version}`)
  )
}

function writeInjectFile(
  fullPath: string,
  next: string,
  options: InjectBootstrapOptions,
  isCurrent: (content: string) => boolean,
  skipIfExists = true,
): InjectBootstrapResult {
  if (fileExists(fullPath)) {
    const current = fs.readFileSync(fullPath, 'utf-8')
    if (isCurrent(current)) return 'unchanged'
    if (skipIfExists && !options.force && !options.yes) return 'skipped'
  }

  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  const existed = fileExists(fullPath)
  writeFile(fullPath, next)
  return existed ? 'updated' : 'created'
}

export function generateEcosystemMdcContent(): string {
  return ECOSYSTEM_MDC_TEMPLATE()
}

export function generateCoreRulesFileContent(existing: string | null): string {
  return generateCoreRulesContent(existing)
}

export function generateTierSContextSeed(cwd: string): string {
  const base = path.basename(cwd)
  const name = base.replace(/-/g, ' ')
  const cr = loadCoreRuleset()
  return VHK_CONTEXT_SEED(name, 'vhk-project', ['see RULES.md'], { source: cr.source, version: cr.version })
}

export function generateMcpJsonExampleContent(cwd: string): string {
  return MCP_JSON_EXAMPLE(detectMcpExampleVariant(cwd))
}

/** @deprecated use injectBootstrapAll — ecosystem.mdc only (backward compat). */
export function injectBootstrap(
  cwd: string,
  options: InjectBootstrapOptions = {},
): InjectBootstrapResult {
  return injectBootstrapAll(cwd, options).ecosystem
}

export function injectBootstrapAll(
  cwd: string,
  options: InjectBootstrapOptions = {},
): InjectBootstrapSummary {
  const opts = { yes: options.yes, force: options.force }

  const ecosystemPath = path.join(cwd, ECOSYSTEM_MDC_REL)
  const ecosystem = writeInjectFile(
    ecosystemPath,
    generateEcosystemMdcContent(),
    opts,
    isCurrentEcosystemMdc,
    true,
  )

  const coreRulesPath = path.join(cwd, CORE_RULES_REL)
  const existingCore = fileExists(coreRulesPath)
    ? fs.readFileSync(coreRulesPath, 'utf-8')
    : null
  const coreRules = writeInjectFile(
    coreRulesPath,
    generateCoreRulesFileContent(existingCore),
    opts,
    isCurrentCoreRules,
    true,
  )

  const contextPath = path.join(cwd, VHK_CONTEXT_REL)
  let context: InjectBootstrapResult
  if (fileExists(contextPath) && !opts.force) {
    context = 'unchanged'
  } else {
    context = writeInjectFile(
      contextPath,
      generateTierSContextSeed(cwd),
      opts,
      () => true,
      false,
    )
  }

  const readmePath = path.join(cwd, VHK_README_REL)
  if (!fileExists(readmePath)) {
    fs.mkdirSync(path.dirname(readmePath), { recursive: true })
    writeFile(readmePath, VHK_README_TEMPLATE())
  }

  const mcpExamplePath = path.join(cwd, MCP_JSON_EXAMPLE_REL)
  const mcpExample = writeInjectFile(
    mcpExamplePath,
    generateMcpJsonExampleContent(cwd),
    { ...opts, yes: true },
    (content) => content === generateMcpJsonExampleContent(cwd),
    false,
  )

  return { ecosystem, coreRules, context, mcpExample }
}
