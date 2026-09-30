import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, realpathSync, symlinkSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gitRun, getCommitInfo } from '../src/lib/git-repo.js'
import * as gitRepo from '../src/lib/git-repo.js'
import { removeDirSync } from '../src/lib/fs-remove.js'
import { buildReport, verifyEvidence, checkEvidenceFreshness } from '../src/commands/verify.js'
import { collectReceipt } from '../src/commands/receipt.js'
import { renderReceiptMarkdown } from '../src/lib/receipt.js'
import { buildReceiptLogEntry } from '../src/lib/receipt-log.js'
import { captureVerificationInputs, sealVerification, readReusableVerification } from '../src/lib/evidence-reuse.js'

const roots: string[] = []
function fixture(root = mkdtempSync(join(tmpdir(), 'vhk-reuse-'))) {
  roots.push(root)
  mkdirSync(join(root, '.vhk', 'reports'), { recursive: true })
  mkdirSync(join(root, 'node_modules', 'sample-dependency'), { recursive: true })
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n.vhk/reports/\n.vhk/receipts/\n.vhk/phase2/\n.vhk/config.json\n.vhk/mission.json\n.vhk/events/\n.vhk/ledger.jsonl\ndist/\n.env\n')
  writeFileSync(join(root, '.vhk', '.gitignore'), 'reports/\nreceipts/\n')
  writeFileSync(join(root, '.vhk', 'gates.json'), JSON.stringify({ schemaVersion: 1, gates: {}, reuse: { localInputsOnly: true, extraInputs: [] } }))
  writeFileSync(join(root, 'source.ts'), 'export const value = 1\n')
  writeFileSync(join(root, 'node_modules', 'sample-dependency', 'index.js'), 'module.exports = 1\n')
  gitRun(['init'], root)
  gitRun(['add', '.'], root)
  gitRun(['-c', 'user.name=sample', '-c', 'user.email=sample@example.invalid', 'commit', '-m', 'sample'], root)
  const report = buildReport(['typecheck', 'lint', 'test', 'build', 'secure'].map(id => ({
    id: id as 'typecheck', label: id, status: 'pass' as const, skipped: false, exitCode: id === 'secure' ? null : 0,
  })), new Date().toISOString(), '2026-09-30', getCommitInfo(root))
  const before = captureVerificationInputs(root)
  sealVerification(root, report, before)
  writeFileSync(join(root, '.vhk', 'reports', 'latest.json'), JSON.stringify(report))
  return { root, report }
}
function boundaryFixture(siblingName: string) {
  const parent = mkdtempSync(join(tmpdir(), 'vhk-boundary-'))
  roots.push(parent)
  const fixtureResult = fixture(join(parent, 'repo'))
  const sibling = join(parent, siblingName)
  mkdirSync(sibling)
  writeFileSync(join(sibling, 'source.ts'), 'outside\n')
  return { ...fixtureResult, parent, sibling }
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  for (const root of roots.splice(0)) removeDirSync(root)
})

function realGateFixture(program: string) {
  const { root, report } = fixture()
  mkdirSync(join(root, '.vhk', 'phase2'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: {
    typecheck: 'node gate.cjs', lint: 'node gate.cjs', 'test:run': 'node gate.cjs', build: 'node gate.cjs',
  } }))
  writeFileSync(join(root, 'gate.cjs'), program)
  gitRun(['add', '.'], root)
  gitRun(['-c', 'user.name=sample', '-c', 'user.email=sample@example.invalid', 'commit', '-m', 'gate fixture'], root)
  report.commit = getCommitInfo(root)
  sealVerification(root, report, captureVerificationInputs(root))
  writeFileSync(join(root, '.vhk', 'reports', 'latest.json'), JSON.stringify(report))
  return { root, report }
}

