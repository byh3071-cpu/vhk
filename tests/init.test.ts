import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateFiles, enhancePackageScripts, ensureRootGitignore, ensureCustomizationMarker, ensureSessionStartHook } from '../src/commands/init.js'
import { COMMANDS_MD_TEMPLATE } from '../src/templates/commands-md.js'
import { CUSTOMIZATION_HOOK_TEMPLATE } from '../src/templates/customization-hook.js'
import { parseRulesMd } from '../src/commands/sync.js'
import { writeFile } from '../src/utils/file.js'

const EXPECTED_FILES = [
  'CLAUDE.md',
  '.cursorrules',
  'RULES.md',
  'docs/PRD.md',
  'VISION.md',
  'docs/ARCHITECTURE.md',
  'docs/adr/ADR-000-template.md',
  'docs/rfc/README.md',
  'docs/patterns/README.md',
  'docs/log/.gitkeep',
  'docs/troubleshooting/.gitkeep',
  'docs/til.md',
  'BACKLOG.md',
  '.vhk/README.md',
  '.vhk/context.md',
  '.vhk/hooks/customization-check.mjs',
]

describe('vhk init', () => {
  it('generateFiles — ecosystem.mdc 템플릿 포함 (E1-02)', () => {
    const files = generateFiles('my-app', '설명', ['Node.js'])
    const mdc = files['.cursor/rules/ecosystem.mdc']
    expect(mdc).toContain('ECOSYSTEM-MDC:START')
    expect(mdc).toContain('memory/core/inheritance-registry.yaml')
    expect(mdc).toContain('AGENTS.md')
  })

  it('템플릿 파일이 생성된다', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-test-'))
    const files = generateFiles('my-app', '테스트 프로젝트', ['Node.js', 'TypeScript'])

    for (const [filePath, content] of Object.entries(files)) {
      writeFile(path.join(tmpDir, filePath), content)
    }

    for (const filePath of EXPECTED_FILES) {
      expect(fs.existsSync(path.join(tmpDir, filePath))).toBe(true)
    }

    const claude = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8')
    expect(claude).toContain('my-app')

    const prd = fs.readFileSync(path.join(tmpDir, 'docs/PRD.md'), 'utf-8')
    expect(prd).toContain('## 화면 인벤토리')
    expect(prd).toContain('테스트 프로젝트')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('package.json에 vhk 편의 scripts를 병합한다', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-test-'))
    const pkgPath = path.join(tmpDir, 'package.json')
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'x', scripts: { build: 'tsup' } }), 'utf-8')

    expect(enhancePackageScripts(tmpDir)).toBe(true)

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    expect(pkg.scripts.build).toBe('tsup')
    expect(pkg.scripts.ship).toBe('vhk ship')
    expect(pkg.scripts.scan).toBe('vhk secure scan')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('동명 사용자 스크립트는 vhk 기본값보다 우선 (보존)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-test-'))
    const pkgPath = path.join(tmpDir, 'package.json')
    fs.writeFileSync(
      pkgPath,
      JSON.stringify({
        name: 'x',
        scripts: { check: 'eslint .', save: 'echo custom-save' },
      }),
      'utf-8'
    )

    expect(enhancePackageScripts(tmpDir)).toBe(true)

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    expect(pkg.scripts.check).toBe('eslint .')
    expect(pkg.scripts.save).toBe('echo custom-save')
    expect(pkg.scripts.ship).toBe('vhk ship')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('COMMANDS.md 템플릿에 필수 명령이 있다', () => {
    const md = COMMANDS_MD_TEMPLATE()
    expect(md).toContain('vhk doctor')
    expect(md).toContain('vhk 보안 scan')
  })

  it('VHK-008: test 스크립트 없으면 pnpm test 미안내(build 만), 있으면 안내', () => {
    const noTest = COMMANDS_MD_TEMPLATE({ hasTest: false })
    expect(noTest).not.toContain('pnpm test')
    expect(noTest).toContain('`pnpm build`')
    const withTest = COMMANDS_MD_TEMPLATE({ hasTest: true })
    expect(withTest).toContain('pnpm test --run')
  })
})

