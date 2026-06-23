import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateFiles, enhancePackageScripts, ensureRootGitignore } from '../src/commands/init.js'
import { COMMANDS_MD_TEMPLATE } from '../src/templates/commands-md.js'
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
  'docs/log/.gitkeep',
  'docs/troubleshooting/.gitkeep',
  'docs/til.md',
  'BACKLOG.md',
  '.vhk/README.md',
  '.vhk/context.md',
]

describe('vhk init', () => {
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
})

describe('docs/spec.md 규격', () => {
  it('spec_version 1.1 과 핵심 파일을 명시한다 (governance T4 — RFC 0038 v1.1 반영)', () => {
    const spec = fs.readFileSync(path.join(process.cwd(), 'docs', 'spec.md'), 'utf-8')
    expect(spec).toContain('spec_version: "1.1"')
    expect(spec).toContain('context.md')
    expect(spec).toContain('memory.json')
    expect(spec).toContain('HARD_STOP')
    // 1.1 가산분 — 하위 폴더 공식 인정 + 변경 이력
    expect(spec).toContain('events/')
    expect(spec).toContain('변경 이력')
  })
})
