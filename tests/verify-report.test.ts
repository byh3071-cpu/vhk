import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renderReportHtml, escapeHtml } from '../src/commands/verify-report.js'
import {
  buildReport,
  verify,
  REPORT_PATH_REL,
  REPORT_HTML_PATH_REL,
  type GateResult,
  type VerifyReport,
} from '../src/commands/verify.js'

function gate(id: GateResult['id'], status: GateResult['status'], exitCode: number | null = 0, detail?: string): GateResult {
  return { id, label: id, status, exitCode, skipped: status === 'skip', detail }
}

function report(gates: GateResult[]): VerifyReport {
  return buildReport(gates, '2026-06-02T00:00:00.000Z', '2026-06-02')
}

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-vreport-'))
}

describe('verify-report — escapeHtml', () => {
  it('태그/앰퍼샌드/따옴표 이스케이프', () => {
    expect(escapeHtml('<script>alert("x")&\'`')).toBe('&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;`')
  })
})

describe('verify-report — renderReportHtml (배지)', () => {
  it('status=FAIL → HTML 에 FAIL 배지 (거짓 PASS 회귀 가드)', () => {
    const html = renderReportHtml(report([gate('typecheck', 'pass'), gate('test', 'fail', 1)]))
    // 배지 클래스 안에 FAIL 표기
    expect(html).toMatch(/class="badge"[^>]*>FAIL</)
    // 거짓 PASS 표시 없음 — 배지에 PASS 가 들어가면 안 됨
    expect(html).not.toMatch(/class="badge"[^>]*>PASS</)
    expect(html).not.toMatch(/class="badge"[^>]*>WARN</)
  })

  it('status=PASS / WARN 각 배지 렌더', () => {
    expect(renderReportHtml(report([gate('typecheck', 'pass'), gate('secure', 'pass')]))).toMatch(/class="badge"[^>]*>PASS</)
    expect(renderReportHtml(report([gate('typecheck', 'pass'), gate('build', 'skip', null)]))).toMatch(/class="badge"[^>]*>WARN</)
  })
})

describe('verify-report — renderReportHtml (게이트 표 + nextActions)', () => {
  it('각 게이트 label·종료코드·detail 포함', () => {
    const html = renderReportHtml(
      report([gate('test', 'fail', 7, '종료코드 7'), gate('build', 'skip', null)])
    )
    expect(html).toContain('test')
    expect(html).toContain('build')
    expect(html).toContain('>7<') // 종료코드 셀
    expect(html).toContain('종료코드 7') // detail
    expect(html).toContain('—') // skip 게이트 exitCode null → —
  })

  it('nextActions 가 리스트로 렌더', () => {
    const html = renderReportHtml(report([gate('typecheck', 'pass'), gate('secure', 'pass')]))
    // 통과 시 nextActions = 저장 안내
    expect(html).toMatch(/<li>[^<]*(저장|vhk save)[^<]*<\/li>/)
  })

  it('선언된 미도입은 일반 건너뜀 집계와 분리해 렌더', () => {
    const optional = gate('build', 'skip', null, '미도입(선언됨) — 정적 사이트')
    optional.declaredOptional = true
    const html = renderReportHtml(report([gate('secure', 'pass'), optional]))

    expect(html).toContain('게이트 <strong>1</strong>개')
    expect(html).toContain('건너뜀 0')
    expect(html).toContain('미도입 1종(선언됨)')
    expect(html).toContain('>미도입</span>')
  })
})

describe('verify-report — renderReportHtml (안전성)', () => {
  it('detail 의 태그가 이스케이프되어 생짜 <script> 미출력', () => {
    const html = renderReportHtml(report([gate('test', 'fail', 1, '<script>alert(1)</script>')]))
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('외부 의존 0 — URL/CDN/외부 스크립트 없음 (오프라인 보장)', () => {
    const html = renderReportHtml(report([gate('typecheck', 'pass')]))
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/<script\s+src/i)
    expect(html).not.toMatch(/cdn/i)
  })

  it('완결 HTML 문서 (DOCTYPE + html 닫힘)', () => {
    const html = renderReportHtml(report([gate('typecheck', 'pass')]))
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('</html>')
  })
})

describe('verify-report — verify({report}) 통합', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.exitCode = 0
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
    process.exitCode = 0
  })

  it('기존 FAIL latest.json → latest.html 에 FAIL 렌더 (증거 재생성 안 함)', async () => {
    const d = tmp()
    const fail = report([gate('test', 'fail', 1)])
    fs.mkdirSync(path.join(d, '.vhk', 'reports'), { recursive: true })
    fs.writeFileSync(path.join(d, REPORT_PATH_REL), JSON.stringify(fail, null, 2), 'utf-8')
    process.chdir(d)
    await verify({ report: true })
    const html = fs.readFileSync(path.join(d, REPORT_HTML_PATH_REL), 'utf-8')
    expect(html).toMatch(/class="badge"[^>]*>FAIL</)
    expect(process.exitCode).toBe(1)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('latest.json 없으면 verify 선실행 후 latest.html 생성', async () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'tp', version: '0.0.0' }), 'utf-8')
    process.chdir(d)
    await verify({ report: true })
    expect(fs.existsSync(path.join(d, REPORT_PATH_REL))).toBe(true) // 증거 선실행됨
    expect(fs.existsSync(path.join(d, REPORT_HTML_PATH_REL))).toBe(true) // HTML 렌더됨
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('BOM 붙은 latest.json 도 읽어 렌더 (Windows 회귀)', async () => {
    const d = tmp()
    const r = report([gate('typecheck', 'pass'), gate('secure', 'pass')])
    fs.mkdirSync(path.join(d, '.vhk', 'reports'), { recursive: true })
    fs.writeFileSync(path.join(d, REPORT_PATH_REL), '﻿' + JSON.stringify(r), 'utf-8')
    process.chdir(d)
    await verify({ report: true })
    const html = fs.readFileSync(path.join(d, REPORT_HTML_PATH_REL), 'utf-8')
    expect(html).toMatch(/class="badge"[^>]*>PASS</)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
