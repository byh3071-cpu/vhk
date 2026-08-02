import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { detectStackFromDeps, detectProjectStack, detectManifestLangs } from '../src/lib/stack-detect.js'

describe('stack-detect (VHK-001)', () => {
  it('Vite+React+Tailwind+Anthropic+zod 를 감지하고 Next.js/Supabase 는 안 박는다', () => {
    const stack = detectStackFromDeps({
      vite: '^5', react: '^19', tailwindcss: '^4', '@anthropic-ai/sdk': '^0.3', zod: '^3', typescript: '^5',
    })
    expect(stack).toContain('Vite')
    expect(stack).toContain('React')
    expect(stack).toContain('Tailwind CSS')
    expect(stack).toContain('Anthropic SDK')
    expect(stack).toContain('zod')
    expect(stack).not.toContain('Next.js')
    expect(stack).not.toContain('Supabase')
  })

  it('Next.js+Supabase 프로젝트는 그대로 감지', () => {
    const stack = detectStackFromDeps({ next: '^14', react: '^18', '@supabase/supabase-js': '^2' })
    expect(stack).toContain('Next.js')
    expect(stack).toContain('Supabase')
    expect(stack).not.toContain('Vite')
  })

  it('detectProjectStack: package.json 의 실제 deps 읽음', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-stack-'))
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { vite: '^5', react: '^19' }, devDependencies: { typescript: '^5' } })
    )
    const stack = detectProjectStack(dir)
    expect(stack).toContain('Vite')
    expect(stack).toContain('TypeScript')
    fs.rmSync(dir, { recursive: true })
  })

  it('detectProjectStack: package.json 없으면 null (greenfield → 프리셋 폴백)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-stack-'))
    expect(detectProjectStack(dir)).toBeNull()
    fs.rmSync(dir, { recursive: true })
  })
})

describe('stack-detect — 비-JS 매니페스트 언어 감지 (detectManifestLangs)', () => {
  it('Cargo.toml → Rust (package.json 없는 베어메탈 OS 등)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-stack-'))
    fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\nname = "sample-os"\n')
    expect(detectManifestLangs(dir)).toEqual(['Rust'])
    fs.rmSync(dir, { recursive: true })
  })

  it('pyproject.toml + requirements.txt → Python 중복 없이 1번', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-stack-'))
    fs.writeFileSync(path.join(dir, 'pyproject.toml'), '[project]\n')
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'requests\n')
    expect(detectManifestLangs(dir)).toEqual(['Python'])
    fs.rmSync(dir, { recursive: true })
  })

  it('go.mod → Go, CMakeLists.txt → C/C++', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-stack-'))
    fs.writeFileSync(path.join(dir, 'go.mod'), 'module x\n')
    fs.writeFileSync(path.join(dir, 'CMakeLists.txt'), 'project(x)\n')
    const langs = detectManifestLangs(dir)
    expect(langs).toContain('Go')
    expect(langs).toContain('C/C++')
    fs.rmSync(dir, { recursive: true })
  })

  it('detectProjectStack 은 JS-only 유지 — Cargo.toml 만으론 여전히 null (theme #158 가드)', () => {
    // theme 이 detectProjectStack(.) !== null 을 "JS 프로젝트 → src/ + .ts" 신호로 쓴다.
    // 비-JS 매니페스트를 여기 병합하면 Rust/Python 프로젝트 src/ 에 .ts 오염 회귀.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-stack-'))
    fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\n')
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'requests\n')
    expect(detectProjectStack(dir)).toBeNull()
    fs.rmSync(dir, { recursive: true })
  })
})

describe('resolveInitStack — init 스택 결정 우선순위', () => {
  it('JS deps 감지 시 매니페스트 언어 병합 (Tauri = React + Rust)', async () => {
    const { resolveInitStack } = await import('../src/commands/init.js')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-stack-'))
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { react: '^19' } })
    )
    fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\n')
    const { stack, detected, status } = resolveInitStack(dir, 'webapp')
    expect(detected).toBe(true)
    expect(status).toBe('candidate')
    expect(stack).toContain('React')
    expect(stack).toContain('Rust')
    fs.rmSync(dir, { recursive: true })
  })

  it('떠돌이 매니페스트가 명시적 --type 프리셋을 대체하지 않음 (리뷰 major 가드)', async () => {
    const { resolveInitStack } = await import('../src/commands/init.js')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-stack-'))
    fs.writeFileSync(path.join(dir, 'requirements.txt'), '') // 빈 떠돌이 매니페스트
    const { stack, detected, status } = resolveInitStack(dir, 'webapp')
    expect(detected).toBe(false)
    expect(status).toBe('candidate')
    expect(stack).toContain('Next.js') // 프리셋 보존
    expect(stack).not.toContain('Python')
    fs.rmSync(dir, { recursive: true })
  })

  it('프리셋 없는 타입(other)은 매니페스트 언어 사용 — Cargo.toml → Rust', async () => {
    const { resolveInitStack } = await import('../src/commands/init.js')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-stack-'))
    fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\n')
    const { stack, detected, status } = resolveInitStack(dir, 'other')
    expect(detected).toBe(true)
    expect(status).toBe('candidate')
    expect(stack).toEqual(['Rust'])
    fs.rmSync(dir, { recursive: true })
  })

  it('other + 매니페스트 없음 → 빈 스택 (직접 입력/미정 흐름으로)', async () => {
    const { resolveInitStack } = await import('../src/commands/init.js')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-stack-'))
    const { stack, detected, status } = resolveInitStack(dir, 'other')
    expect(detected).toBe(false)
    expect(status).toBe('candidate')
    expect(stack).toEqual([])
    fs.rmSync(dir, { recursive: true })
  })

  it('명시 --stack은 실제 의존성·타입 프리셋보다 우선하고 확정된다', async () => {
    const { resolveInitStack } = await import('../src/commands/init.js')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-stack-'))
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { next: '^15', react: '^19' } })
    )
    const resolved = resolveInitStack(dir, 'webapp', 'Vite, React, TypeScript')
    expect(resolved).toMatchObject({
      stack: ['Vite', 'React', 'TypeScript'],
      status: 'confirmed',
      source: 'explicit',
    })
    fs.rmSync(dir, { recursive: true })
  })

  it('빈 --stack은 확정으로 위장하지 않고 자동 결과를 후보로 돌린다', async () => {
    const { resolveInitStack } = await import('../src/commands/init.js')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-stack-'))
    const resolved = resolveInitStack(dir, 'webapp', '   ')
    expect(resolved.status).toBe('candidate')
    expect(resolved.source).toBe('preset')
    expect(resolved.stack).toContain('Next.js')
    fs.rmSync(dir, { recursive: true })
  })
})
