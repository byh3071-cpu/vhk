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

  // 이슈 #373: autonomy-log 는 전부 --옵션 플래그 스타일(watch 와 동일 패턴) — 옵션토큰이
  // 있어도 NL 라우터가 문장을 가로채면 commander 액션이 안 돈다(#147 클래스 회귀 방지).
  it('vhk autonomy-log --event start → null (commander 가 처리, 옵션값 포함)', () => {
    expect(
      detectNaturalLanguageInput(['node', 'vhk', 'autonomy-log', '--event', 'start'])
    ).toBeNull()
  })
  it('vhk 자율기록 --event complete --run-id abc → null (한글 별칭 + 옵션값)', () => {
    expect(
      detectNaturalLanguageInput(['node', 'vhk', '자율기록', '--event', 'complete', '--run-id', 'abc'])
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

describe('detectNaturalLanguageInput — 한글 서브별칭 경로 가드 (R1 합류: 전 컨테이너)', () => {
  // 실증 결함 클래스: 한글 서브별칭이 CONTAINER_SUBCOMMAND_ALIASES 에 없어 R1 가드를 못 통과 →
  // NL 라우터가 가로채 서브커맨드·인자 유실 (2026-07-01 evolve 선재버그 + #457 보안 스캔 인자 유실).
  it('vhk 목표 다음 → null (commander 가 goal next 실행)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '목표', '다음'])).toBeNull()
  })
  it('vhk 진화 제안 → null (commander 가 evolve suggest 실행)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '진화', '제안'])).toBeNull()
  })
  it('vhk 기억 목록 → null (commander 가 memory list 실행)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '기억', '목록'])).toBeNull()
  })
  it('vhk 진화 반영 <id> → null (인자 보존)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '진화', '반영', 'r1'])).toBeNull()
  })
  it('vhk 기억 삭제 <index> → null (인자 보존)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '기억', '삭제', '3'])).toBeNull()
  })
  it('vhk 워크트리 추가 <branch> → null (인자 보존)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '워크트리', '추가', 'feat-x'])).toBeNull()
  })
  it('vhk 작업 인수인계 → null (commander 가 work handoff 실행)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '작업', '인수인계'])).toBeNull()
  })
  it('vhk 클라우드 올리기 → null (commander 가 cloud push 실행)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '클라우드', '올리기'])).toBeNull()
  })
  it('vhk config set-rules-file <yaml> → null (영문 경로를 commander가 실행)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'config', 'set-rules-file', 'rules.yaml'])).toBeNull()
  })
  it('vhk 설정 규칙파일 <yaml> → null (한글 별칭 경로를 commander가 실행)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '설정', '규칙파일', 'rules.yaml'])).toBeNull()
  })
  // 회귀: 별칭은 컨테이너별로 격리 — '점검' 은 worktree check 의 별칭이지 goal 것이 아니다.
  it('회귀: vhk 목표 점검 → 여전히 자연어 (goal 에 점검 별칭 없음, cross-container 오염 금지)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '목표', '점검'])).toBe('목표 점검')
  })
  // 회귀: 서브별칭이 아닌 한국어는 여전히 NL 로 흐른다.
  it('회귀: vhk 보안 확인 → 여전히 자연어 (확인은 서브별칭 아님)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '보안', '확인'])).toBe('보안 확인')
  })
})

describe('detectNaturalLanguageInput — freeform 인자 명령 NLP 가로채기 금지 (#147)', () => {
  // 실결함: learn/blocker 는 자유형식 본문을 받는데, 본문에 'sync' 같은 NLP 키워드가
  // 들어가면 라우터가 가로채 vhk sync 가 실행되고 learn()/blocker() 가 안 돔.
  it('vhk learn <다단어, sync 포함> → null (commander learn 처리)', () => {
    expect(
      detectNaturalLanguageInput(['node', 'vhk', 'learn', 'dogfood', 'lesson', 'without', 'sync', 'keyword'])
    ).toBeNull()
  })
  it('vhk 교훈 <다단어, sync 포함> → null (한글 별칭)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '교훈', 'sync', '없이', '배운', '교훈'])).toBeNull()
  })
  it('vhk blocker <다단어, sync 포함> → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'blocker', 'sync', '중단', '반복', '증상'])).toBeNull()
  })
  it('vhk 블로커 <다단어, sync 포함> → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '블로커', 'sync', '중단', '반복', '증상'])).toBeNull()
  })
  // 회귀: freeform 아닌 명령은 기존대로 자연어 라우팅 유지
  it('회귀: vhk 보안 확인 은 여전히 자연어', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '보안', '확인'])).toBe('보안 확인')
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

  it('vhk learn <다단어 unquoted> — too many arguments 없이 교훈 기록, sync 안 탐 (#147)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-learn-'))
    const r = spawnSync(
      process.execPath,
      [bin, 'learn', 'dogfood', 'lesson', 'without', 'sync', 'keyword'],
      { encoding: 'utf-8', cwd: tmp, env: { ...process.env, CI: '1' } }
    )
    const out = String(r.stdout ?? '')
    expect(String(r.stderr ?? '')).not.toMatch(/too many arguments/i)
    expect(out).toMatch(/교훈 기록/) // learn 실행됨
    expect(out).not.toMatch(/규칙 파일 동기화|규칙 동기화 완료/) // sync 로 새지 않음
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('vhk --version', () => {
    const r = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf-8' })
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')) as { version: string }
    expect(r.stdout?.trim()).toBe(pkg.version)
  })
})
