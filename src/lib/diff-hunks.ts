import { isFeatureSource, toPosix } from './test-mapping.js'

// #319: Git 기본(core.quotepath=true)은 비ASCII 경로를 `"b/src/lib/\355\225\234.ts"`
// (따옴표로 감싸고 UTF-8 바이트를 8진 이스케이프)로 출력한다. diffUnified0 가 quotepath=false 를
// 넘기지만, 다른 경로로 quotepath 가 켜진 diff 가 들어와도 견디도록 헤더 영역에서 디코드한다.
/**
 * git 따옴표 경로(`"...\NNN..."`)를 원래 UTF-8 경로로 디코드. 따옴표 없으면 그대로 반환(순수).
 * 8진 이스케이프(`\NNN`)는 바이트로 모아 UTF-8 디코드, 표준 C 이스케이프(`\t\n\\"`)도 처리.
 */
export function decodeGitDiffPath(raw: string): string {
  if (raw.length < 2 || raw[0] !== '"' || raw[raw.length - 1] !== '"') return raw
  const body = raw.slice(1, -1)
  const bytes: number[] = []
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch !== '\\') {
      // 비이스케이프 문자: ASCII 1바이트로 인코딩(quotepath 는 ASCII 외엔 항상 이스케이프).
      bytes.push(ch.charCodeAt(0) & 0xff)
      continue
    }
    const next = body[i + 1]
    if (next === undefined) {
      bytes.push(0x5c) // 끝의 고립 백슬래시 — 그대로.
      break
    }
    if (next >= '0' && next <= '7') {
      // 8진 이스케이프 \NNN (최대 3자리) → 단일 바이트.
      let oct = ''
      let j = i + 1
      while (j < body.length && j <= i + 3 && body[j] >= '0' && body[j] <= '7') {
        oct += body[j]
        j++
      }
      bytes.push(parseInt(oct, 8) & 0xff)
      i = j - 1
      continue
    }
    // 표준 C 이스케이프.
    const map: Record<string, number> = { t: 9, n: 10, r: 13, '"': 34, '\\': 92 }
    bytes.push(map[next] ?? next.charCodeAt(0) & 0xff)
    i++
  }
  return Buffer.from(bytes).toString('utf8')
}

/**
 * `git diff --unified=0 HEAD` 텍스트 → 기능소스(src/commands·src/lib)별 추가 라인번호 집합. 순수 함수.
 * 헌트 헤더(@@ -a,b +c,d @@)만으로 추가 라인 계산(컨텍스트 0이라 본문 +라인 셀 필요 없음).
 * 파일 경계는 `diff --git` 에서 리셋, 대상은 `+++ b/<path>` 에서 확정(삭제=+++ /dev/null → 제외).
 */
export function addedLinesByFile(diffText: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>()
  let curFile: string | null = null
  // 상태: false=헤더 영역(+++ b/ 가 파일 경로), true=헌트 본문(+++/--- 은 *내용*이므로 무시).
  // 첫 @@ 이후 본문으로 전환 → 추가된 소스 라인 "++ x"(diff 에선 "+++ x")를 헤더로 오인하지 않음.
  // (적대 검증 2026-06-10: 본문 +++/--- 오인이 같은 파일 후속 헌트를 누락시키던 버그 차단.)
  let inHunks = false
  for (const raw of diffText.split(/\r?\n/)) {
    if (raw.startsWith('diff --git ')) {
      curFile = null // 파일 경계 — binary/rename은 +++ 없음 → null 유지.
      inHunks = false
      continue
    }
    if (!inHunks) {
      // `+++ ` 뒤 전체를 캡처 → 먼저 디코드(따옴표/8진 경로 #319)한 뒤 b/ 접두 제거.
      // 정규식 단계에서 (?:b\/)? 로 벗기면 따옴표 경로(`"b/...`)가 막혀 누락됐었다.
      const plus = raw.match(/^\+\+\+ (.+)$/)
      if (plus) {
        const decoded = decodeGitDiffPath(plus[1].trim())
        const path = decoded.replace(/^b\//, '')
        curFile = path !== '/dev/null' && isFeatureSource(path) ? toPosix(path) : null
        continue
      }
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (!hunk) continue
    inHunks = true // 이 파일은 헌트 본문 진입 — 이후 +++/--- 은 내용.
    if (!curFile) continue
    const start = Number(hunk[1])
    const count = hunk[2] === undefined ? 1 : Number(hunk[2])
    if (count <= 0) continue // 순수 삭제 헌트(+c,0).
    const set = out.get(curFile) ?? new Set<number>()
    for (let i = 0; i < count; i++) set.add(start + i)
    out.set(curFile, set)
  }
  return out
}
