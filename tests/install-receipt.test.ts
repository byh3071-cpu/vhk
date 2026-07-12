import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectInstallReceipt, formatInstallReceipt, countFillSlots } from '../src/lib/install-receipt.js'

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-receipt-'))
}

describe('install-receipt (RFC 0060 T3)', () => {
  it('빈 디렉토리 — 규칙 파일 전부 missing, 기록 폴더 0', () => {
    const dir = mkTmp()
    try {
      const r = collectInstallReceipt(dir)
      expect(r.rulesPresent).toHaveLength(0)
      expect(r.rulesMissing.length).toBe(r.ruleTargets.length)
      expect(r.recordDirsPresent).toBe(0)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('파일·폴더 갖춰지면 읽기검증으로 present 집계', () => {
    const dir = mkTmp()
    try {
      fs.writeFileSync(path.join(dir, 'RULES.md'), '# rules')
      fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# agents')
      fs.mkdirSync(path.join(dir, 'docs', 'adr'), { recursive: true })
      fs.mkdirSync(path.join(dir, 'docs', 'log'), { recursive: true })
      const r = collectInstallReceipt(dir)
      expect(r.rulesPresent).toContain('RULES.md')
      expect(r.rulesPresent).toContain('AGENTS.md')
      expect(r.recordDirsPresent).toBe(2)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('인터뷰 대기 — NEEDS_CUSTOMIZATION 있고 done 없으면 pending', () => {
    const dir = mkTmp()
    try {
      fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
      fs.writeFileSync(path.join(dir, '.vhk', 'NEEDS_CUSTOMIZATION'), '')
      const r = collectInstallReceipt(dir)
      expect(r.interviewPending).toBe(true)
      // done 마커 생기면 pending 해제
      fs.writeFileSync(path.join(dir, '.vhk', 'customization-done'), '')
      expect(collectInstallReceipt(dir).interviewPending).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  // RFC 0060 T1b: vhk check 가 잔여 [여기에 작성:] 슬롯을 카운트(진행 측정).
  describe('countFillSlots', () => {
    it('PRD·ARCHITECTURE 의 [여기에 작성:] 개수를 센다', () => {
      const dir = mkTmp()
      try {
        fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
        fs.writeFileSync(path.join(dir, 'docs', 'PRD.md'), '[여기에 작성: a]\n채워짐\n[여기에 작성: b]')
        fs.writeFileSync(path.join(dir, 'docs', 'ARCHITECTURE.md'), '[여기에 작성: c]')
        const s = countFillSlots(dir)
        expect(s.prd).toBe(2)
        expect(s.architecture).toBe(1)
        expect(s.total).toBe(3)
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it('파일 없거나 다 채워지면 0', () => {
      const dir = mkTmp()
      try {
        expect(countFillSlots(dir).total).toBe(0)
        fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
        fs.writeFileSync(path.join(dir, 'docs', 'PRD.md'), '다 채워진 문서')
        expect(countFillSlots(dir).total).toBe(0)
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  it('영수증 문자열 — 실무 톤, 누락 시 복구 명령 노출', () => {
    const dir = mkTmp()
    try {
      const out = formatInstallReceipt(collectInstallReceipt(dir))
      expect(out).toContain('설치 점검')
      expect(out).toContain('규칙 파일')
      expect(out).toContain('vhk sync') // 누락(빈 디렉토리)이라 복구 명령
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
