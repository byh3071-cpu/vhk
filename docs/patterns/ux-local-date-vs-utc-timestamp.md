---
패턴명: 사람이 읽는 날짜는 로컬, 머신 타임스탬프는 UTC — 섞으면 하루 밀린다
카테고리: ux
출처프로젝트: VHK (vhk-cli)
태그: [date, timezone, utc, kst, iso8601, toISOString, toLocaleDateString, logging]
발견일: 2026-05-31
출처DevLog: docs/log/2026-05-31-v1.6.2-dogfooding-release.md
---

# 패턴: 로컬 날짜 표기 vs UTC 타임스탬프 — `toISOString().slice(0,10)` 의 하루 밀림

## 증상

로그/문서/파일명에 "오늘 날짜"를 찍었는데, 실제 작성 시점과 하루가 어긋난다.
UTC+9(KST) 환경에서 자정~오전 9시 사이에 기록하면 항상 **어제** 날짜가 박힌다.

흔한 구현:

```ts
const today = new Date().toISOString().slice(0, 10) // ❌ UTC 기준
// docs/log/{today}-... , "발견일: {today}", blocker/TIL/recap 날짜 등
```

재현 케이스 (KST 기준 오늘인데 UTC 로는 어제로 찍힘):

```ts
const d = new Date('2026-05-31T16:00:00Z') // = 2026-06-01 01:00 KST
d.toISOString().slice(0, 10)               // → '2026-05-31' (UTC '어제') ❌
d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) // → '2026-06-01' (KST '오늘') ✅
```

결과적으로 작업 로그 파일명, 발견일/기록일 필드, 일일 recap 등이 하루 밀려 기록된다.

## 원인

`Date#toISOString()` 은 **항상 UTC** 로 직렬화한다(`...Z` 접미사). 거기서 `.slice(0, 10)`
으로 날짜 부분만 잘라내면 "UTC 기준 날짜"가 된다.

UTC+9 처럼 양의 오프셋을 가진 타임존에서는 **로컬 자정 ~ 오전 9시**(= UTC 전날 15:00~24:00)
구간 동안 UTC 날짜가 로컬 날짜보다 하루 작다. 그래서 이 시간대에 "오늘"을 찍으면 어제가 나온다.
(음의 오프셋 타임존에서는 반대로 저녁 시간대에 +1 밀림이 발생할 수 있다.)

핵심은 "사람이 읽는 날짜"와 "정밀 타임스탬프"의 기준 타임존을 구분하지 않고 하나로 섞어 쓴 것.

## 해결

날짜만 필요한 곳은 로컬 타임존 기준으로 직렬화하는 전용 헬퍼를 둔다.
`toLocaleDateString('sv-SE')` 는 스웨덴 로캘이 ISO 형식(`YYYY-MM-DD`)을 쓰기 때문에,
**로컬 타임존 + ISO 포맷**을 한 번에 만족한다(별도 zero-padding 불필요).

실제 vhk 구현 (`src/lib/date.ts`):

```ts
/**
 * VHK-019: 로컬 타임존 기준 `YYYY-MM-DD` 날짜 문자열.
 *
 * `new Date().toISOString().slice(0, 10)` 은 **UTC** 기준이라, KST(UTC+9) 자정~오전 9시
 * 사이에 기록하면 '어제' 날짜가 찍혀 하루 밀린다(블로커/학습/TIL/recap 로그 등 날짜 오기록).
 * `toLocaleDateString('sv-SE')` 는 로컬 타임존 + ISO 형식(YYYY-MM-DD)을 동시에 만족한다.
 *
 * 주의: 시각까지 필요한 머신 타임스탬프(생성시각 푸터·백업 파일명·HARD_STOP ts·memory addedAt)는
 *      Z(UTC) 표기가 명확하므로 `toISOString()` 을 그대로 둔다. 이 함수는 '날짜 표기' 전용.
 */
export function localDate(d: Date = new Date()): string {
  return d.toLocaleDateString('sv-SE')
}
```

운영 규칙:

- **사람이 읽는 날짜**(로그 파일명, 발견일/기록일, recap 헤더) → `localDate()` (로컬 타임존).
- **머신 타임스탬프**(생성시각 푸터, 백업 파일명, 정지 신호 ts, 메모리 addedAt 등 정밀 시각) → `toISOString()` 그대로 유지. UTC + `Z` 표기가 명확해 머신 비교/정렬에 안전하다.

즉 **둘을 한 함수/한 포맷으로 섞지 말 것.** 날짜 표기는 로컬, 정밀 타임스탬프는 UTC.

## 적용 조건

- ✅ 로그/문서/리포트에 "사람이 보는 날짜(YYYY-MM-DD)"를 찍을 때
- ✅ 날짜로 파일명을 만들 때 (`YYYY-MM-DD-작업명.md` 등) — 로컬 날짜로 폴더가 깔끔히 묶임
- ✅ UTC 가 아닌 타임존(특히 KST 등 양의 오프셋)에서 동작하는 CLI/로컬 도구
- ❌ 머신용 정밀 타임스탬프(정렬·비교·만료 계산·이벤트 시각) — 이때는 `toISOString()`(UTC, `Z` 명시)을 유지
- ❌ 여러 타임존 사용자가 공유하는 서버 저장값 — 저장은 UTC 로 통일하고 표시 단계에서만 로컬 변환
- ❌ 사용자/서버 타임존을 명시적으로 고정해야 하는 경우 — 그땐 `{ timeZone: 'Asia/Seoul' }` 처럼 옵션을 박아 의도를 못박을 것

## 검증

`tests/date.test.ts` 가 버그 재현과 로컬 기준 정합을 함께 검증한다.

```ts
it('버그 재현: UTC 저녁 시각은 KST 로 다음날 — UTC slice 는 하루 밀린다', () => {
  // 2026-05-31 16:00Z = 2026-06-01 01:00 KST. 날짜 표기는 KST(로컬) 기준이어야 함.
  const d = new Date('2026-05-31T16:00:00Z')
  expect(d.toISOString().slice(0, 10)).toBe('2026-05-31') // 기존 버그: UTC '어제'
  expect(d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })).toBe('2026-06-01') // KST '오늘'
})
```

또한 "UTC 가 아니라 로컬 타임존 날짜를 쓴다" 테스트는 여러 ISO 입력에 대해
`localDate(d)` 가 로컬 getter(`getFullYear`/`getMonth`/`getDate`)로 직접 조립한 값과
일치함을 보장한다 — 즉 결과가 실행 타임존을 따른다는 것을 회귀 방지로 못박는다.
