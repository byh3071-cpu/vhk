import chalk from 'chalk'
import { readMemory, recallMemories, type FailEntry, type MemBucket, type RecallHit } from '../commands/memory.js'

/**
 * #458: 뒷단(content/launch/sell/ops) 프롬프트에 과거 교훈 recall 주입 — 다음 사이클 시작 시 회상.
 * - **오염 0(measure-first)**: recallMemories 를 직접 호출하는 로깅 없는 내부 경로 —
 *   recall-log.jsonl 은 사용자 실쿼리('recall')·JIT('jit') 전용이고 eval 평가셋의 원천이라,
 *   명령마다 자동 발사되는 고정 쿼리를 적재하면 실쿼리 데이터가 오염된다(memory-eval.ts source 필터 참조).
 * - 프롬프트 비대 금지: ≤3개 하드리밋 + 각 1줄 절삭.
 */

export const RECALL_LESSON_MAX = 3
export const RECALL_LESSON_LINE_MAX = 100

const BUCKET_LABEL: Record<MemBucket, string> = { decision: '결정', failure: '실패', success: '성공' }

/** 개행 붕괴(1줄) + 상한 절삭. 프롬프트에 그대로 들어가므로 비대·구조 파괴 방지. */
function toOneLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > RECALL_LESSON_LINE_MAX ? flat.slice(0, RECALL_LESSON_LINE_MAX - 1) + '…' : flat
}

/**
 * 순수: RecallHit → `(버킷) 한 줄 교훈` 문자열 배열 (≤RECALL_LESSON_MAX).
 * failure 는 lesson(증류된 교훈) 우선 — vhk learn 항목은 content 가 비어 있다(loop-brief 렌더와 동일 폴백 계열).
 */
export function formatRecallLessons(hits: RecallHit[]): string[] {
  const out: string[] = []
  for (const h of hits) {
    if (out.length >= RECALL_LESSON_MAX) break
    const f = h.entry as FailEntry
    const text = toOneLine(f.lesson?.trim() || h.entry.content || '')
    if (!text) continue // 본문 없는 항목(id 만)은 프롬프트에 노이즈 — 건너뜀
    out.push(`(${BUCKET_LABEL[h.bucket]}) ${text}`)
  }
  return out
}

/** 순수: 교훈 배열 → 프롬프트 [과거 교훈] 섹션 라인들. 없으면 [](섹션 자체 생략). ≤3 이중 방어. */
export function lessonsSectionLines(lessons: string[]): string[] {
  const capped = lessons.slice(0, RECALL_LESSON_MAX)
  if (capped.length === 0) return []
  return [
    '[과거 교훈 — 이 프로젝트 기억(.vhk/memory)에서 회상]',
    ...capped.map((l) => `- ${l}`),
    '',
  ]
}

/**
 * fs 글루: memory 읽기 → 명령별 고정 쿼리로 회상 → 1줄 포맷. best-effort —
 * 어떤 실패(손상 memory 등)도 뒷단 명령 본 기능을 막지 않는다(빈 배열 = 섹션 생략).
 */
export function recallLessonLines(cwd: string, query: string): string[] {
  try {
    const hits = recallMemories(readMemory(cwd), query, RECALL_LESSON_MAX)
    const lines = formatRecallLessons(hits)
    if (lines.length > 0) {
      console.log(chalk.dim(`   🧠 과거 교훈 ${lines.length}개 회상 — 프롬프트에 주입 (.vhk/memory)`))
    }
    return lines
  } catch {
    // readMemory 는 자체 방어하지만, 회상 실패가 프롬프트 생성을 죽이면 본말전도 — 조용히 섹션 생략.
    return []
  }
}
