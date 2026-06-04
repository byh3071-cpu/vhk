import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { detectNaturalLanguageInput } from '../src/lib/cli-args.js'
import { routeNaturalLanguage } from '../src/lib/nlp-router.js'
import { stripBom, readJsonFile } from '../src/lib/read-json.js'

describe('detectNaturalLanguageInput', () => {
  it('vhk (인자 없음) → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk'])).toBeNull()
  })

  it('vhk save → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'save'])).toBeNull()
  })

  it('vhk init --skip-gate → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'init', '--skip-gate'])).toBeNull()
  })

  it('vhk init --skip-gate --name vhk --type cli -y → null (옵션값 포함)', () => {
    expect(
      detectNaturalLanguageInput([
        'node', 'vhk', 'init',
        '--skip-gate', '--name', 'vhk', '--type', 'cli', '-y',
      ])
    ).toBeNull()
  })

  it('vhk recap --since 2026-01-01 → null (옵션값 포함)', () => {
    expect(
      detectNaturalLanguageInput(['node', 'vhk', 'recap', '--since', '2026-01-01'])
    ).toBeNull()
  })

  it('vhk "보안 확인" (한 덩어리) → 자연어', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '보안 확인'])).toBe('보안 확인')
  })

  it('vhk 보안 확인 (여러 토큰) → 자연어', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '보안', '확인'])).toBe('보안 확인')
  })

  it('vhk 프로젝트 현황 → status NLP', () => {
    const input = detectNaturalLanguageInput(['node', 'vhk', '프로젝트', '현황'])
    expect(input).toBe('프로젝트 현황')
    expect(routeNaturalLanguage(input!)?.command).toBe('status')
  })

  it('vhk 뭐 바뀌었어 → diff NLP', () => {
    const input = detectNaturalLanguageInput(['node', 'vhk', '뭐', '바뀌었어'])
    expect(routeNaturalLanguage(input!)?.command).toBe('diff')
  })

  it('vhk cloud push → null (commander 직접 처리)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'cloud', 'push'])).toBeNull()
  })

  it('vhk cloud pull <id> → null (gistId 인자 보존)', () => {
    expect(
      detectNaturalLanguageInput(['node', 'vhk', 'cloud', 'pull', '7af5d007e7f9'])
    ).toBeNull()
  })
})

describe('read-json BOM', () => {
  it('UTF-8 BOM package.json 파싱', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-bom-'))
    const pkgPath = path.join(dir, 'package.json')
    fs.writeFileSync(pkgPath, '\uFEFF{"name":"t","version":"1.0.0"}', 'utf-8')
    const pkg = readJsonFile<{ name: string }>(pkgPath)
    expect(pkg.name).toBe('t')
    expect(stripBom('\uFEFFhello')).toBe('hello')
  })
})

describe('detectNaturalLanguageInput — restore 명령 라우팅 (회귀)', () => {
  // restore/복원 이 KNOWN_COMMAND_TOKENS 에 없으면 NLP 가 가로채 commander 핸들러가 안 돈다.
  it('vhk restore <id> → null (commander 가 처리)', () => {
    expect(
      detectNaturalLanguageInput(['node', 'vhk', 'restore', '2026-05-30T09-19-17-358Z'])
    ).toBeNull()
  })
  it('vhk 복원 <id> → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '복원', 'abc'])).toBeNull()
  })
  it('vhk restore (단독) → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'restore'])).toBeNull()
  })
  it('vhk 복원 (단독) → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '복원'])).toBeNull()
  })
})

describe('detectNaturalLanguageInput — 서브커맨드 명령 경로 가드 (R1: 명령어 매칭 우선)', () => {
  // 실결함: NL 라우터가 'goal check' 를 check(점검) 키워드로 가로채 vhk goal check 가 죽음.
  // 실제 서브커맨드 경로는 commander 가 처리하고, 자연어는 fallback 이어야 한다.
  it('vhk goal check → null (commander 가 goal check 게이트 실행)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'goal', 'check'])).toBeNull()
  })
  it('vhk goal done → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'goal', 'done'])).toBeNull()
  })
  it('vhk goal next → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'goal', 'next'])).toBeNull()
  })
  it('vhk goal list → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'goal', 'list'])).toBeNull()
  })
  it('vhk ref add <url> → null (인자 보존)', () => {
    expect(
      detectNaturalLanguageInput(['node', 'vhk', 'ref', 'add', 'https://ex.com'])
    ).toBeNull()
  })
  it('vhk memory list → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'memory', 'list'])).toBeNull()
  })

  it('VHK-016: vhk memory add "<한국어 intent 키워드 포함>" → null (NL 흡수 금지)', () => {
    // content 에 '상태' 같은 키워드 있어도 서브커맨드 add 가 매칭 → commander 처리
    expect(detectNaturalLanguageInput(['node', 'vhk', 'memory', 'add', '교주 v0.7 상태 기록'])).toBeNull()
    expect(detectNaturalLanguageInput(['node', 'vhk', 'memory', 'add', '저장 결정'])).toBeNull()
  })
  // 회귀: 한국어 자연어는 서브커맨드가 아니므로 여전히 NL 로 라우팅돼야 한다.
  it('vhk 보안 확인 → 여전히 자연어 ("확인"은 secure 서브커맨드 아님)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '보안', '확인'])).toBe('보안 확인')
  })
})

describe('detectNaturalLanguageInput — pattern/evolve 라우팅 (회귀: Goal 19/20)', () => {
  // 실결함: pattern/evolve 가 KNOWN_COMMAND_TOKENS 에 없어서, 옵션 없는 서브커맨드
  // (vhk pattern dismiss <id>, vhk pattern detect, vhk evolve <sub>)가 NL 라우터로 새서
  // patternList()/evolveList() 로 둔갑 → dismiss/detect 가 동작하지 않았다.
  it('vhk pattern dismiss <id> → null (commander 가 dismiss 처리, NL 가로채기 금지)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'pattern', 'dismiss', 'p1'])).toBeNull()
  })
  it('vhk pattern detect → null (옵션 없어도 commander)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'pattern', 'detect'])).toBeNull()
  })
  it('vhk pattern list → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'pattern', 'list'])).toBeNull()
  })
  it('vhk 패턴 dismiss <id> → null (한글 컨테이너 + 영문 서브)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '패턴', 'dismiss', 'p1'])).toBeNull()
  })
  it('vhk evolve suggest → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'evolve', 'suggest'])).toBeNull()
  })
  it('vhk evolve apply <id> → null (인자 보존)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'evolve', 'apply', 'r1'])).toBeNull()
  })
})

describe('cli NL e2e', () => {
  const bin = path.join(process.cwd(), 'dist', 'index.js')

  it('vhk "보안 확인" — too many arguments 없음', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-cli-'))
    const r = spawnSync(process.execPath, [bin, '보안 확인'], {
      encoding: 'utf-8',
      cwd: tmp,
      env: { ...process.env, CI: '1' },
    })
    expect(String(r.stderr ?? '')).not.toMatch(/too many arguments/i)
    expect(String(r.stdout ?? '')).toMatch(/보안|secure|스캔/i)
  })

  it('vhk --version', () => {
    const r = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf-8' })
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')) as { version: string }
    expect(r.stdout?.trim()).toBe(pkg.version)
  })
})
