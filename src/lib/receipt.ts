// Goal 86 (RFC 0056 T1): vhk receipt — 에이전트의 "됐어요"를 기계증거 영수증 1장으로.
//
// 정체성(ADR-006 / RFC 0056 §2): VHK 는 "AI 자기보고를 기계증거로 대조해 거짓완료를 잡는
// 결정론 판정"이다. 이 모듈은 **순수 핵심**(IO 0) — 4대 기계증거를 받아 decision 을 내리고
// .json/.md 영수증을 만든다. fs/git 수집은 commands/receipt.ts(경계)가 담당한다(테스트 용이).
//
// ★핵심 불변식(테스트로 고정 — tests/receipt.test.ts):
//   ① decision 은 기계증거만으로(LLM 추론 0). 실차단(red·dirty·stale·forbidden 위반) 중 하나라도면 block.
//      (Goal 87: forbidden=변경 파일이 mission 금지 glob 매치 = 결정론 사실 → red/dirty/stale 와 동급 차단.)
//   ② 단조성: caution → pass 격상 절대 금지. 부정 신호가 늘면 결과가 좋아질 수 없다(pass→caution→block).
//   ③ ④ diff-cover·scope 경고는 advisory(약신호) — decision 을 block 으로 격하시키지 못한다(차단은 위 4종만).
//
// ★정직 경계(RFC 0056 §11 ①): diff-cover 의 covered 는 "테스트 실행 도달"이지 "정확성"이 아니다.
//   그러므로 영수증이 잡는 것은 **게으른 거짓완료**(빌드 깨짐·미커밋·stale)에 한정되고, "almost
//   right but not quite"(미묘하게 틀린 코드)는 구조적으로 못 잡는다. 산출물 .md 하단에 이 경계를 박는다.

import type { ReportStatus } from '../commands/verify.js'

/** 영수증 판정 — 기계증거만(LLM 0). block: 실차단(red/dirty/stale/forbidden). caution: 약신호만. pass: 전부 clean·확인됨. */
export type ReceiptDecision = 'block' | 'caution' | 'pass'

/** 게이트(verify) 증거 요약 — 실종료코드 출처(자기보고 거부, verify.ts 가 이미 강제). */
export interface ReceiptGateEvidence {
  /** 게이트 하나라도 실제 프로세스 종료코드로 fail 인가(=red). 실차단 사유 ①. */
  red: boolean
  /** verify 종합(PASS/WARN/FAIL). 사람 표시·요약용. */
  status: ReportStatus
  /** fail 한 게이트 id 들(사유 표기용). */
  failedGateIds: string[]
  /** skip/warn 게이트가 있어 결과가 불완전한가(soft 약신호 — caution 사유, block 아님). */
  hasSoftWarning: boolean
}

/** ④ diff-cover 증거 — advisory(약신호). decision 을 block 으로 못 만든다. */
export interface ReceiptDiffCover {
  /** 커버리지 리포트가 있어 측정됐는가(없으면 부재 — 차단 사유 아님). */
  measured: boolean
  totalAdded: number
  totalUncovered: number
  ratio: number
}

/**
 * ⑤ intent(의도 대조) 증거 — Goal 87. mission.json(scope/forbidden) ↔ 변경 파일을 글로브로 대조.
 * forbidden 위반은 변경 파일이 금지 경로에 매치되는 **결정론 사실**(LLM 0)이라 red/dirty/stale 와
 * 동급 실차단(block). scope 밖 변경은 advisory(caution). mission 없으면 이 증거 자체가 부재(영향 0).
 */
