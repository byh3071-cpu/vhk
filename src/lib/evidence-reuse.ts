import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gitOut, getGitRoot } from './git-repo.js'
import { readJsonFile } from './read-json.js'
import { loadCoreRuleset } from './core-rules.js'
import type { VerifyReport } from '../commands/verify.js'

export interface VerificationInputs { sha: string; digest: string; clean: boolean }
export interface VerificationReuseSeal {
  version: 1
  inputs: VerificationInputs
  reportDigest: string
  artifactsDigest: string
}
const SELF_OUTPUTS = new Set(['.vhk/ledger.jsonl', '.vhk/events/ai-actions.jsonl'])
const MAX_AGE_MS = 10 * 60_000
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

function declaredLocalInputs(root: string): string[] {
  const config = readJsonFile<{ reuse?: { localInputsOnly?: unknown; extraInputs?: unknown } }>(join(root, '.vhk', 'gates.json'))
  const contract = config?.reuse
  if (contract?.localInputsOnly !== true || !Array.isArray(contract.extraInputs) || !contract.extraInputs.every(input => typeof input === 'string' && input.length > 0)) {
    throw new Error('reuse requires a declared local-only gate input contract')
  }
  return contract.extraInputs as string[]
}

function artifactsDigest(root: string): string {
  const hash = createHash('sha256')
  let count = 0
  let bytes = 0
  const visit = (path: string): void => {
    hash.update(JSON.stringify(['path', relative(root, path)]))
    if (!existsSync(path)) { hash.update('missing'); return }
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw new Error('artifact symlinks cannot be sealed')
    if (stat.isDirectory()) {
      hash.update(JSON.stringify(['directory']))
      for (const name of readdirSync(path).sort()) visit(join(path, name))
    }
    else if (stat.isFile()) {
      count += 1
      bytes += stat.size
      if (count > 100_000 || bytes > 2_000_000_000) throw new Error('artifact tree exceeds reuse limit')
      hash.update(JSON.stringify(['file', stat.size, createHash('sha256').update(readFileSync(path)).digest('hex')]))
    } else throw new Error('unsupported artifact type')
  }
  visit(join(root, 'dist'))
  return hash.digest('hex')
}

/* This is a bounded local closing step, not a general cache. Only the same HEAD
 * is accepted; no descendant, merge or evidence-only commit is inferred safe.
 * Ignored dependency/config files are read too: Git cleanliness alone does not
 * prove that the commands will receive the same inputs. Secrets stay in hashes.
 * Arbitrary external services/files cannot be sealed; callers must keep fresh
 * verification for those gates. Read failures and oversized trees fail closed. */
