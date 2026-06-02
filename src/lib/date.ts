/**
 * VHK-019: 로컬 타임존 기준 `YYYY-MM-DD` 날짜 문자열.
 *
 * `new Date().toISOString().slice(0, 10)` 은 **UTC** 기준이라, KST(UTC+9) 자정~오전 9시
 * 사이에 기록하면 '어제' 날짜가 찍혀 하루 밀린다(블로커/학습/TIL/recap 로그 등 날짜 오기록).
 * `toLocaleDateString('sv-SE')` 는 로컬 타임존 + ISO 형식(YYYY-MM-DD)을 동시에 만족한다.
 *
 * 주의: 시각까지 필관리자 머신 타임스탬프(생성시각 푸터·백업 파일명·HARD_STOP ts·memory createdAt)는
 *      Z(UTC) 표기가 명확하므로 `toISOString()` 을 그대로 둔다. 이 함수는 '날짜 표기' 전용.
 */
export function localDate(d: Date = new Date()): string {
  return d.toLocaleDateString('sv-SE')
}