export interface ReceiptIntentEvidence {
  /** mission.json 이 있어 의도 대조를 수행했는가. false 면 decision 영향 0(missionKnown 패턴은 staleKnown 과 동형). */
  missionKnown: boolean
  /** forbidden glob 위반 파일 수(>0 → 실차단 block — 결정론). */
  forbiddenHits: number
  /** scope 밖 변경 파일 수(>0 → caution — advisory). */
  scopeWarnings: number
  /**
   * 금지 패턴 중 glob 미지원 문법 개수. >0이면 forbidden 검증이 무효일 수 있음 → caution(advisory).
   * undefined·0은 무시. GA 동결 — 옵셔널로만 추가(기존 시그니처 불변).
   */
  unsupportedForbiddenCount?: number
  // 방향 3-③: 영수증 발행 시점 mission.json 내용의 sha256 스냅샷(앞 16자).
  // 왜: receipt 는 발행 후 mission.json 이 사후 위조(목표·forbidden 완화)돼도 그 영수증의 판정 근거가
  //   무엇이었는지 증명할 길이 없었다. checksum 을 박아두면 "이 영수증은 *그때의* 계약으로 판정했다"가
  //   사후 검증 가능해진다(같은 mission 의 두 영수증 checksum 이 다르면 사이에 계약이 바뀐 것).
  // decision 에는 절대 반영 안 함 — 순수 사후 감사용(단조성 불변식 ②·③ 불변). GA 동결 — 옵셔널 추가만.
  missionChecksum?: string
  /**
   * ⓑ(N4): objective 토큰 교집합 수 — mission.objective ↔ (active goal.title + 최근 commit) 의
   * 결정론 토큰 공통 개수. **LLM 0**(pattern.tokenize 순수 교집합). undefined=미계산(영향 0·하위호환),
   * 0=계산했으나 겹침 없음 → caution(advisory, block 절대 금지 — 단조성 불변식 ③ 유지). GA 동결 옵셔널 추가.
   */
  objectiveTokenOverlap?: number
}

/** 영수증 입력 — 4대 기계증거 + (옵션) 의도 대조(commands/receipt.ts 가 git/verify/diff-cover/mission 에서 수집). */
export interface ReceiptEvidence {
  /** ① tsc/test/build 실종료코드 게이트. */
  gates: ReceiptGateEvidence
  /** ② git dirty(자기파일 제외 — Goal 85 filterSelfTrackedLines 적용 후). 실차단 사유 ②. */
  dirty: boolean
  /** ③ stale(작업시작 SHA ≠ 현재 HEAD). 실차단 사유 ③. staleKnown=false 면 이 값 무의미. */
  stale: boolean
  /** 작업시작 기준선 SHA 를 알 수 있었는가(기준선 미기록 시 false → stale 미상 = caution, block 아님). */
  staleKnown: boolean
  /** ④ 변경라인 diff-cover(advisory). */
  diffCover: ReceiptDiffCover
  /** ⑤ intent(의도 대조, Goal 87) — mission.json 있을 때만. 부재 → decision·출력 영향 0(하위호환). */
  intent?: ReceiptIntentEvidence
}

/** 산출 .md 하단 고정 1줄 — 정직성(능력 경계)을 제품에 박는다(RFC 0056 §6·§11). */
export const HONESTY_LINE =
  '이 영수증은 게으른 거짓완료(빌드 깨짐·미커밋·낡은 증거)를 잡지, 미묘한 오류(그럴듯하게 틀린 코드)는 못 잡는다. 판정은 기계증거(종료코드·dirty·SHA) 기반이며 LLM 추론이 아니다.'

/**
 * 4대 기계증거 + (옵션) 의도 대조 → decision. **순수 함수, LLM 0.**
 *
 * 실차단(red·dirty·stale·forbidden 위반) 중 하나라도면 block(불변식 ①). 그게 아니고 약신호(soft
 * 게이트·stale 미상·diff-cover 미커버·scope 밖 변경)가 있으면 caution. 전부 clean·확인됐을 때만 pass.
 *
 * 단조성(불변식 ②): 부정 신호가 늘수록 block ← caution ← pass 한 방향으로만 간다. caution 을
 * pass 로 격상시키는 분기는 존재하지 않는다(아래는 "block? → caution? → pass" 폭포라 역행 불가).
 *
 * ④ diff-cover·scope 경고는 caution 까지만 올린다(advisory, 불변식 ③) — block 분기에 절대 안 들어간다.
 * ⑤ intent 는 missionKnown=false(mission 부재)면 forbiddenHits/scopeWarnings 를 무시 → 영향 0(하위호환).
 */