describe('vhk init — RULES.md 단일 소스(SoT) 생성', () => {
  it('generateFiles 가 RULES.md 를 표준 섹션으로 생성한다', () => {
    const files = generateFiles('my-app', '테스트 설명', ['Node.js', 'TypeScript'])
    expect(files['RULES.md']).toBeDefined()
    const rules = files['RULES.md']
    expect(rules).toContain('# my-app')
    expect(rules).toContain('## 기술 스택')
    expect(rules).toContain('## 코딩 규칙')
    expect(rules).toContain('## 기록 규칙')
    expect(rules).toContain('## 커밋')
    expect(rules).toContain('Node.js')
  })

  it('RULES.md 가 sync 파서로 다시 파싱된다 (init↔sync 연결)', () => {
    const files = generateFiles('demo', '설명', ['Node.js'])
    const sections = parseRulesMd(files['RULES.md'])
    const titles = sections.map((s) => s.title)
    expect(titles).toContain('코딩 규칙')
    expect(titles).toContain('기술 스택')
  })
})

describe('vhk init — .vhk/ 프리셋 씨앗', () => {
  it('.vhk/README.md 와 context.md 를 생성한다', () => {
    const files = generateFiles('my-app', '설명', ['Node.js'], {}, 'cli')
    expect(files['.vhk/README.md']).toBeDefined()
    expect(files['.vhk/context.md']).toBeDefined()
  })

  it('context.md 씨앗에 자동생성 안내와 프로젝트 유형이 들어간다', () => {
    const files = generateFiles('my-app', '설명', ['Next.js', 'Supabase'], {}, 'webapp')
    const ctx = files['.vhk/context.md']
    expect(ctx).toContain('vhk init 이 생성한 씨앗')
    expect(ctx).toContain('vhk context')
    expect(ctx).toContain('webapp')
    expect(ctx).toContain('Next.js')
  })

  it('유형별로 씨앗 내용이 다르다 (프리셋)', () => {
    const webapp = generateFiles('p', 'd', ['Next.js', 'Supabase'], {}, 'webapp')['.vhk/context.md']
    const cli = generateFiles('p', 'd', ['Node.js', 'commander'], {}, 'cli')['.vhk/context.md']
    expect(webapp).not.toBe(cli)
    expect(webapp).toContain('Supabase')
    expect(cli).toContain('commander')
  })

  it('README 씨앗에 memory/refs 로컬 전용 정책이 명시된다', () => {
    const readme = generateFiles('p', 'd', ['Node.js'])['.vhk/README.md']
    expect(readme).toContain('memory.json')
    expect(readme).toContain('로컬 전용')
    expect(readme).toContain('docs/spec.md')
  })

  it('.vhk/.gitignore 씨앗으로 로컬 전용 파일을 폴더 단위 자기방어한다', () => {
    const ignore = generateFiles('p', 'd', ['Node.js'])['.vhk/.gitignore']
    expect(ignore).toBeDefined()
    expect(ignore).toContain('memory.json')
    expect(ignore).toContain('refs.json')
    expect(ignore).toContain('HARD_STOP')
  })

  // #331 + 갭⑤: 일회성 프롬프트 산출물(ops/sell)·사용자 검색어 원문(recall-log/recall-eval)이
  // git 추적으로 새어 프라이버시 노출되던 갭. 4개 모두 .vhk/.gitignore 씨앗에 등록돼야 한다.
  it('일회성/사적 산출물 4종이 .vhk/.gitignore 씨앗에 등록된다 (#331·갭⑤)', () => {
    const ignore = generateFiles('p', 'd', ['Node.js'])['.vhk/.gitignore']
    expect(ignore).toContain('ops-prompt.md')      // 운영 회고 프롬프트(재생성물)
    expect(ignore).toContain('sell-prompt.md')     // 판매 카피 프롬프트(재생성물)
    expect(ignore).toContain('recall-log.jsonl')   // 사용자 검색어 원문 = 프라이버시
    expect(ignore).toContain('eval/recall-eval.json') // 라벨셋(검색어 포함) = 프라이버시
  })

  // 경계 회귀 가드: ledger.jsonl·events/ 는 repo 영속 증거(goal 45/82/85)라 의도적으로 git 추적.
  // gitignore 씨앗에 절대 들어가면 안 됨 — 들어가면 증거가 추적에서 빠져 거짓완료 탐지가 무력화.
  it('ledger.jsonl·events/ 는 gitignore 씨앗에 들어가지 않는다 (추적 유지 — goal 45/82/85)', () => {
    const ignore = generateFiles('p', 'd', ['Node.js'])['.vhk/.gitignore']
    expect(ignore).not.toMatch(/(^|\n)\s*ledger\.jsonl\s*(\n|$)/)
    expect(ignore).not.toMatch(/(^|\n)\s*events\/?\s*(\n|$)/)
  })

  // 멀티PC dirty-block 해소(A축): 증거 원장(events·ledger)은 추적된 채로 두되,
  // .gitattributes 의 merge=union 으로 양쪽 PC append 분기를 양쪽 줄 보존 자동 병합.
  it('.vhk/.gitattributes 씨앗이 events/ledger 만 merge=union 으로 등록한다', () => {
    const attrs = generateFiles('p', 'd', ['Node.js'])['.vhk/.gitattributes']
    expect(attrs).toBeDefined()
    expect(attrs).toContain('events/*.jsonl merge=union')
    expect(attrs).toContain('ledger.jsonl merge=union')
    // 과확장 0: 그 외 .vhk 파일(context.md 등)에는 union 을 걸지 않는다.
    expect(attrs).not.toMatch(/context\.md/)
    // untrack 금지 의도(RFC0056·#315)가 주석으로 박혀 있어야 한다(merge=union 은 추적 전제).
    expect(attrs).toContain('untrack 금지')
  })

  // 불변 가드: .gitattributes 추가가 .gitignore 의 ledger/events 비등록(추적 유지)을 바꾸면 안 됨.
  it('.gitignore 는 불변 — events/ledger 가 여전히 비등록(추적 유지)', () => {
    const ignore = generateFiles('p', 'd', ['Node.js'])['.vhk/.gitignore']
    expect(ignore).not.toMatch(/(^|\n)\s*ledger\.jsonl\s*(\n|$)/)
    expect(ignore).not.toMatch(/(^|\n)\s*events\/?\s*(\n|$)/)
  })
})

