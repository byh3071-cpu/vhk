import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
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
    throw new Error('재사용에는 로컬 전용 게이트 입력 계약이 필요합니다')
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
    if (stat.isSymbolicLink()) throw new Error('산출물의 심볼릭 링크는 봉인할 수 없습니다')
    if (stat.isDirectory()) {
      hash.update(JSON.stringify(['directory']))
      for (const name of readdirSync(path).sort()) visit(join(path, name))
    }
    else if (stat.isFile()) {
      count += 1
      bytes += stat.size
      if (count > 100_000 || bytes > 2_000_000_000) throw new Error('산출물 크기가 재사용 한도를 초과합니다')
      hash.update(JSON.stringify(['file', stat.size, createHash('sha256').update(readFileSync(path)).digest('hex')]))
    } else throw new Error('지원하지 않는 산출물 형식입니다')
  }
  visit(join(root, 'dist'))
  return hash.digest('hex')
}

/* 같은 HEAD의 로컬 마감 단계에만 적용한다. 후속·병합·증거 전용 커밋도 재사용하지 않는다.
 * Git이 깨끗해도 검사 입력이 같다고 보장할 수 없어 ignored 의존성·설정도 읽는다.
 * 비밀값은 해시에만 남긴다. 외부 서비스·파일을 읽는 검사는 새로 실행해야 한다.
 * 읽기 실패와 입력 크기 한도 초과는 재사용을 차단한다. */
export function captureVerificationInputs(cwd: string): VerificationInputs {
  const root = realpathSync(cwd)
  if (realpathSync(getGitRoot(cwd)) !== root) throw new Error('재사용은 저장소 루트에서 실행해야 합니다')
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
  // 분할 패키지는 이 헬퍼가 그대로여도 검사 구현이 바뀔 수 있어 형제 ESM 청크도 포함한다.
  // 빌드된 JS 진입점이 아니면 개발 진입점·소스를 추가 입력으로 선언해야 한다.
  const implementationFile = fileURLToPath(import.meta.url)
  const implementationDir = dirname(implementationFile)
  for (const name of readdirSync(implementationDir).filter(name => name.endsWith('.js')).sort()) {
    const contents = readFileSync(join(implementationDir, name))
    hash.update(JSON.stringify(['implementation', name, contents.length, createHash('sha256').update(contents).digest('hex')]))
  }
  hash.update(readFileSync(implementationFile))
  if (process.argv[1] && existsSync(process.argv[1]) && process.argv[1].endsWith('.js')) hash.update(readFileSync(process.argv[1]))
  let count = 0
  let bytes = 0
  const visited = new Set<string>()
  const add = (label: string, path: string, boundary: string): void => {
    hash.update(JSON.stringify(label))
    if (!existsSync(path)) { hash.update('missing'); return }
    const real = realpathSync(path)
    const rel = relative(boundary, real)
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) || resolve(boundary, rel) !== real) throw new Error('입력이 봉인 대상 폴더를 벗어납니다')
    const stat = lstatSync(real)
    hash.update(JSON.stringify({ real, mode: stat.mode }))
    if (stat.isDirectory()) {
      if (visited.has(real)) { hash.update('visited'); return }
      visited.add(real)
      for (const name of readdirSync(real).sort()) {
        // Vitest/Vite 실행 캐시는 설치된 모듈이 아닌 생성 산출물이다.
        if (label.startsWith('node_modules') && ['.cache', '.vite', '.vite-temp'].includes(name)) continue
        add(`${label}/${name}`, join(real, name), boundary)
      }
    } else if (stat.isFile()) {
      count += 1
      bytes += stat.size
      if (count > 100_000 || bytes > 2_000_000_000) throw new Error('입력 크기가 재사용 한도를 초과합니다')
      hash.update(JSON.stringify(['file', stat.size, createHash('sha256').update(readFileSync(real)).digest('hex')]))
    } else throw new Error('지원하지 않는 입력 형식입니다')
  }
  for (const file of [...files].sort()) {
    if (!SELF_OUTPUTS.has(file)) add(file, join(root, file), root)
  }
  // 로컬 정책·ignored 환경 파일을 포함한다. 빌드 산출물은 검사 종료 뒤 봉인해
  // 빌드에 따른 정상 변경이 소스 입력을 무효화하지 않게 한다.
  for (const file of ['.vhk/config.json', '.vhk/gates.json', '.vhk/mission.json', '.vhk/policy.json', '.vhk/HARD_STOP']) {
    if (!files.has(file)) add(file, join(root, file), root)
  }
  for (const file of readdirSync(root).filter(name => name === '.env' || name.startsWith('.env.')).sort()) {
    if (!files.has(file)) add(file, join(root, file), root)
  }
  for (const file of [...declaredInputs].sort()) {
    const absolute = resolve(root, file)
    const rel = relative(root, absolute)
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) || rel.split(sep)[0] === '.git' || absolute === root) throw new Error('선언한 입력 경계가 유효하지 않습니다')
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
    if (!passingReport(report)) return { report: null, reason: '완료된 통과 검증이 없거나 불완전합니다' }
    const seal = report.reuse
    if (seal?.version !== 1 || seal.reportDigest !== reportDigest(report)) return { report: null, reason: '검증이 봉인되지 않았거나 리포트가 바뀌었습니다' }
    const age = now - Date.parse(report.generatedAt)
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return { report: null, reason: '검증 증거의 재사용 유효기간이 지났습니다' }
    const current = captureVerificationInputs(cwd)
    if (!current.clean || current.sha !== report.commit?.sha || current.sha !== seal.inputs.sha || current.digest !== seal.inputs.digest || artifactsDigest(cwd) !== seal.artifactsDigest) {
      return { report: null, reason: 'HEAD·작업방·의존성·정책·환경 또는 산출물이 바뀌었습니다' }
    }
    return { report, reason: '봉인된 검증 증거를 재사용했습니다' }
  } catch {
    return { report: null, reason: '검증 입력이나 리포트를 안전하게 읽지 못했습니다' }
  }
}