export function decideReceipt(e: ReceiptEvidence): ReceiptDecision {
  const intentKnown = e.intent?.missionKnown === true
  const forbiddenViolated = intentKnown && e.intent!.forbiddenHits > 0

  // 실차단 — diff-cover·scope 는 여기에 없다(advisory 라 block 격하 불가). forbidden 위반은 결정론 차단.
  if (e.gates.red || e.dirty || (e.staleKnown && e.stale) || forbiddenViolated) return 'block'

  // 약신호(soft) — 차단은 아니나 "안심"도 금지 → caution. (단조성: pass 로 못 내려감)
  const hasUncoveredChange = e.diffCover.measured && e.diffCover.totalUncovered > 0
  const scopeWarned = intentKnown && e.intent!.scopeWarnings > 0
  // intentKnown이 false면 단락평가로 e.intent! 접근 안 됨 — 이 순서 필수(GA 동결, 단조성 불변식 ②·③ 유지).
  const unsupportedForbidden = intentKnown && (e.intent!.unsupportedForbiddenCount ?? 0) > 0
  // ⓑ(N4): objective 토큰 교집합 0 → advisory caution(목표와 실제 작업 어휘 안 겹침 = 약신호). `=== 0` 이라 undefined(미계산) 무영향 → block 절대 안 함.
  const objectiveMismatch = intentKnown && e.intent!.objectiveTokenOverlap === 0
  if (e.gates.hasSoftWarning || !e.staleKnown || hasUncoveredChange || scopeWarned || unsupportedForbidden || objectiveMismatch) return 'caution'

  return 'pass'
}

/** decision 사유(사람 표시) — 왜 그 색인지 한 줄씩. */
export function receiptReasons(e: ReceiptEvidence): string[] {
  const reasons: string[] = []
  if (e.gates.red) {
    const ids = e.gates.failedGateIds.length ? e.gates.failedGateIds.join(', ') : '게이트'
    reasons.push(`게이트 실패(실종료코드 ≠ 0): ${ids} — red`)
  }
  if (e.dirty) reasons.push('working tree 가 dirty — 미커밋/untracked 변경 있음(자기파일 제외 후에도)')
  if (e.staleKnown && e.stale) reasons.push('작업 시작 SHA ≠ 현재 HEAD — 증거가 낡았을 수 있음(stale)')
  if (e.intent?.missionKnown && e.intent.forbiddenHits > 0)
    reasons.push(`의도 위반 — forbidden(금지 경로) 변경 ${e.intent.forbiddenHits}건: mission 계약을 어김 — block`)
  if (!e.staleKnown) reasons.push('작업 시작 기준선 미기록 — stale 판정 불가(vhk receipt --mark-start 로 기준선 고정 가능)')
  if (e.gates.hasSoftWarning) reasons.push('일부 게이트 skip/warn — 결과 불완전(수동 확인 권장)')
  if (e.diffCover.measured && e.diffCover.totalUncovered > 0) {
    const pct = Math.round(e.diffCover.ratio * 100)
    reasons.push(
      `변경라인 미검증 ${e.diffCover.totalUncovered}/${e.diffCover.totalAdded} (커버 ${pct}%) — advisory(약신호, 차단 안 함)`
    )
  }
  if (e.intent?.missionKnown && e.intent.scopeWarnings > 0)
    reasons.push(`scope 밖 변경 ${e.intent.scopeWarnings}건 — 시킨 범위 밖일 수 있음(advisory, 차단 안 함)`)
  if (e.intent?.missionKnown && (e.intent.unsupportedForbiddenCount ?? 0) > 0)
    reasons.push(
      `forbidden 패턴 ${e.intent.unsupportedForbiddenCount}개가 glob 미지원 문법 포함 — forbidden 검증이 무효할 수 있음(!, {}, [], 후행 / — caution)`
    )
  if (e.intent?.missionKnown && e.intent.objectiveTokenOverlap === 0)
    reasons.push('objective 토큰 교집합 0 — 목표와 최근 작업(goal·commit) 어휘가 겹치지 않음(advisory, 차단 안 함)')
  if (reasons.length === 0) reasons.push('전 게이트 green · clean · 신선 · 변경라인 풀커버')
  return reasons
}