// 멀티PC dirty-block(A축) — 실 git 레포에서 .gitattributes 가 events/ledger 에만
// merge 속성 union 을 부여하고, 다른 .vhk 파일에는 과확장하지 않음을 git check-attr 로 확정.
describe('vhk init — .vhk/.gitattributes (git check-attr 검증)', () => {
  function makeRepoWithVhkDir(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-attr-'))
    const g = (args: string[]): void => {
      execFileSync('git', args, { cwd: d, stdio: 'pipe' })
    }
    g(['init'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    const files = generateFiles('p', 'd', ['Node.js'], {}, 'cli')
    // .vhk/.gitattributes + 비교 대상 파일(events·ledger·context) 디스크에 배치.
    writeFile(path.join(d, '.vhk/.gitattributes'), files['.vhk/.gitattributes'])
    writeFile(path.join(d, '.vhk/context.md'), files['.vhk/context.md'])
    writeFile(path.join(d, '.vhk/events/ai-actions.jsonl'), '')
    writeFile(path.join(d, '.vhk/ledger.jsonl'), '')
    return d
  }

  // git check-attr 출력은 "<path>: merge: <value>" 형식 → value 만 추출.
  function attrMerge(dir: string, relPath: string): string {
    const out = execFileSync('git', ['check-attr', 'merge', '--', relPath], {
      cwd: dir,
      encoding: 'utf-8',
    }).trim()
    return out.replace(/^.*: merge: /, '')
  }

  it('events/*.jsonl·ledger.jsonl → union, context.md → unspecified (과확장 0)', () => {
    const d = makeRepoWithVhkDir()
    expect(attrMerge(d, '.vhk/events/ai-actions.jsonl')).toBe('union')
    expect(attrMerge(d, '.vhk/ledger.jsonl')).toBe('union')
    expect(attrMerge(d, '.vhk/context.md')).toBe('unspecified')
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('vhk init — 루트 .gitignore 보장', () => {
  it('없으면 생성하고 .env·node_modules·dist 포함', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-gi-'))
    expect(ensureRootGitignore(dir)).toBe('created')
    const content = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8')
    expect(content).toContain('.env')
    expect(content).toContain('node_modules/')
    expect(content).toContain('dist/')
    fs.rmSync(dir, { recursive: true })
  })

  it('기존 .gitignore 는 보존하고 누락 항목만 append', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-gi-'))
    fs.writeFileSync(path.join(dir, '.gitignore'), '# 사용자 규칙\nmy-secret.txt\n.env\n', 'utf-8')
    expect(ensureRootGitignore(dir)).toBe('updated')
    const content = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8')
    expect(content).toContain('my-secret.txt')   // 기존 보존
    expect(content).toContain('# 사용자 규칙')      // 기존 보존
    expect(content).toContain('node_modules/')     // 누락분 추가
    // 이미 있던 .env 는 중복 추가되지 않음
    expect(content.split('\n').filter(l => l.trim() === '.env').length).toBe(1)
    fs.rmSync(dir, { recursive: true })
  })

  it('모든 항목이 이미 있으면 unchanged', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-gi-'))
    ensureRootGitignore(dir)
    expect(ensureRootGitignore(dir)).toBe('unchanged')
    fs.rmSync(dir, { recursive: true })
  })

  // #326: 슬래시 유무만 다른 동치 항목을 중복 추가하던 결함
  it('슬래시 없는 변형(node_modules)이 이미 있으면 슬래시 버전(node_modules/)을 중복 추가 안 함', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-gi-'))
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\ndist\n', 'utf-8')
    ensureRootGitignore(dir)
    const content = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8')
    const lines = content.split('\n').map(l => l.trim())
    // node_modules 와 node_modules/ 가 공존하면 안 됨 (동치 = 1개)
    expect(lines.filter(l => l.replace(/\/$/, '') === 'node_modules').length).toBe(1)
    expect(lines.filter(l => l.replace(/\/$/, '') === 'dist').length).toBe(1)
    fs.rmSync(dir, { recursive: true })
  })

  it('슬래시 없는 변형만 있으면 정규화로 추가 없음 → unchanged 분기 (멱등)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-gi-'))
    // ROOT_GITIGNORE_ENTRIES 전부를 슬래시 없는 변형으로 미리 채움
    fs.writeFileSync(
      path.join(dir, '.gitignore'),
      '.env\n.env.local\n.env.*.local\nnode_modules\ndist\n*.tsbuildinfo\n.DS_Store\n',
      'utf-8'
    )
    expect(ensureRootGitignore(dir)).toBe('unchanged')
    fs.rmSync(dir, { recursive: true })
  })
})

