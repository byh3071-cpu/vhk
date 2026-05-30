import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { detectStackFromDeps, detectProjectStack } from '../src/lib/stack-detect.js'

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