export interface ReceiptMeta {
  /** 머신 타임스탬프(UTC ISO). */
  generatedAt: string
  /** 사람용 날짜(localDate). */
  date: string
  /** 파일명 슬러그(<날짜-슬러그>). */
  slug: string
  /** 현재 HEAD 전체 SHA(미상 → null). */
  headSha: string | null
  /** 작업시작 기준선 SHA(미기록 → null). */
  baseSha: string | null
}

export interface ReceiptCommit {
  sha: string | null
  shortSha: string | null
}

export const RECEIPT_SCHEMA_VERSION = 1

export interface Receipt {
  schemaVersion: number
  generatedAt: string
  date: string
  slug: string
  /** 기계증거만으로 내린 판정. */
  decision: ReceiptDecision
  /** 사람용 사유 목록. */
  reasons: string[]
  /** 4대 기계증거 원본(기계 소비용). */
  evidence: ReceiptEvidence
  /** 현재 HEAD. */
  head: ReceiptCommit
  /** 작업시작 기준선(stale 비교 기준). */
  base: ReceiptCommit
  /** 정직성 경계 1줄. */
  honesty: string
}

function shortOf(sha: string | null): string | null {
  return sha ? sha.slice(0, 7) : null
}

/** 증거 + 메타 → 영수증 객체(순수). */
export function buildReceipt(e: ReceiptEvidence, meta: ReceiptMeta): Receipt {
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    generatedAt: meta.generatedAt,
    date: meta.date,
    slug: meta.slug,
    decision: decideReceipt(e),
    reasons: receiptReasons(e),
    evidence: e,
    head: { sha: meta.headSha, shortSha: shortOf(meta.headSha) },
    base: { sha: meta.baseSha, shortSha: shortOf(meta.baseSha) },
    honesty: HONESTY_LINE,
  }
}

const DECISION_BADGE: Record<ReceiptDecision, string> = {
  block: '🔴 BLOCK',
  caution: '🟡 CAUTION',
  pass: '🟢 PASS',
}

const DECISION_HEADLINE: Record<ReceiptDecision, string> = {
  block: '기계증거가 "됐어요"와 모순 — 아직 완료 아님(거짓완료 의심)',
  caution: '실차단은 없으나 약신호 있음 — 수동 확인 권장(안심 금지)',
  pass: '기계증거상 게으른 거짓완료 징후 없음(미묘한 오류는 못 잡음)',
}

/**
 * 영수증 → PR/대화에 그대로 붙는 .md 1블록(순수). decision 배지 + 게이트표 + 사유 + 정직성 1줄.
 * chalk 없음(붙여넣기용 순수 텍스트). 머신·사람 동시 가독.
 */
