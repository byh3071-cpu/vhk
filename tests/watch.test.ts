import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  scanSessions,
  classify,
  createTelegramNotifier,
  type SessionInfo,
  type WatchState,
} from '../src/commands/watch.js'
import { KNOWN_COMMAND_TOKENS } from '../src/lib/cli-args.js'

// 트랙 A(신뢰) 첫 볼트: vhk watch — 무인 세션 정지 감시.
// 2026-07-01 밤샘루프 사건(오실행·8.5h 무감지) 재발 방지. 세션 jsonl mtime 폴링 →
// idle 초과 시 stalled 1회 알림, 회복 시 recovered + 재무장.

const MIN = 60_000

function tmpProjects(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-watch-'))
}

// TS-005: 이 환경(Windows/Node)서 rmSync 가 silent exit 127 로 워커를 죽임(파일·디렉토리 모두 재현, 2026-07-02).
// unlinkSync/rmdirSync 는 정상 — cleanup 은 이 우회 헬퍼로만.
function rmTree(dir: string): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) rmTree(p)
    else fs.unlinkSync(p)
  }
  fs.rmdirSync(dir)
}

function makeSession(root: string, proj: string, id: string, mtimeMs: number): string {
  const dir = path.join(root, proj)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${id}.jsonl`)
  fs.writeFileSync(file, '{"type":"user"}\n')
  fs.utimesSync(file, new Date(mtimeMs), new Date(mtimeMs))
  return file
}

function info(file: string, project: string, sessionId: string, mtimeMs: number): SessionInfo {
  return { file, project, sessionId, mtimeMs }
}

describe('scanSessions', () => {
  it('projects/<proj>/<id>.jsonl 만 잡고 하위폴더(서브에이전트·워크플로)는 제외', () => {
    const root = tmpProjects()
    const now = Date.now()
    makeSession(root, 'proj-a', 'aaa', now - MIN)
    makeSession(root, 'proj-b', 'bbb', now - 2 * MIN)
    // 하위폴더 로그 — 메인 세션 아님, 제외돼야 함
    const subDir = path.join(root, 'proj-a', 'subagents', 'workflows')
    fs.mkdirSync(subDir, { recursive: true })
    fs.writeFileSync(path.join(subDir, 'agent-x.jsonl'), '{}\n')
    const sessions = scanSessions(root)
    expect(sessions).toHaveLength(2)
    const ids = sessions.map((s) => s.sessionId).sort()
    expect(ids).toEqual(['aaa', 'bbb'])
    const a = sessions.find((s) => s.sessionId === 'aaa')!
    expect(a.project).toBe('proj-a')
    rmTree(root)
  })

  it('projects 디렉토리가 없으면 빈 배열 (크래시 금지)', () => {
    expect(scanSessions(path.join(os.tmpdir(), 'vhk-watch-none-존재안함'))).toEqual([])
  })
})

describe('classify', () => {
  const IDLE = 15 * MIN
  const WINDOW = 30 * MIN

  it('활성 윈도우 내 신규 세션 → 등록만, 이벤트 없음', () => {
    const now = Date.now()
    const state: WatchState = new Map()
    const events = classify([info('/f/a.jsonl', 'p', 'a', now - MIN)], state, now, IDLE, WINDOW)
    expect(events).toEqual([])
    expect(state.size).toBe(1)
  })

  it('활성 윈도우 밖의 미추적 세션 → 등록하지 않음 (옛 세션 소음 차단)', () => {
    const now = Date.now()
    const state: WatchState = new Map()
    classify([info('/f/old.jsonl', 'p', 'old', now - WINDOW - MIN)], state, now, IDLE, WINDOW)
    expect(state.size).toBe(0)
  })

  it('추적 중 세션이 idle 초과 → stalled 1회, 같은 상태 재분류 시 중복 알림 없음', () => {
    const now0 = Date.now()
    const state: WatchState = new Map()
    const s = info('/f/a.jsonl', 'p', 'a', now0 - MIN)
    classify([s], state, now0, IDLE, WINDOW) // 등록
    const later = now0 + IDLE + MIN
    const events1 = classify([s], state, later, IDLE, WINDOW)
    expect(events1).toHaveLength(1)
    expect(events1[0].kind).toBe('stalled')
    expect(events1[0].idleMs).toBeGreaterThanOrEqual(IDLE)
    const events2 = classify([s], state, later + MIN, IDLE, WINDOW)
    expect(events2).toEqual([]) // 재알림 금지
  })

  it('stalled 후 mtime 전진 → recovered + 재무장 (다시 idle 되면 다시 stalled)', () => {
    const now0 = Date.now()
    const state: WatchState = new Map()
    const s0 = info('/f/a.jsonl', 'p', 'a', now0 - MIN)
    classify([s0], state, now0, IDLE, WINDOW)
    const t1 = now0 + IDLE + MIN
    classify([s0], state, t1, IDLE, WINDOW) // stalled
    // 활동 재개 — mtime 전진
    const s1 = info('/f/a.jsonl', 'p', 'a', t1 + MIN)
    const recovered = classify([s1], state, t1 + 2 * MIN, IDLE, WINDOW)
    expect(recovered).toHaveLength(1)
    expect(recovered[0].kind).toBe('recovered')
    // 재무장 확인 — 다시 idle 초과 시 다시 stalled
    const t2 = t1 + MIN + IDLE + 2 * MIN
    const stalledAgain = classify([s1], state, t2, IDLE, WINDOW)
    expect(stalledAgain).toHaveLength(1)
    expect(stalledAgain[0].kind).toBe('stalled')
  })

  it('추적 중 세션은 활성 윈도우 밖이어도 계속 판정 (idle 감시가 목적)', () => {
    const now0 = Date.now()
    const state: WatchState = new Map()
    const s = info('/f/a.jsonl', 'p', 'a', now0 - MIN)
    classify([s], state, now0, IDLE, WINDOW)
    const muchLater = now0 + WINDOW + IDLE + MIN
    const events = classify([s], state, muchLater, IDLE, WINDOW)
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('stalled')
  })
})

describe('createTelegramNotifier', () => {
  it('env 미설정이면 null (콘솔 전용 모드)', () => {
    const prevToken = process.env.VHK_TG_TOKEN
    const prevChat = process.env.VHK_TG_CHAT_ID
    delete process.env.VHK_TG_TOKEN
    delete process.env.VHK_TG_CHAT_ID
    expect(createTelegramNotifier()).toBeNull()
    if (prevToken !== undefined) process.env.VHK_TG_TOKEN = prevToken
    if (prevChat !== undefined) process.env.VHK_TG_CHAT_ID = prevChat
  })

  it('env 설정 시 sendMessage API 호출 (fetch 주입)', async () => {
    process.env.VHK_TG_TOKEN = 'tok123'
    process.env.VHK_TG_CHAT_ID = 'chat456'
    const fetchFn = vi.fn().mockResolvedValue({ ok: true } as Response)
    const notifier = createTelegramNotifier(fetchFn as unknown as typeof fetch)
    expect(notifier).not.toBeNull()
    const ok = await notifier!.send('테스트 알림')
    expect(ok).toBe(true)
    expect(fetchFn).toHaveBeenCalledOnce()
    const [url, init] = fetchFn.mock.calls[0]
    expect(String(url)).toContain('bot' + 'tok123')
    expect(String(url)).toContain('sendMessage')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.chat_id).toBe('chat456')
    expect(body.text).toContain('테스트 알림')
    delete process.env.VHK_TG_TOKEN
    delete process.env.VHK_TG_CHAT_ID
  })

  it('fetch 실패해도 throw 하지 않고 false (감시 루프 생존)', async () => {
    process.env.VHK_TG_TOKEN = 'tok123'
    process.env.VHK_TG_CHAT_ID = 'chat456'
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'))
    const notifier = createTelegramNotifier(fetchFn as unknown as typeof fetch)
    await expect(notifier!.send('x')).resolves.toBe(false)
    delete process.env.VHK_TG_TOKEN
    delete process.env.VHK_TG_CHAT_ID
  })
})

describe('watch 명령 등록', () => {
  it('영문·한글 별칭이 KNOWN_COMMAND_TOKENS 에 등록됨 (NL 라우터 가드)', () => {
    expect(KNOWN_COMMAND_TOKENS.has('watch')).toBe(true)
    expect(KNOWN_COMMAND_TOKENS.has('감시')).toBe(true)
  })
})
