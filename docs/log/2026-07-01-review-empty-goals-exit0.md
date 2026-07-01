# 2026-07-01 — vhk review: 빈 goals exit 1 → 스킵(exit 0) 정정

## 결론
`vhk review` 가 goal 이 하나도 없는 저장소에서 경고만 내면 될 것을 `process.exitCode=1`
로 종료하던 결함(gh#271)을 정정. 경고 후 exit 0(스킵)으로 변경.

## 원인
review 는 새 증거를 만들지 않는 읽기전용 교차검증인데, `goals.length===0`(선택 기능
미사용)만으로 '실패'로 간주해 exit 1 을 냈다. 외부 Focus Feed 가드가 이 exit 1 에
반응해 project-failure incident 레지스트리를 오염(incident 생성은 vhk 밖 외부 도구
소관 — src/ 에 incident 코드 없음).

## 수정
- `src/commands/review.ts` — 빈 goals 분기에서 `process.exitCode=1` 제거, 경고 +
  `printNextStep(vhk goal init)` 후 return(exit 0 스킵). #157 exit code 정책(강한
  모순이 아닌 상태엔 exit 1 금지)과 일관. verify.ts(같은 읽기전용 검증)가 빈 goals 에서
  실패하지 않는 것과도 일치.
- `tests/review.test.ts` — 빈-goals 회귀 테스트 추가(경고 후 exit 0 + 새 증거 미생성).

## 게이트
- `pnpm build` 성공 · `pnpm test:run` 2094 pass(189 files).

## 교훈
읽기전용 검증 명령의 exit code 는 "새 증거를 만드는가"가 아니라 "강한 모순이
있는가"로 결정해야 한다. 선택 기능 미사용은 실패가 아니라 스킵. exit code 가 외부
가드의 incident 트리거로 소비되는 계약이면 non-failure 상태에 exit 1 을 내면 안 됨.