export function renderReceiptMarkdown(r: Receipt): string {
  const e = r.evidence
  const gateRow = (label: string, ok: boolean, note: string) =>
    `| ${label} | ${ok ? '✅' : '❌'} | ${note} |`

  const dc = e.diffCover
  const dcPct = dc.measured ? `${Math.round(dc.ratio * 100)}%` : '미측정'
  const dcNote = dc.measured
    ? `미검증 ${dc.totalUncovered}/${dc.totalAdded} (커버 ${dcPct}) — advisory(차단 안 함)`
    : '커버리지 리포트 없음 — advisory(차단 안 함)'

  const lines: string[] = []
  lines.push(`## ${DECISION_BADGE[r.decision]} — vhk receipt`)
  lines.push('')
  lines.push(`> ${DECISION_HEADLINE[r.decision]}`)
  lines.push('')
  lines.push(
    `- 생성: ${r.date} (${r.generatedAt})  ·  HEAD: \`${r.head.shortSha ?? '미상'}\`  ·  작업시작: \`${r.base.shortSha ?? '미기록'}\``
  )
  lines.push('')
  lines.push('| 게이트 | 상태 | 비고 |')
  lines.push('| --- | --- | --- |')
  lines.push(
    gateRow(
      '① 게이트(tsc/test/build)',
      !e.gates.red,
      e.gates.red
        ? `FAIL: ${e.gates.failedGateIds.join(', ') || '게이트'}`
        : `${e.gates.status}${e.gates.hasSoftWarning ? ' (skip/warn 포함)' : ''}`
    )
  )
  lines.push(gateRow('② git dirty', !e.dirty, e.dirty ? '미커밋/untracked 변경 있음' : 'clean(자기파일 제외)'))
  // ③ stale 미상은 ✅(통과)도 ❌(차단)도 아닌 ℹ️(판정 불가) — 모르는 걸 통과로 위장하지 않는다.
  const staleCell = !e.staleKnown ? 'ℹ️' : e.stale ? '❌' : '✅'
  const staleNote = !e.staleKnown
    ? '기준선 미기록 — 판정 불가(vhk receipt --mark-start)'
    : e.stale
      ? '작업시작 SHA ≠ HEAD — 낡은 증거 의심'
      : '신선(SHA 일치)'
  lines.push(`| ③ stale(작업시작 SHA≠HEAD) | ${staleCell} | ${staleNote} |`)
  // ④ 는 advisory — 체크표시는 정보용이지 decision 에 영향 없음(표 비고에 명시).
  lines.push(`| ④ diff-cover(advisory) | ${dc.measured && dc.totalUncovered === 0 ? '✅' : 'ℹ️'} | ${dcNote} |`)
  // ⑤ intent(의도 대조, Goal 87) — mission.json 있을 때만 행 추가(없으면 출력 변화 0 = 하위호환).
  if (e.intent?.missionKnown) {
    const it = e.intent
    const unsupportedCount = it.unsupportedForbiddenCount ?? 0
    const intentCell = it.forbiddenHits > 0 ? '❌' : it.scopeWarnings > 0 || unsupportedCount > 0 ? 'ℹ️' : '✅'
    let intentNote: string
    if (it.forbiddenHits > 0) {
      intentNote = `forbidden 위반 ${it.forbiddenHits}건 — 시킨 범위(의도) 어김`
    } else if (it.scopeWarnings > 0) {
      intentNote = `scope 밖 변경 ${it.scopeWarnings}건 — advisory(차단 안 함)`
    } else if (unsupportedCount > 0) {
      // forbiddenHits=0 이더라도 미지원 문법으로 인해 검증 자체가 무효일 수 있음 — 정직 표기.
      intentNote = `forbidden 패턴 미지원 문법 — 검증 무효 가능(caution)`
    } else {
      intentNote = 'scope/forbidden 계약 준수'
    }
    lines.push(`| ⑤ intent(의도 대조) | ${intentCell} | ${intentNote} |`)
  }
  lines.push('')
  // 방향 3-③: mission checksum 1줄(사후 위조 탐지용). mission 있을 때만 — 없으면 출력 변화 0(하위호환).
  if (e.intent?.missionKnown && e.intent.missionChecksum) {
    lines.push(`- mission checksum: \`${e.intent.missionChecksum}\` (발행 시점 .vhk/mission.json 내용 해시 — 사후 위조 탐지용)`)
    lines.push('')
  }
  lines.push('**사유:**')
  for (const reason of r.reasons) lines.push(`- ${reason}`)
  lines.push('')
  lines.push(`> ⚠️ ${r.honesty}`)
  lines.push('')
  return lines.join('\n')
}
