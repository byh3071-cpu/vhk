import type { FileCoverage } from './coverage-parse.js'

export interface FileDiffCoverage {
  file: string
  /** 분모 — *실행가능* 추가라인 수(inCoverage 시). 비실행(주석·import·타입)은 제외. 부재 파일은 전 추가라인. */
  added: number
  covered: number
  uncoveredNew: number[]
  ratio: number // added===0 ? 1 : covered/added
  inCoverage: boolean // 커버리지 리포트에 이 파일이 존재했나(false = 테스트가 import 안 함 → coarse)
}

export interface DiffCoverageResult {
  files: FileDiffCoverage[]
  totalAdded: number
  totalCovered: number
  totalUncovered: number
  ratio: number
}

/**
 * 추가라인 맵 ∩ 커버리지 → 파일별 미검증 변경분(순수). fs/시간 부수효과 0.
 * "미검증 변경분"은 **실행가능 추가라인 중 미커버**만 센다(비실행 라인은 분모에서 제외 — 도그푸딩이 잡은 노이즈 결함).
 * @param coverage 파일별 {covered, executable} 맵, 또는 null(리포트 자체 부재).
 *   - 파일이 맵에 있으면(inCoverage): 분모 = 추가라인 ∩ executable, 미커버 = 그중 covered 아님.
 *   - 파일이 맵에 없거나 coverage=null(inCoverage:false): 실행가능 판별 불가 → 전 추가라인을 coarse 미검증으로(플래그로 구분).
 */
export function diffCoverage(
  added: Map<string, Set<number>>,
  coverage: Map<string, FileCoverage> | null
): DiffCoverageResult {
  const files: FileDiffCoverage[] = []
  let totalAdded = 0
  let totalCovered = 0
  const sortedFiles = [...added.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [file, addedLinesRaw] of sortedFiles) {
    const fc = coverage?.get(file) ?? null
    const inCoverage = fc !== null
    const addedSorted = [...addedLinesRaw].sort((a, b) => a - b)

    // 실행가능 필터: 커버리지 있으면 executable 인 추가라인만, 없으면(coarse) 전 추가라인.
    const considered = fc ? addedSorted.filter((ln) => fc.executable.has(ln)) : addedSorted
    const uncoveredNew: number[] = []
    let cnt = 0
    for (const ln of considered) {
      if (fc && fc.covered.has(ln)) cnt++
      else uncoveredNew.push(ln)
    }
    const addedN = considered.length
    files.push({
      file,
      added: addedN,
      covered: cnt,
      uncoveredNew,
      ratio: addedN === 0 ? 1 : cnt / addedN,
      inCoverage,
    })
    totalAdded += addedN
    totalCovered += cnt
  }
  return {
    files,
    totalAdded,
    totalCovered,
    totalUncovered: totalAdded - totalCovered,
    ratio: totalAdded === 0 ? 1 : totalCovered / totalAdded,
  }
}
