import { readConfig } from './config.js'
import { resolveGuard, type Channel, type Guard } from './risk-policy.js'
import type { SafetyMode } from './safety-mode.js'
import { readMemory, recallForAction } from '../commands/memory.js'
import { logRecall } from './recall-log.js'

/**
 * 위험 작업 가드의 **단일 chokepoint**.
 * CLI 핸들러 · MCP 핸들러 · 자연어 dispatch 세 입구 모두 high-risk "실제 실행" 직전에 이걸 통과시킨다.
 * 정책 결정(어떤 작업이 위험한가 / 채널·모드별 가드)은 risk-policy 한 곳에서만 정의 → 여기선 결정을 집행만.
 *
 * - lite           : 경고만 하고 실행
 * - CLI(confirm)   : isTTY 면 confirm() y/N, 거부/비대화형 미승인 → 중단. approved=true 면 바로 실행.
 * - MCP/NL(preview): preview 출력 후 **기본 비실행**. approved=true(명시적 확인 플래그) 일 때만 실행.
 */
export interface GuardDeps {
  channel: Channel
  /** 미지정 시 .vhk/config.json 에서 읽음 */
  mode?: SafetyMode
  /** CLI confirm 가능 여부 (기본 process.stdout.isTTY) */
  isTTY?: boolean
  /** CLI 대화형 확인 (y/N) */
  confirm?: () => Promise<boolean>
  /** 명시적 승인 플래그 (--yes / confirm:true 등) — 비대화형/preview 채널에서 실행 허용 */
  approved?: boolean
  /** 사용자 안내 출력 */
  log?: (msg: string) => void
  /** just-in-time 회상 기준 디렉터리 (기본 process.cwd()) — RFC 0049 */
  cwd?: string
}

export interface GuardedOutcome {
  ran: boolean
  guard: Guard
  reason: string
}

export async function runGuarded<T>(
  action: string,
  deps: GuardDeps,
  run: () => Promise<T> | T
): Promise<{ outcome: GuardedOutcome; result?: T }> {
  const mode: SafetyMode = deps.mode ?? readConfig().safetyMode
  const log = deps.log ?? (() => {})
  const guard = resolveGuard(action, mode, deps.channel)

  // RFC 0049 ②: 위험 작업 직전, 관련 과거 실패를 회상해 경고로 표출(just-in-time).
  // precision 우선(약매칭 침묵) · 회상 실패는 가드 동작을 절대 막지 않는다.
  if (guard !== 'allow') {
    try {
      const jitCwd = deps.cwd ?? process.cwd()
      const hits = recallForAction(readMemory(jitCwd), action)
      if (hits.length > 0) {
        for (const h of hits) {
          const e = h.entry as { lesson?: string; content?: string; id: string }
          log(`🧠 과거 교훈(${action}): ${e.lesson || e.content || e.id}`)
        }
        // RFC 0049 ④: just-in-time 발화도 실쿼리로 축적(best-effort).
        logRecall(jitCwd, { source: 'jit', query: action, hitIds: hits.map((h) => h.entry.id), topScore: hits[0].score })
      }
    } catch {
      /* 회상 실패는 무시 — 가드 본 기능 보호 */
    }
  }

  if (guard === 'allow') {
    return { outcome: { ran: true, guard, reason: 'low-risk' }, result: await run() }
  }

  if (guard === 'warn') {
    // R13/E8: lite 여도 비대화형(stdin 비-TTY)+미승인이면 destructive 중단 — 경고 볼 사람 없음.
    const canConfirm = deps.isTTY ?? !!process.stdin.isTTY
    if (!deps.approved && !canConfirm) {
      log(`⚠️ 위험 작업(${action}) — lite 지만 비대화형+미승인 → 중단. (--yes 로 승인)`)
      return { outcome: { ran: false, guard, reason: 'lite-noninteractive-block' } }
    }
    log(`⚠️ 위험 작업(${action}) — lite 모드: 경고만 하고 진행합니다.`)
    return { outcome: { ran: true, guard, reason: 'lite-warn' }, result: await run() }
  }

  if (guard === 'confirm') {
    // CLI — 명시 승인 우선, 아니면 대화형 확인, 비대화형 미승인은 안전 중단
    if (deps.approved === true) {
      return { outcome: { ran: true, guard, reason: 'approved' }, result: await run() }
    }
    const tty = deps.isTTY ?? !!process.stdin.isTTY
    if (tty && deps.confirm) {
      const ok = await deps.confirm()
      if (ok) return { outcome: { ran: true, guard, reason: 'confirmed' }, result: await run() }
      log(`취소됨 — ${action} 을(를) 실행하지 않았습니다.`)
      return { outcome: { ran: false, guard, reason: 'declined' } }
    }
    log(`⚠️ 위험 작업(${action}) — 확인 불가(비대화형). 실행하지 않았습니다. (--yes 로 명시 승인)`)
    return { outcome: { ran: false, guard, reason: 'no-confirm' } }
  }

  // preview — MCP / 자연어. 미리보기 후 기본 비실행, 명시 승인 시에만 실행.
  log(`🔎 위험 작업(${action}) 미리보기 — 실행 전 확인이 필요합니다. (Safety Mode: ${mode})`)
  if (deps.approved === true) {
    return { outcome: { ran: true, guard, reason: 'approved' }, result: await run() }
  }
  log(`실행하지 않았습니다 — 명시적 확인(승인 플래그) 후 다시 시도하세요.`)
  return { outcome: { ran: false, guard, reason: 'preview-no-approve' } }
}
