import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { removeDirSync, removeFileSync } from '../src/lib/fs-remove.js'
import {
  scanRosterCard,
  syncCheck,
  syncCore,
  withRosterCard,
} from '../src/commands/sync.js'

// #627: vhk sync 가 AGENTS.md 의 YOHAN-ROSTER-CARD 관리 블록(주인 = 외부 도구)을 지우지 않는다.

const RULES = [
  '# 데모 — 테스트',
  '',
  '## 코딩 규칙',
  '',
  '- A 규칙',
  '',
  '## 기록 규칙',
  '',
  '- 로그 남기기',
  '',
].join('\n')

const CARD = [
  '<!-- YOHAN-ROSTER-CARD:BEGIN sha=abc123 -->',
  '## 라우팅 카드',
  '- 구현 = Claude Code',
  '<!-- YOHAN-ROSTER-CARD:END -->',
].join('\n')

let dir: string
const agentsPath = () => path.join(dir, 'AGENTS.md')
const read = () => fs.readFileSync(agentsPath(), 'utf-8')
const run = () => syncCore(dir, { yes: true }, async () => true)

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-roster-'))
  fs.writeFileSync(path.join(dir, 'RULES.md'), RULES, 'utf-8')
  await run()
})

afterEach(() => {
  removeDirSync(dir)
})

describe('AGENTS.md 라우팅 카드 보존 (#627)', () => {
  it('블록이 없으면 아무것도 넣지 않는다', async () => {
    expect(read()).not.toContain('YOHAN-ROSTER-CARD')
    await run()
    expect(read()).not.toContain('YOHAN-ROSTER-CARD')
    expect(syncCheck(dir).ok).toBe(true)
  })

  it('문서 끝에 있던 블록은 sync 후에도 그대로 남고 check 는 통과한다', async () => {
    fs.appendFileSync(agentsPath(), `\n${CARD}\n`, 'utf-8')
    await run()
    expect(read()).toContain(CARD)
    expect(read().match(/YOHAN-ROSTER-CARD:BEGIN/g)).toHaveLength(1)
    const r = syncCheck(dir)
    expect(r.ok).toBe(true)
    expect(r.drifted).not.toContain('AGENTS.md')
  })

  it('중간에 있던 블록은 같은 위치(앞 줄 기준)에 남고 두 번 sync 해도 같다', async () => {
    const generated = read()
    const anchor = '- 게이트(tsc / test:run / build) 통과해야만 `vhk goal done`.'
    expect(generated).toContain(anchor)
    fs.writeFileSync(agentsPath(), generated.replace(anchor, `${anchor}\n\n${CARD}`), 'utf-8')

    await run()
    const first = read()
    expect(first).toContain(`${anchor}\n\n${CARD}\n`)
    expect(first.indexOf(CARD)).toBeLessThan(first.indexOf('## 코딩 규칙'))
    expect(syncCheck(dir).ok).toBe(true)

    await run()
    expect(read()).toBe(first)
  })

  it('앞 줄을 생성본에서 찾을 수 없으면 문서 끝에 붙인다', async () => {
    fs.appendFileSync(agentsPath(), `\n사용자가 쓴 유일한 줄 zzz\n\n${CARD}\n`, 'utf-8')
    await run()
    expect(read().trimEnd().endsWith(CARD)).toBe(true)
    expect(syncCheck(dir).ok).toBe(true)
  })

  it('CRLF 로 저장된 기존 AGENTS.md 의 블록도 보존한다', async () => {
    fs.appendFileSync(agentsPath(), `\n${CARD}\n`, 'utf-8')
    fs.writeFileSync(agentsPath(), read().replace(/\n/g, '\r\n'), 'utf-8')
    expect(syncCheck(dir).drifted).not.toContain('AGENTS.md')
    await run()
    expect(read()).toContain(CARD)
    expect(syncCheck(dir).ok).toBe(true)
  })

  it('BEGIN/END 짝이 안 맞으면 보존하지 않고 경고한다', async () => {
    fs.appendFileSync(agentsPath(), '\n<!-- YOHAN-ROSTER-CARD:BEGIN -->\n내용만 있고 END 없음\n', 'utf-8')
    const result = await run()
    expect(read()).not.toContain('YOHAN-ROSTER-CARD')
    expect(result.rosterCardWarning).toContain('YOHAN-ROSTER-CARD')
  })

  it('블록이 여러 쌍이면 보존하지 않고 경고한다', async () => {
    fs.appendFileSync(agentsPath(), `\n${CARD}\n\n${CARD}\n`, 'utf-8')
    const result = await run()
    expect(read()).not.toContain('YOHAN-ROSTER-CARD')
    expect(result.rosterCardWarning).toBeDefined()
  })

  it('정상 블록이면 경고가 없다', async () => {
    fs.appendFileSync(agentsPath(), `\n${CARD}\n`, 'utf-8')
    const result = await run()
    expect(result.rosterCardWarning).toBeUndefined()
  })

  it('AGENTS.md 가 아직 없으면 블록을 만들어 내지 않는다', async () => {
    removeFileSync(agentsPath())
    await run()
    expect(read()).not.toContain('YOHAN-ROSTER-CARD')
  })

  it('sync --check 는 카드가 붙은 파일을 불일치로 보지 않는다', () => {
    fs.appendFileSync(agentsPath(), `\n${CARD}\n`, 'utf-8')
    expect(syncCheck(dir).drifted).not.toContain('AGENTS.md')
  })
})

