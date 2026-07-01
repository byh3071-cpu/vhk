# 2026-07-01 — readMission 스키마 검증 강화 (손상 mission.json 크래시 차단)

## 결론
`readMission` 이 `objective` 문자열만 검증하고 `scope`/`forbidden` 배열 여부를 검증하지 않아,
구조 무효 mission.json(예: `{schemaVersion,objective}` 만 있음)이 downstream `checkMission` 에서
`mission.forbidden.filter(...)` TypeError 를 일으켰다. `collectIntent` 가 이 호출을 try/catch 밖에서
하므로 `vhk receipt` 전체가 미처리 예외로 죽고("원장/수집 실패는 본 판정을 막지 않는다" 설계와 모순),
`vhk mission check` 도 크래시.

## 근본원인
방어 검증 갭. 레포 전반이 BOM-safe·손상라인 skip·정직 null 로 손상 입력을 흡수하는데
mission.json 만 objective 만 검증해 무효 객체를 흘림. readMission 문서 계약("없거나 손상이면 null")과 어긋남.

## 수정
- `src/commands/mission.ts` `readMission`: `Array.isArray(m.scope) && Array.isArray(m.forbidden)` 조건 추가,
  미충족 시 null 반환(손상 흡수). why 블록주석 보강.
- `tests/mission.test.ts`: 회귀 3건(scope/forbidden 누락, forbidden 비배열, 크래시 없음) 추가.

## 검증
- `pnpm build` 성공
- `pnpm test:run` — 189 files / 2096 tests 전부 pass