describe('docs/spec.md 규격', () => {
  it('spec_version 1.2 와 핵심 파일을 명시한다 (goal 89 — 커스터마이징 트리거 등록)', () => {
    const spec = fs.readFileSync(path.join(process.cwd(), 'docs', 'spec.md'), 'utf-8')
    expect(spec).toContain('spec_version: "1.2"')
    expect(spec).toContain('context.md')
    expect(spec).toContain('memory.json')
    expect(spec).toContain('HARD_STOP')
    // 1.1 가산분 — 하위 폴더 공식 인정 + 변경 이력
    expect(spec).toContain('events/')
    expect(spec).toContain('변경 이력')
    // 1.2 가산분 — 커스터마이징 트리거 마커·훅
    expect(spec).toContain('NEEDS_CUSTOMIZATION')
    expect(spec).toContain('customization-done')
  })
})

describe('vhk init — 커스터마이징 트리거 (goal 89)', () => {
  it('.vhk/.gitignore 씨앗에 마커 2개는 등록되지만 hooks/ 는 등록 안 됨 (스크립트는 커밋 대상 — 회귀 가드)', () => {
    const ignore = generateFiles('p', 'd', ['Node.js'])['.vhk/.gitignore']
    expect(ignore).toContain('NEEDS_CUSTOMIZATION')
    expect(ignore).toContain('customization-done')
    expect(ignore).not.toMatch(/(^|\n)\s*hooks\/?\s*(\n|$)/)
  })

  it('훅 템플릿에 셔뱅이 없고 필수 키워드를 포함한다', () => {
    const script = CUSTOMIZATION_HOOK_TEMPLATE()
    expect(script.startsWith('#!')).toBe(false)
    expect(script).toContain('hookSpecificOutput')
    expect(script).toContain('SessionStart')
    expect(script).toContain('NEEDS_CUSTOMIZATION')
    expect(script).toContain('customization-done')
    expect(script).toContain('RULES.md')
    expect(script).toContain('vhk sync')
  })

  describe('ensureCustomizationMarker', () => {
    function mkTmp(): string {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-cmark-'))
    }

    it('둘 다 없으면 NEEDS_CUSTOMIZATION 을 생성한다', () => {
      const dir = mkTmp()
      expect(ensureCustomizationMarker(dir)).toBe(true)
      expect(fs.existsSync(path.join(dir, '.vhk', 'NEEDS_CUSTOMIZATION'))).toBe(true)
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('customization-done 이 있으면 NEEDS_CUSTOMIZATION 을 절대 만들지 않는다 (재우지 않음)', () => {
      const dir = mkTmp()
      fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
      fs.writeFileSync(path.join(dir, '.vhk', 'customization-done'), '')
      expect(ensureCustomizationMarker(dir)).toBe(false)
      expect(fs.existsSync(path.join(dir, '.vhk', 'NEEDS_CUSTOMIZATION'))).toBe(false)
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('NEEDS_CUSTOMIZATION 만 있으면 멱등 — 재생성 안 하고 그대로 둔다', () => {
      const dir = mkTmp()
      fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
      fs.writeFileSync(path.join(dir, '.vhk', 'NEEDS_CUSTOMIZATION'), '')
      expect(ensureCustomizationMarker(dir)).toBe(false)
      expect(fs.existsSync(path.join(dir, '.vhk', 'NEEDS_CUSTOMIZATION'))).toBe(true)
      expect(fs.existsSync(path.join(dir, '.vhk', 'customization-done'))).toBe(false)
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('둘 다 있으면 아무 변화 없다', () => {
      const dir = mkTmp()
      fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
      fs.writeFileSync(path.join(dir, '.vhk', 'NEEDS_CUSTOMIZATION'), '')
      fs.writeFileSync(path.join(dir, '.vhk', 'customization-done'), '')
      expect(ensureCustomizationMarker(dir)).toBe(false)
      fs.rmSync(dir, { recursive: true, force: true })
    })
  })

  describe('ensureSessionStartHook', () => {
    function mkTmp(): string {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-shook-'))
    }

    it('.claude/settings.json 이 없으면 새로 생성하고 SessionStart 훅을 심는다', () => {
      const dir = mkTmp()
      expect(ensureSessionStartHook(dir)).toBe('created')
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf-8'))
      expect(parsed.hooks.SessionStart[0].hooks[0].command).toContain('customization-check.mjs')
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('기존 훅(PreToolUse 등)이 있으면 보존하면서 SessionStart 만 병합한다', () => {
      const dir = mkTmp()
      fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
      fs.writeFileSync(
        path.join(dir, '.claude', 'settings.json'),
        JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }] } }),
        'utf-8'
      )
      expect(ensureSessionStartHook(dir)).toBe('merged')
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf-8'))
      expect(parsed.hooks.PreToolUse[0].hooks[0].command).toBe('echo hi')
      expect(parsed.hooks.SessionStart[0].hooks[0].command).toContain('customization-check.mjs')
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('이미 배선돼 있으면 중복 추가하지 않는다', () => {
      const dir = mkTmp()
      ensureSessionStartHook(dir)
      expect(ensureSessionStartHook(dir)).toBe('unchanged')
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf-8'))
      expect(parsed.hooks.SessionStart.length).toBe(1)
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('손상된 JSON 이면 죽지 않고 skipped 를 반환, 기존 파일을 건드리지 않는다', () => {
      const dir = mkTmp()
      fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
      const settingsPath = path.join(dir, '.claude', 'settings.json')
      fs.writeFileSync(settingsPath, '{ not valid json', 'utf-8')
      expect(ensureSessionStartHook(dir)).toBe('skipped')
      expect(fs.readFileSync(settingsPath, 'utf-8')).toBe('{ not valid json')
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('SessionStart 가 이미 다른 matcher로 있으면 보존하며 별도 그룹으로 병합한다 (critic 리뷰 4a)', () => {
      const dir = mkTmp()
      fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
      fs.writeFileSync(
        path.join(dir, '.claude', 'settings.json'),
        JSON.stringify({ hooks: { SessionStart: [{ matcher: 'clear', hooks: [{ type: 'command', command: 'echo other' }] }] } }),
        'utf-8'
      )
      expect(ensureSessionStartHook(dir)).toBe('merged')
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf-8'))
      expect(parsed.hooks.SessionStart.length).toBe(2)
      expect(parsed.hooks.SessionStart[0].hooks[0].command).toBe('echo other')
      expect(parsed.hooks.SessionStart[1].hooks[0].command).toContain('customization-check.mjs')
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('hooks 가 배열(비정상 형태)이면 조용히 유실시키지 않고 skipped 를 반환한다 (critic 리뷰 4번 결함)', () => {
      const dir = mkTmp()
      fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
      const settingsPath = path.join(dir, '.claude', 'settings.json')
      const original = JSON.stringify({ hooks: [] })
      fs.writeFileSync(settingsPath, original, 'utf-8')
      expect(ensureSessionStartHook(dir)).toBe('skipped')
      expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(original)
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('settings.json 자체가 배열(비정상 루트)이면 skipped 를 반환한다', () => {
      const dir = mkTmp()
      fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
      const settingsPath = path.join(dir, '.claude', 'settings.json')
      fs.writeFileSync(settingsPath, '[]', 'utf-8')
      expect(ensureSessionStartHook(dir)).toBe('skipped')
      fs.rmSync(dir, { recursive: true, force: true })
    })
  })
})
