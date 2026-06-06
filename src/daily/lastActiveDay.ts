// '어제' = 달력상 어제가 아니라 '마지막 활동일'(불규칙·야행성 일정 대응).
// activity 날짜들(YYYY-MM-DD) 중 today 직전(strict <)의 가장 최근 날. 주말·공백은
// 실제 활동일만 보므로 자동 스킵된다. 활동 전무면 null.
export function lastActiveDay(activityDates: string[], today: string): string | null {
  let best: string | null = null
  for (const d of activityDates) {
    if (d < today && (best === null || d > best)) best = d // YYYY-MM-DD 는 문자열 비교로 정렬 가능
  }
  return best
}
