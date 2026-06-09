export interface FileDiffCoverage {
  file: string
  added: number
  covered: number
  uncoveredNew: number[]
  ratio: number // added===0 ? 1 : covered/added
  inCoverage: boolean // 커버리지 리포트에 이 파일이 존재했나(false = 테스트가 import 안 함)
}

export interface DiffCoverageResult {
  files: FileDiffCoverage[]
  totalAdded: number
  totalCovered: number
  totalUncovered: number
  ratio: number
}

/**
 * 추가라인 맵 ∩ 커버라인 맵 → 파일별 미검증 변경분(순수). fs/시간 부수효과 0.
 * @param covered 커버라인 맵 또는 null(리포트 자체 부재 — 전 라인 미검증으로 처리, 호출부가 별도 안내).
 */
export function diffCoverage(
  added: Map<string, Set<number>>,
  covered: Map<string, Set<number>> | null
): DiffCoverageResult {
  const files: FileDiffCoverage[] = []
  let totalAdded = 0
  let totalCovered = 0
  const sortedFiles = [...added.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [file, addedLines] of sortedFiles) {
    const cov = covered?.get(file) ?? null
    const inCoverage = cov !== null
    const uncoveredNew: number[] = []
    let cnt = 0
    for (const ln of [...addedLines].sort((a, b) => a - b)) {
      if (cov && cov.has(ln)) cnt++
      else uncoveredNew.push(ln)
    }
    const addedN = addedLines.size
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