describe('RULES.md 변경 후에도 카드 위치가 유지된다 (#627 적대검증)', () => {
  const editRules = (from: string, to: string) => {
    const rulesPath = path.join(dir, 'RULES.md')
    fs.writeFileSync(rulesPath, fs.readFileSync(rulesPath, 'utf-8').replace(from, to), 'utf-8')
  }
  const expectStable = async () => {
    const first = read()
    expect(syncCheck(dir).ok).toBe(true)
    await run()
    expect(read()).toBe(first)
    expect(syncCheck(dir).ok).toBe(true)
  }

  it('(a) 끝에 있는 카드 + 마지막 섹션에 규칙 추가 -> 카드는 끝, 새 규칙은 원래 섹션 안', async () => {
    fs.appendFileSync(agentsPath(), `\n${CARD}\n`, 'utf-8')
    await run()
    editRules('- 로그 남기기', '- 로그 남기기\n- 새 규칙 AAA')
    await run()
    const out = read()
    expect(out.trimEnd().endsWith(CARD)).toBe(true)
    expect(out.indexOf('- 새 규칙 AAA')).toBeGreaterThan(out.indexOf('## 기록 규칙'))
    expect(out.indexOf('- 새 규칙 AAA')).toBeLessThan(out.indexOf('YOHAN-ROSTER-CARD:BEGIN'))
    await expectStable()
  })

  it('(b) 섹션 사이 카드 + 앞 섹션에 규칙 추가 -> 카드는 다음 제목 바로 앞', async () => {
    fs.writeFileSync(agentsPath(), read().replace('## 기록 규칙', `${CARD}\n\n## 기록 규칙`), 'utf-8')
    await run()
    editRules('- A 규칙', '- A 규칙\n- 새 규칙 BBB')
    await run()
    const out = read()
    expect(out).toContain(`${CARD}\n\n## 기록 규칙`)
    expect(out.indexOf('- 새 규칙 BBB')).toBeLessThan(out.indexOf('YOHAN-ROSTER-CARD:BEGIN'))
    await expectStable()
  })

  it('(c) 첫 줄 카드(BOM 포함) -> 첫 줄에 남는다', async () => {
    fs.writeFileSync(agentsPath(), `﻿${CARD}\n\n${read()}`, 'utf-8')
    await run()
    editRules('- A 규칙', '- A 규칙\n- 새 규칙 CCC')
    await run()
    const out = read()
    expect(out.replace(/^﻿/, '').startsWith(CARD)).toBe(true)
    expect(out).toContain('- 새 규칙 CCC')
    await expectStable()
  })
})

describe('scanRosterCard / withRosterCard 순수 함수', () => {
  it('END 가 BEGIN 보다 앞이면 invalid', () => {
    expect(scanRosterCard('<!-- YOHAN-ROSTER-CARD:END -->\n<!-- YOHAN-ROSTER-CARD:BEGIN -->').status)
      .toBe('invalid')
  })

  it('existing 이 null 이면 생성본 그대로', () => {
    expect(withRosterCard('본문\n', null)).toBe('본문\n')
  })
})