export function captureVerificationInputs(cwd: string): VerificationInputs {
  const root = realpathSync(cwd)
  if (realpathSync(getGitRoot(cwd)) !== root) throw new Error('reuse requires the repository root')
  const declaredInputs = declaredLocalInputs(root)
  const sha = gitOut(['rev-parse', 'HEAD'], cwd).trim()
  const changed = gitOut(['diff', '--name-only', '-z', 'HEAD'], cwd).split('\0').filter(Boolean)
  const untracked = gitOut(['ls-files', '--others', '--exclude-standard', '-z'], cwd).split('\0').filter(Boolean)
  const clean = [...changed, ...untracked].every(file => SELF_OUTPUTS.has(file))
  const files = new Set(gitOut(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd).split('\0').filter(Boolean))
  const hash = createHash('sha256')
  hash.update(JSON.stringify({ root, sha, node: process.version, platform: process.platform, arch: process.arch }))
  hash.update(JSON.stringify(Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b))))
  hash.update(JSON.stringify(loadCoreRuleset()))
  // In the bundled CLI this hashes the running implementation, not just its version.
  hash.update(readFileSync(fileURLToPath(import.meta.url)))
  let count = 0
  let bytes = 0
  const visited = new Set<string>()
  const add = (label: string, path: string, boundary: string): void => {
    hash.update(JSON.stringify(label))
    if (!existsSync(path)) { hash.update('missing'); return }
    const real = realpathSync(path)
    const rel = relative(boundary, real)
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) || resolve(boundary, rel) !== real) throw new Error('input escapes sealed directory')
    const stat = lstatSync(real)
    hash.update(JSON.stringify({ real, mode: stat.mode }))
    if (stat.isDirectory()) {
      if (visited.has(real)) { hash.update('visited'); return }
      visited.add(real)
      for (const name of readdirSync(real).sort()) {
        // Vitest/Vite runtime caches are generated outputs, not installed modules.
        if (label.startsWith('node_modules') && ['.cache', '.vite', '.vite-temp'].includes(name)) continue
        add(`${label}/${name}`, join(real, name), boundary)
      }
    } else if (stat.isFile()) {
      count += 1
      bytes += stat.size
      if (count > 100_000 || bytes > 2_000_000_000) throw new Error('input tree exceeds reuse limit')
      hash.update(JSON.stringify(['file', stat.size, createHash('sha256').update(readFileSync(real)).digest('hex')]))
    } else throw new Error('unsupported input type')
  }
  for (const file of [...files].sort()) {
    if (!SELF_OUTPUTS.has(file)) add(file, join(root, file), root)
  }
  // Include local policy, ignored env and artifacts. Build output is sealed after
  // gates; its expected change during build does not invalidate source inputs.
  for (const file of ['.vhk/config.json', '.vhk/gates.json', '.vhk/mission.json', '.vhk/policy.json', '.vhk/HARD_STOP']) {
    if (!files.has(file)) add(file, join(root, file), root)
  }
  for (const file of readdirSync(root).filter(name => name === '.env' || name.startsWith('.env.')).sort()) {
    if (!files.has(file)) add(file, join(root, file), root)
  }
  for (const file of [...declaredInputs].sort()) {
    const absolute = resolve(root, file)
    const rel = relative(root, absolute)
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) || rel.split(sep)[0] === '.git' || absolute === root) throw new Error('invalid declared input boundary')
    add(`declared:${file}`, absolute, root)
  }
  add('node_modules', join(root, 'node_modules'), root)
  return { sha, clean, digest: hash.digest('hex') }
}

function reportDigest(report: VerifyReport): string {
  const { reuse: _seal, reuseUnavailable: _unavailable, ...evidence } = report
  return digest(JSON.stringify(evidence))
}

function passingReport(report: VerifyReport): boolean {
  const ids = ['typecheck', 'lint', 'test', 'build', 'secure']
  return report.schemaVersion === 2 && report.status === 'PASS' && report.commit?.dirty === false &&
    Array.isArray(report.gates) && report.gates.length === ids.length &&
    ids.every(id => report.gates.filter(gate => gate.id === id).length === 1) &&
    report.gates.every(gate => (gate.status === 'pass' && gate.skipped === false &&
      (gate.exitCode === 0 || (gate.id === 'secure' && gate.exitCode === null))) ||
      (gate.status === 'skip' && gate.skipped === true && gate.declaredOptional === true))
}

export function sealVerification(cwd: string, report: VerifyReport, before: VerificationInputs): void {
  delete report.reuse
  if (!passingReport(report) || !before.clean || report.commit?.sha !== before.sha) return
  const after = captureVerificationInputs(cwd)
  if (!after.clean || after.sha !== before.sha || after.digest !== before.digest) return
  report.reuse = { version: 1, inputs: after, reportDigest: reportDigest(report), artifactsDigest: artifactsDigest(cwd) }
}

export function readReusableVerification(cwd: string, now = Date.now()): { report: VerifyReport | null; reason: string } {
  try {
    const report = readJsonFile<VerifyReport>(join(cwd, '.vhk', 'reports', 'latest.json'))
    if (!passingReport(report)) return { report: null, reason: 'missing or incomplete passing verification' }
    const seal = report.reuse
    if (seal?.version !== 1 || seal.reportDigest !== reportDigest(report)) return { report: null, reason: 'verification was not sealed or report changed' }
    const age = now - Date.parse(report.generatedAt)
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return { report: null, reason: 'verification reuse window expired' }
    const current = captureVerificationInputs(cwd)
    if (!current.clean || current.sha !== report.commit?.sha || current.sha !== seal.inputs.sha || current.digest !== seal.inputs.digest || artifactsDigest(cwd) !== seal.artifactsDigest) {
      return { report: null, reason: 'HEAD, workspace, dependencies, policy or environment changed' }
    }
    return { report, reason: 'sealed verification reused' }
  } catch {
    return { report: null, reason: 'verification inputs or report could not be read safely' }
  }
}
