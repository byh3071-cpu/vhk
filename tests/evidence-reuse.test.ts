import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gitRun, getCommitInfo } from '../src/lib/git-repo.js'
import { removeDirSync } from '../src/lib/fs-remove.js'
import { buildReport, verifyEvidence } from '../src/commands/verify.js'
import { collectReceipt } from '../src/commands/receipt.js'
import { renderReceiptMarkdown } from '../src/lib/receipt.js'
import { buildReceiptLogEntry } from '../src/lib/receipt-log.js'
import { captureVerificationInputs, sealVerification, readReusableVerification } from '../src/lib/evidence-reuse.js'

const roots: string[] = []
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'vhk-reuse-'))
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
afterEach(() => { for (const root of roots.splice(0)) removeDirSync(root) })

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
  it.each([false, true])('failed verify cannot become receipt PASS through an implicit retry (reuse=%s)', reuse => {
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
    const receipt = collectReceipt(root, null, reuse)
    expect(receipt.decision).toBe('block')
    if (!reuse) expect(receipt.evidence.stale).toBe(false)
    const count = () => readFileSync(join(root, '.vhk', 'phase2', 'count'), 'utf8').trim().split('\n').length
    expect(count()).toBe(4)
    // Recovery fixes the flaky gate before explicitly verifying it again. Its
    // passing variant only writes an output, so the reuse input contract is valid.
    writeFileSync(join(root, 'gate.cjs'), "require('node:fs').appendFileSync('.vhk/phase2/count', 'run\\n')")
    gitRun(['add', 'gate.cjs'], root)
    gitRun(['-c', 'user.name=sample', '-c', 'user.email=sample@example.invalid', 'commit', '-m', 'fixed gate'], root)
    expect(verifyEvidence(root, true).report.status).toBe('PASS')
    expect(collectReceipt(root, null, true).decision).toBe('pass')
    expect(count()).toBe(8)
  }, 30_000)

  it('interrupted verify invalidates the previous seal before gates and blocks receipt recovery', async () => {
    const { root } = realGateFixture(`
      require('node:fs').appendFileSync('.vhk/phase2/gate-started', 'run\\n');
      setTimeout(() => process.exit(0), 1000);
    `)
    expect(readReusableVerification(root).report).not.toBeNull()
    const child = spawn(process.execPath, [
      fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)),
      fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'verify', '--json',
    ], { cwd: root, env: { ...process.env }, stdio: 'ignore', windowsHide: true })
    const exited = once(child, 'exit')
    let during: ReturnType<typeof readReusableVerification> | undefined
    try {
      const deadline = Date.now() + 12_000
      while (!existsSync(join(root, '.vhk', 'phase2', 'gate-started'))) {
        if (child.exitCode !== null || Date.now() >= deadline) throw new Error('Owned verification did not reach its gate')
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      during = readReusableVerification(root)
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await exited
      // Its one owned gate has a bounded timer and exits without its killed parent.
      await new Promise(resolve => setTimeout(resolve, 1200))
    }
    expect(during?.report).toBeNull()
    expect(readReusableVerification(root).report).toBeNull()
    expect(collectReceipt(root, null, true).decision).toBe('block')
    const defaultReceipt = collectReceipt(root, null, false)
    expect(defaultReceipt.decision).toBe('block')
    expect(defaultReceipt.evidence.stale).toBe(false)
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
