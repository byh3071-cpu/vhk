import { existsSync, readFileSync } from 'node:fs'
import chalk from 'chalk'
import { log } from '../utils/logger.js'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import {
  isHardStopActive,
  countActiveBlockers,
  BLOCKERS_PATH,
  HARD_STOP_BLOCKER_THRESHOLD,
} from '../lib/state-files.js'
import { readQueue, generateCandidates } from './evolve.js'
import type { PatternEntryV19 } from './pattern.js'
import { readMemory } from './memory.js'
import { readReceiptLog } from '../lib/receipt-log.js'
import { computeReceiptTrend } from './stats.js'
import { selectActiveId } from './goal.js'
import { listGoals } from '../lib/goal-frontmatter.js'

/**
 * N1(ⓐ): vhk loop --tick — 읽기 전용 자가진화 조율자.
 * 폐회로 상태(HARD_STOP·블로커·진화 대기·추세·미제안 패턴·active goal)를 읽어
 * "닫힌 것 / 다음 한 수" 1장으로 합성한다. 집행 0(수정·커밋·발송 없음) — 결정경로에 LLM 없음.
 * 다음 한 수는 결정적 우선순위(위험 → 복리 → 정상)로 뽑는다.
 */

export interface LoopTickState {
  hardStop: boolean
  activeBlockers: number
  blockerThreshold: number
  /** evolve 큐 pending 후보 수. */
  evolvePending: number
  /** 아직 큐에 안 오른 active 패턴 수(avoid+reinforce) = 지금 suggest 하면 생길 후보 수. */
  unqueuedPatterns: number
  /** receipt 추세 block율 델타(recent-earlier). 표본<2 → null. 양수=악화. */
  trendDelta: number | null
  activeGoalId: number | null
}

export interface LoopTickMove {
  priority: string
  action: string
  command: string
}

export interface LoopTickCard {
  /** 닫힌(정상) 신호 목록. */
  closed: string[]
  /** 결정적으로 뽑은 단 하나의 다음 한 수. */
  nextMove: LoopTickMove
}

/**
 * 순수 함수 — 상태 → 카드. fs/시간 부수효과 0, 결정적(같은 상태 → 같은 카드).
 * 우선순위: HARD_STOP > 블로커 임계 > 진화 대기 > 추세 악화 > 미제안 패턴 > 정상.
 */
export function computeLoopTick(s: LoopTickState): LoopTickCard {
  const closed: string[] = []
  if (!s.hardStop) closed.push('HARD_STOP 없음')
  if (s.activeBlockers === 0) closed.push('블로커 0')
  if (s.evolvePending === 0) closed.push('진화 대기 0')
  if (s.trendDelta !== null && s.trendDelta <= 0) closed.push('추세 비악화')
  if (s.unqueuedPatterns === 0) closed.push('미제안 패턴 0')

  let nextMove: LoopTickMove
  if (s.hardStop) {
    nextMove = { priority: 'HARD_STOP', action: 'HARD_STOP 활성 — 사유 확인 후 사람이 해제', command: 'vhk resume --confirm' }
  } else if (s.activeBlockers >= s.blockerThreshold) {
    nextMove = { priority: '블로커 임계', action: `블로커 ${s.activeBlockers}건(임계 ${s.blockerThreshold}) — 해소 우선`, command: 'vhk blocker' }
  } else if (s.evolvePending > 0) {
    nextMove = { priority: '진화 대기', action: `evolve 후보 ${s.evolvePending}건 대기 — 검토·반영(사람 승인)`, command: 'vhk evolve list' }
  } else if (s.trendDelta !== null && s.trendDelta > 0) {
    nextMove = { priority: '추세 악화', action: 'block율 상승 — 최근 거짓완료 원인 점검', command: 'vhk stats --trend' }
  } else if (s.unqueuedPatterns > 0) {
    nextMove = { priority: '패턴 감지', action: `미제안 패턴 ${s.unqueuedPatterns}건 — 룰 후보 생성`, command: 'vhk evolve suggest' }
  } else if (s.activeGoalId !== null) {
    nextMove = { priority: '정상', action: `active goal ${s.activeGoalId} 진행`, command: 'vhk work' }
  } else {
    nextMove = { priority: '정상', action: '닫힌 루프 — 다음 goal 선택 또는 측정 누적', command: 'vhk goal peek' }
  }
  return { closed, nextMove }
}

/** 디스크에서 폐회로 상태 수집(읽기 전용). */
function collectState(cwd: string): LoopTickState {
  const blockersContent = existsSync(BLOCKERS_PATH) ? readFileSync(BLOCKERS_PATH, 'utf-8') : ''
  const mem = readMemory(cwd)
  const patterns = mem.patterns as PatternEntryV19[]
  const queue = readQueue(cwd)
  const evolvePending = queue.items.filter((i) => i.status === 'pending').length
  // 지금 suggest 하면 생길 후보 수 = 미제안 active 패턴(generateCandidates 재사용 — 단일 진실원).
  const unqueuedPatterns = generateCandidates(patterns, queue.items).length
  const trend = computeReceiptTrend(readReceiptLog(cwd)).trend
  const activeGoalId = selectActiveId(listGoals('goals'))
  return {
    hardStop: isHardStopActive(),
    activeBlockers: countActiveBlockers(blockersContent),
    blockerThreshold: HARD_STOP_BLOCKER_THRESHOLD,
    evolvePending,
    unqueuedPatterns,
    trendDelta: trend ? trend.delta : null,
    activeGoalId,
  }
}

export async function loopTick(): Promise<void> {
  const cwd = process.cwd()
  const card = computeLoopTick(collectState(cwd))

  log.bold(`\n🔁 ${t('loop.tickTitle')}`)
  log.plain(chalk.gray('─'.repeat(40)))

  if (card.closed.length > 0) {
    log.plain(chalk.green(`  ✅ ${t('loop.closed')} `) + chalk.dim(card.closed.join(' · ')))
  }
  log.plain(
    chalk.cyan(`\n  👉 ${t('loop.nextMove')} `) +
      chalk.white(`[${card.nextMove.priority}] ${card.nextMove.action}`),
  )

  printNextStep({
    message: t('loop.nextMessage'),
    command: card.nextMove.command,
    cursorHint: t('loop.nextCursor'),
  })
}