describe('opt-in verification reuse', () => {
  it('accepts a Git root reported through a short path alias', () => {
    const { root } = fixture()
    const expected = captureVerificationInputs(root)
    const native = realpathSync.native
    const alias = join(root, 'SAMPLE~1')
    vi.spyOn(gitRepo, 'getGitRoot').mockReturnValue(alias)
    vi.spyOn(realpathSync, 'native').mockImplementation(path => path === alias ? native(root) : native(path))
    expect(captureVerificationInputs(root)).toEqual(expected)
  })

  it.each(['win32', 'linux'] as const)('compares root casing according to %s filesystem rules', platform => {
    const { root } = fixture()
    const native = realpathSync.native
    const canonical = native(root)
    const differentCase = canonical === canonical.toUpperCase() ? canonical.toLowerCase() : canonical.toUpperCase()
    vi.stubGlobal('process', new Proxy(process, {
      get(target, key, receiver) { return key === 'platform' ? platform : Reflect.get(target, key, receiver) },
    }))
    const expected = captureVerificationInputs(root)
    const alias = join(root, 'git-root-alias')
    vi.spyOn(gitRepo, 'getGitRoot').mockReturnValue(alias)
    vi.spyOn(realpathSync, 'native').mockImplementation(path => path === alias ? differentCase : native(path))
    if (platform === 'win32') expect(captureVerificationInputs(root)).toEqual(expected)
    else expect(() => captureVerificationInputs(root)).toThrow('재사용은 저장소 루트에서 실행해야 합니다')
  })

  it('still rejects a repository subdirectory as the execution root', () => {
    const { root } = fixture()
    expect(() => captureVerificationInputs(join(root, 'node_modules'))).toThrow('재사용은 저장소 루트에서 실행해야 합니다')
  })

  it('rejects a native input path escaping into a sibling repository', () => {
    const { root } = fixture()
    const sibling = fixture().root
    const native = realpathSync.native
    const source = native(join(root, 'source.ts'))
    const outside = native(join(sibling, 'source.ts'))
    const paths = vi.spyOn(realpathSync, 'native').mockImplementation(path => {
      const real = native(path)
      return real === source ? outside : real
    })
    expect(() => captureVerificationInputs(root)).toThrow('입력이 봉인 대상 폴더를 벗어납니다')
    expect(paths).toHaveReturnedWith(outside)
  })

  it.each(['repo-other', 'REPO-other'])('rejects the prefix sibling %s after native resolution', siblingName => {
    const { root, sibling } = boundaryFixture(siblingName)
    const native = realpathSync.native
    const source = native(join(root, 'source.ts'))
    const outside = native(join(sibling, 'source.ts'))
    const paths = vi.spyOn(realpathSync, 'native').mockImplementation(path => {
      const real = native(path)
      return real === source ? outside : real
    })
    expect(() => captureVerificationInputs(root)).toThrow('입력이 봉인 대상 폴더를 벗어납니다')
    expect(paths).toHaveReturnedWith(outside)
    expect(readReusableVerification(root).report).toBeNull()
  })

  it('rejects a case-distinct native sibling instead of folding input identity', () => {
    const { root } = boundaryFixture('repo-other')
    const native = realpathSync.native
    const canonical = native(root)
    const source = native(join(root, 'source.ts'))
    // #631: Windows의 대소문자 구분 폴더 두 개를 native 출력으로 재현한다.
    // 일반 Windows 폴더에서도 lstat/read는 가능하므로 잘못된 허용을 숨기지 않는다.
    const outside = join(canonical.slice(0, -'repo'.length) + 'REPO', 'source.ts')
    const paths = vi.spyOn(realpathSync, 'native').mockImplementation(path => {
      const real = native(path)
      return real === source ? outside : real
    })
    expect(() => captureVerificationInputs(root)).toThrow('입력이 봉인 대상 폴더를 벗어납니다')
    expect(paths).toHaveReturnedWith(outside)
    expect(readReusableVerification(root).report).toBeNull()
  })

  it.each(['inside', 'outside'] as const)('resolves an 8.3 input alias before checking its %s target', location => {
    const { root, sibling } = boundaryFixture('repo-other')
    const native = realpathSync.native
    const alias = join(native(root), '.vhk', 'phase2', 'INPUT~1')
    mkdirSync(join(root, '.vhk', 'phase2'))
    writeFileSync(alias, 'alias placeholder')
    writeFileSync(join(root, '.vhk', 'gates.json'), JSON.stringify({ reuse: {
      localInputsOnly: true, extraInputs: ['.vhk/phase2/INPUT~1'],
    } }))
    const target = native(join(location === 'inside' ? root : sibling, 'source.ts'))
    const paths = vi.spyOn(realpathSync, 'native').mockImplementation(path => path === alias ? target : native(path))
    if (location === 'inside') expect(() => captureVerificationInputs(root)).not.toThrow()
    else expect(() => captureVerificationInputs(root)).toThrow('입력이 봉인 대상 폴더를 벗어납니다')
    expect(paths).toHaveReturnedWith(target)
  })

  it.each(['inside', 'outside'] as const)('checks the real %s target of a junction input', location => {
    const { root, sibling } = boundaryFixture('repo-other')
    mkdirSync(join(root, '.vhk', 'phase2'))
    const target = location === 'inside' ? join(root, 'node_modules', 'sample-dependency') : sibling
    symlinkSync(target, join(root, '.vhk', 'phase2', 'input-link'), process.platform === 'win32' ? 'junction' : 'dir')
    writeFileSync(join(root, '.vhk', 'gates.json'), JSON.stringify({ reuse: {
      localInputsOnly: true, extraInputs: ['.vhk/phase2/input-link'],
    } }))
    if (location === 'inside') expect(() => captureVerificationInputs(root)).not.toThrow()
    else expect(() => captureVerificationInputs(root)).toThrow('입력이 봉인 대상 폴더를 벗어납니다')
  })

  it('accepts a junction alias only when it resolves to the same execution root', () => {
    const { root, parent, sibling } = boundaryFixture('repo-other')
    const alias = join(parent, 'REPO~1')
    symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir')
    expect(captureVerificationInputs(alias)).toEqual(captureVerificationInputs(root))
    const native = realpathSync.native
    const gitRoot = vi.spyOn(gitRepo, 'getGitRoot').mockReturnValue(native(sibling))
    expect(() => captureVerificationInputs(alias)).toThrow('재사용은 저장소 루트에서 실행해야 합니다')
    expect(gitRoot).toHaveBeenCalled()
  })

  it.each(['direct', 'case-alias'] as const)('rejects declaring the execution root through a %s path', kind => {
    const { root } = boundaryFixture('repo-other')
    writeFileSync(join(root, '.vhk', 'gates.json'), JSON.stringify({ reuse: {
      localInputsOnly: true, extraInputs: [kind === 'direct' ? '.' : realpathSync.native(root).toUpperCase()],
    } }))
    expect(() => captureVerificationInputs(root)).toThrow('선언한 입력 경계가 유효하지 않습니다')
  })

  it('failed verify cannot become receipt PASS through an implicit retry (reuse=true)', () => {
    const { root } = realGateFixture(`
      const fs = require('node:fs');
      const file = '.vhk/phase2/count';
      const attempts = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\\n').length : 0;
      fs.appendFileSync(file, 'run\\n');
      process.exit(attempts === 0 ? 1 : 0);
    `)
    const failed = verifyEvidence(root, true)
    expect(failed.report.status).toBe('FAIL')
    expect(failed.report.reuse).toBeUndefined()
    expect(readReusableVerification(root).report).toBeNull()
    const receipt = collectReceipt(root, null, true)
    expect(receipt.decision).toBe('block')
    const count = () => readFileSync(join(root, '.vhk', 'phase2', 'count'), 'utf8').trim().split('\n').length
    expect(count()).toBe(4)
    // 복구는 flaky 입력을 먼저 고친 뒤 명시적으로 검증한다. 통과 변형은
    // 산출물만 기록하므로 로컬 입력 계약이 유효하다.
    writeFileSync(join(root, 'gate.cjs'), "require('node:fs').appendFileSync('.vhk/phase2/count', 'run\\n')")
    gitRun(['add', 'gate.cjs'], root)
    gitRun(['-c', 'user.name=sample', '-c', 'user.email=sample@example.invalid', 'commit', '-m', 'fixed gate'], root)
    expect(verifyEvidence(root, true).report.status).toBe('PASS')
    expect(collectReceipt(root, null, true).decision).toBe('pass')
    expect(count()).toBe(8)
  }, 30_000)

  it('default receipt runs fresh gates after an earlier FAIL and a fixed commit', () => {
    const { root } = realGateFixture("require('node:fs').appendFileSync('.vhk/phase2/count', 'run\\n'); process.exit(1)")
    const failed = collectReceipt(root)
    expect(failed.decision).toBe('block')
    const count = () => readFileSync(join(root, '.vhk', 'phase2', 'count'), 'utf8').trim().split('\n').length
    expect(count()).toBe(4)
    writeFileSync(join(root, 'gate.cjs'), "require('node:fs').appendFileSync('.vhk/phase2/count', 'run\\n')")
    gitRun(['add', 'gate.cjs'], root)
    gitRun(['-c', 'user.name=sample', '-c', 'user.email=sample@example.invalid', 'commit', '-m', 'fixed gate'], root)
    const recovered = collectReceipt(root)
    expect(count()).toBe(8)
    expect(recovered.decision).toBe('pass')
    expect(recovered.head.sha).not.toBe(failed.head.sha)
    expect(recovered.evidence.gates.red).toBe(false)
    expect(recovered.evidence.stale).toBe(false)
  })

  it('default receipt runs real gates instead of crashing on a malformed FAIL report', () => {
    const { root } = realGateFixture("require('node:fs').appendFileSync('.vhk/phase2/count', 'run\\n')")
    writeFileSync(join(root, '.vhk', 'reports', 'latest.json'), JSON.stringify({ status: 'FAIL' }))
    expect(collectReceipt(root).decision).toBe('pass')
    expect(readFileSync(join(root, '.vhk', 'phase2', 'count'), 'utf8').trim().split('\n')).toHaveLength(4)
  })

  it.each(['PASS', 'FAIL'] as const)('interrupted verify remains failed and invalidates reuse after prior %s', async prior => {
    const { root, report } = realGateFixture(`
      const fs = require('node:fs');
      fs.appendFileSync('.vhk/phase2/gate-started', 'run\\n');
      const started = Date.now();
      setInterval(() => {
        if (fs.existsSync('.vhk/phase2/release-gate') || Date.now() - started >= 20000) {
          fs.writeFileSync('.vhk/phase2/gate-finished', 'done');
          process.exit(0);
        }
      }, 25);
    `)
    if (prior === 'FAIL') {
      report.status = 'FAIL'
      report.gates[0].status = 'fail'
      delete report.reuse
      writeFileSync(join(root, '.vhk', 'reports', 'latest.json'), JSON.stringify(report))
    } else expect(readReusableVerification(root).report).not.toBeNull()
    // #631: tsx CLI 래퍼를 죽이면 Linux의 실제 verifier가 살아남는다.
    // Node에 로더를 직접 붙여 소유한 PID가 실제 verifier가 되게 한다.
    const cliArgs = ['--import', new URL('../node_modules/tsx/dist/loader.mjs', import.meta.url).href,
      fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'verify']
    const child = spawn(process.execPath, [...cliArgs, '--json'], {
      cwd: root, env: { ...process.env }, stdio: 'ignore', windowsHide: true,
    })
    const exited = once(child, 'exit')
    let during: ReturnType<typeof readReusableVerification> | undefined
    try {
      const deadline = Date.now() + 12_000
      while (!existsSync(join(root, '.vhk', 'phase2', 'gate-started'))) {
        if (child.exitCode !== null || Date.now() >= deadline) throw new Error('소유한 검증 프로세스가 게이트에 도달하지 못했습니다')
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      during = readReusableVerification(root)
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await exited
      // verifier 종료를 확인한 뒤 첫 게이트만 해제하고 실제 종료 기록을 기다린다.
      writeFileSync(join(root, '.vhk', 'phase2', 'release-gate'), 'release')
      if (existsSync(join(root, '.vhk', 'phase2', 'gate-started'))) {
        const deadline = Date.now() + 8_000
        while (!existsSync(join(root, '.vhk', 'phase2', 'gate-finished'))) {
          if (Date.now() >= deadline) throw new Error('소유한 게이트가 종료되지 않았습니다')
          await new Promise(resolve => setTimeout(resolve, 25))
        }
      }
    }
    expect(during?.report).toBeNull()
    expect(readReusableVerification(root).report).toBeNull()
    expect(collectReceipt(root, null, true).decision).toBe('block')
    const interrupted = JSON.parse(readFileSync(join(root, '.vhk', 'reports', 'latest.json'), 'utf8'))
    expect(interrupted.status).toBe('FAIL')
    if (prior === 'FAIL') expect(interrupted.gates[0].status).toBe('fail')
    expect(checkEvidenceFreshness(interrupted, getCommitInfo(root)).stale).toBe(true)
    for (const option of ['--report', '--check-fresh']) {
      const result = spawnSync(process.execPath, [...cliArgs, option], {
        cwd: root, env: { ...process.env }, encoding: 'utf8', windowsHide: true,
      })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
    }
    expect(readFileSync(join(root, '.vhk', 'phase2', 'gate-started'), 'utf8').trim().split('\n')).toHaveLength(1)
  }, 30_000)

  it('reuses the real report on identical clean inputs', () => {
    const { root, report } = fixture()
    expect(readReusableVerification(root).report?.generatedAt).toBe(report.generatedAt)
  })
  it.each(['source.ts', '.vhk/config.json', '.vhk/mission.json', '.env', 'node_modules/sample-dependency/index.js'])('blocks changed input %s', file => {
    const { root } = fixture()
    writeFileSync(join(root, file), 'changed')
    expect(readReusableVerification(root).report).toBeNull()
  })
  it('blocks new untracked inputs', () => {
    const { root } = fixture()
    writeFileSync(join(root, 'new.ts'), 'new')
    expect(readReusableVerification(root).report).toBeNull()
  })
  it('blocks changed build artifacts', () => {
    const { root } = fixture()
    mkdirSync(join(root, 'dist'))
    writeFileSync(join(root, 'dist', 'index.js'), 'changed build')
    expect(readReusableVerification(root).report).toBeNull()
  })
  it('frames artifact contents so adjacent files cannot conceal a changed build', () => {
    const { root, report } = fixture()
    mkdirSync(join(root, 'dist'))
    const nextPath = join('dist', 'b')
    writeFileSync(join(root, 'dist', 'a'), '')
    writeFileSync(join(root, 'dist', 'b'), `${nextPath}x`)
    sealVerification(root, report, captureVerificationInputs(root))
    writeFileSync(join(root, '.vhk', 'reports', 'latest.json'), JSON.stringify(report))
    writeFileSync(join(root, 'dist', 'a'), nextPath)
    writeFileSync(join(root, 'dist', 'b'), 'x')
    expect(readReusableVerification(root).report).toBeNull()
  })
  it('blocks changed environment', () => {
    const { root } = fixture()
    const original = process.env.VHK_SAMPLE_REUSE_INPUT
    try {
      process.env.VHK_SAMPLE_REUSE_INPUT = 'changed'
      expect(readReusableVerification(root).report).toBeNull()
    } finally {
      if (original === undefined) delete process.env.VHK_SAMPLE_REUSE_INPUT
      else process.env.VHK_SAMPLE_REUSE_INPUT = original
    }
  })
  it('blocks undeclared local-only contracts instead of silently caching arbitrary gates', () => {
    const { root } = fixture()
    writeFileSync(join(root, '.vhk', 'gates.json'), '{}')
    expect(() => captureVerificationInputs(root)).toThrow()
    expect(readReusableVerification(root).report).toBeNull()
  })
  it('rejects inputs outside the worktree including Windows drive changes', () => {
    const { root } = fixture()
    for (const input of ['../outside', ...(process.platform === 'win32' ? ['Z:\\sample-missing-input'] : ['/sample-missing-input'])]) {
      writeFileSync(join(root, '.vhk', 'gates.json'), JSON.stringify({ reuse: { localInputsOnly: true, extraInputs: [input] } }))
      expect(() => captureVerificationInputs(root)).toThrow()
    }
  })
  it('captures declared ignored inputs and blocks changes', () => {
    const { root, report } = fixture()
    appendFileSync(join(root, '.gitignore'), 'ignored-input.txt\n')
    writeFileSync(join(root, '.vhk', 'gates.json'), JSON.stringify({ reuse: { localInputsOnly: true, extraInputs: ['ignored-input.txt'] } }))
    writeFileSync(join(root, 'ignored-input.txt'), 'before')
    gitRun(['add', '.'], root)
    gitRun(['-c', 'user.name=sample', '-c', 'user.email=sample@example.invalid', 'commit', '-m', 'contract'], root)
    report.commit = getCommitInfo(root)
    sealVerification(root, report, captureVerificationInputs(root))
    writeFileSync(join(root, '.vhk', 'reports', 'latest.json'), JSON.stringify(report))
    expect(readReusableVerification(root).report).not.toBeNull()
    writeFileSync(join(root, 'ignored-input.txt'), 'after')
    expect(readReusableVerification(root).report).toBeNull()
  })
  it('blocks changed HEAD even when file content is identical', () => {
    const { root } = fixture()
    gitRun(['-c', 'user.name=sample', '-c', 'user.email=sample@example.invalid', 'commit', '--allow-empty', '-m', 'new head'], root)
    expect(readReusableVerification(root).report).toBeNull()
  })
  it('only excludes the two exact verify ledgers', () => {
    const { root } = fixture()
    mkdirSync(join(root, '.vhk', 'events'), { recursive: true })
    appendFileSync(join(root, '.vhk', 'ledger.jsonl'), '{}\n')
    appendFileSync(join(root, '.vhk', 'events', 'ai-actions.jsonl'), '{}\n')
    expect(readReusableVerification(root).report).not.toBeNull()
  })
  it('reuses with modified tracked verify ledgers and blocks other tracked events', () => {
    const { root, report } = fixture()
    mkdirSync(join(root, '.vhk', 'events'), { recursive: true })
    for (const file of ['.vhk/ledger.jsonl', '.vhk/events/ai-actions.jsonl', '.vhk/events/other.jsonl']) writeFileSync(join(root, file), '{}\n')
    gitRun(['add', '--force', '.vhk/ledger.jsonl', '.vhk/events/ai-actions.jsonl', '.vhk/events/other.jsonl'], root)
    gitRun(['-c', 'user.name=sample', '-c', 'user.email=sample@example.invalid', 'commit', '-m', 'tracked ledgers'], root)
    report.commit = getCommitInfo(root)
    sealVerification(root, report, captureVerificationInputs(root))
    writeFileSync(join(root, '.vhk', 'reports', 'latest.json'), JSON.stringify(report))
    appendFileSync(join(root, '.vhk', 'ledger.jsonl'), '{}\n')
    appendFileSync(join(root, '.vhk', 'events', 'ai-actions.jsonl'), '{}\n')
    const receipt = collectReceipt(root, null, true)
    expect(receipt.decision).toBe('pass')
    expect(receipt.evidence.gates.source).toBe('reused')
    expect(renderReceiptMarkdown(receipt)).toContain('source=reused')
    expect(buildReceiptLogEntry(receipt).verificationSource).toBe('reused')
    expect(buildReceiptLogEntry(receipt).verifiedAt).toBe(report.generatedAt)
    appendFileSync(join(root, '.vhk', 'events', 'other.jsonl'), '{}\n')
    expect(collectReceipt(root, null, true).decision).toBe('block')
  })
  it('blocks failed or altered gate results', () => {
    const { root, report } = fixture()
    report.gates[0].status = 'fail'
    writeFileSync(join(root, '.vhk', 'reports', 'latest.json'), JSON.stringify(report))
    expect(readReusableVerification(root).report).toBeNull()
  })
  it('blocks missing, corrupt and expired evidence', () => {
    const { root } = fixture()
    expect(readReusableVerification(root, Date.now() + 11 * 60_000).report).toBeNull()
    writeFileSync(join(root, '.vhk', 'reports', 'latest.json'), '{}')
    expect(readReusableVerification(root).report).toBeNull()
    writeFileSync(join(root, '.vhk', 'reports', 'latest.json'), '{')
    expect(readReusableVerification(root).report).toBeNull()
  })
  it('does not seal inputs that changed during gate execution', () => {
    const { root, report } = fixture()
    delete report.reuse
    const before = captureVerificationInputs(root)
    writeFileSync(join(root, 'source.ts'), 'changed during verify')
    sealVerification(root, report, before)
    expect(report.reuse).toBeUndefined()
  })
  it('receipt reuses without launching any gate, and a miss BLOCKs without a refresh', () => {
    const { root } = fixture()
    mkdirSync(join(root, '.vhk', 'phase2'), { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: {
      typecheck: 'node gate.cjs', lint: 'node gate.cjs', 'test:run': 'node gate.cjs', build: 'node gate.cjs',
    } }))
    writeFileSync(join(root, 'gate.cjs'), "require('node:fs').appendFileSync('.vhk/phase2/count', 'run\\n')")
    gitRun(['add', '.'], root)
    gitRun(['-c', 'user.name=sample', '-c', 'user.email=sample@example.invalid', 'commit', '-m', 'real gates'], root)
    const verified = verifyEvidence(root, true)
    expect(verified.report.status).toBe('PASS')
    expect(verified.report.reuse).toBeDefined()
    const count = () => readFileSync(join(root, '.vhk', 'phase2', 'count'), 'utf8').split('\n').filter(Boolean).length
    expect(count()).toBe(4)
    expect(collectReceipt(root, null, true).decision).toBe('pass')
    expect(count()).toBe(4)
    writeFileSync(join(root, 'source.ts'), 'changed')
    const blocked = collectReceipt(root, null, true)
    expect(blocked.decision).toBe('block')
    expect(blocked.evidence.gates.status).toBe('WARN')
    expect(blocked.evidence.gates.source).toBe('unavailable')
    expect(count()).toBe(4)
  }, 30_000)
  it('a corrupt cache cannot show gate PASS in a blocked receipt', () => {
    const { root } = fixture()
    writeFileSync(join(root, '.vhk', 'reports', 'latest.json'), '{')
    const blocked = collectReceipt(root, null, true)
    expect(blocked.decision).toBe('block')
    expect(blocked.evidence.gates.status).toBe('WARN')
    expect(renderReceiptMarkdown(blocked)).toContain('| ① 게이트(tsc/test/build) | ℹ️ | WARN')
    expect(renderReceiptMarkdown(blocked)).not.toContain('| ① 게이트(tsc/test/build) | ✅')
  })
})
