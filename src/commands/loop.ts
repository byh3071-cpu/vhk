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
import type { PatternEntryV19 } from './pattern.js'
import { loadForMutation } from './memory.js'
import { generateInlineCandidates } from '../lib/evolve-candidates.js'
import { currentEvolveDecisionKeys, readEvolveLog } from '../lib/evolve-log.js'
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
  /** 현재 시점에 유효한 인라인 evolve 후보 수. */
  evolvePending: number
  /** 하위호환 필드. 큐 폐지 후에는 항상 0. */
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
  /** 임계 미만이라 다음 한 수는 아니나 숨기면 안 되는 미해결 항목(관측성 — 0건 오독 방지). */
  watch: string[]
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
  if (s.evolvePending === 0) closed.push('규칙 후보 0')
  if (s.trendDelta !== null && s.trendDelta <= 0) closed.push('추세 비악화')
  if (s.unqueuedPatterns === 0) closed.push('미제안 패턴 0')

  // 임계 미만 블로커는 다음 한 수는 아니지만 카드에서 사라지면 안 됨(0건으로 오독 방지 — 적대리뷰 반영).
  const watch: string[] = []
  if (s.activeBlockers > 0 && s.activeBlockers < s.blockerThreshold) {
    watch.push(`미해결 블로커 ${s.activeBlockers}건 (임계 ${s.blockerThreshold} 미만 — 방치 금지)`)
  }

  let nextMove: LoopTickMove
  if (s.hardStop) {
    nextMove = { priority: 'HARD_STOP', action: 'HARD_STOP 활성 — 사유 확인 후 사람이 해제', command: 'vhk resume --confirm' }
  } else if (s.activeBlockers >= s.blockerThreshold) {
    nextMove = { priority: '블로커 임계', action: `블로커 ${s.activeBlockers}건(임계 ${s.blockerThreshold}) — 해소 우선`, command: 'vhk blocker' }
  } else if (s.evolvePending > 0) {
    nextMove = { priority: '규칙 후보', action: `현재 규칙 후보 ${s.evolvePending}건 — 사람 판정 필요`, command: 'vhk evolve list' }
  } else if (s.trendDelta !== null && s.trendDelta > 0) {
    nextMove = { priority: '추세 악화', action: 'block율 상승 — 최근 거짓완료 원인 점검', command: 'vhk stats --trend' }
  } else if (s.unqueuedPatterns > 0) {
    nextMove = { priority: '패턴 감지', action: `미제안 패턴 ${s.unqueuedPatterns}건 — 룰 후보 생성`, command: 'vhk evolve suggest' }
  } else if (s.activeGoalId !== null) {
    nextMove = { priority: '정상', action: `active goal ${s.activeGoalId} 진행`, command: 'vhk work' }
  } else {
    nextMove = { priority: '정상', action: '닫힌 루프 — 다음 goal 선택 또는 측정 누적', command: 'vhk goal peek' }
  }
  return { closed, watch, nextMove }
}

/** 디스크에서 폐회로 상태 수집(읽기 전용). */
function collectState(cwd: string): LoopTickState {
  const blockersContent = existsSync(BLOCKERS_PATH) ? readFileSync(BLOCKERS_PATH, 'utf-8') : ''
  // 읽기 전용 계약 준수: readMemory 는 v1→v2 마이그레이션 시 디스크 write(persistOnRead)로 집행0 을 어긴다.
  // loadForMutation 은 in-memory 정규화만(비영속) — 손상/미래스키마면 ok=false → 빈 패턴(적대리뷰 med 반영).
  const loaded = loadForMutation(cwd)
  const patterns = (loaded.ok ? loaded.mem.patterns : []) as PatternEntryV19[]
  const evolvePending = generateInlineCandidates(
    patterns,
    currentEvolveDecisionKeys(readEvolveLog(cwd)),
    new Date().toISOString(),
  ).length
  const unqueuedPatterns = 0
  const trend = computeReceiptTrend(readReceiptLog(cwd)).trend
  // 최소 표본 가드(measure-first): 절반당 3건 미만이면 델타는 잡음 → null(n=1 대 n=1 거짓 추세악화 방지, 적대리뷰 반영).
  const TREND_MIN = 3
  const trendDelta = trend && trend.earlierN >= TREND_MIN && trend.recentN >= TREND_MIN ? trend.delta : null
  const activeGoalId = selectActiveId(listGoals('goals'))
  return {
    hardStop: isHardStopActive(),
    activeBlockers: countActiveBlockers(blockersContent),
    blockerThreshold: HARD_STOP_BLOCKER_THRESHOLD,
    evolvePending,
    unqueuedPatterns,
    trendDelta,
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
  if (card.watch.length > 0) {
    log.plain(chalk.yellow(`  ⚠️  ${t('loop.watch')} `) + chalk.dim(card.watch.join(' · ')))
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
