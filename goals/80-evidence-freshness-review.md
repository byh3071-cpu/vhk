---
vhk_format: 1
type: goal
id: 80
title: 증거 신선도 review 연결 — SHA≠HEAD 시 강등 — P1
status: NOT_STARTED
priority: P1
created: 2026-06-20
leads_to: 낡은 PASS 증거로 거짓완료 차단(기록→소비 완결)
---

# Goal 80: 증거 신선도 review 연결

> 출처: RFC 0053 §4(D3). 도그푸딩 감사 [D3]. Goal 44(증거 SHA 기록)의 소비 측 완결.

## 근거 (실측)
- Goal 44가 verify 리포트(`latest.json`)에 HEAD SHA·dirty를 **기록**까지 했다(DONE).
- 그러나 `vhk review` 출력은 여전히 *"증거(latest.json)는 commit/goal 바인딩이 없어 신선도는 생성시각으로만 추정"* → **데이터는 있는데 판정이 소비를 안 함.** 기록과 소비 사이 갭.
- (보강 정황) verify 백그라운드 도중 작업트리가 `docs/soul-inject→main`으로 전환 → 증거가 어느 코드 것인지 시각만으론 불명.

## 동작
- `review`가 `latest.json`의 HEAD SHA(+dirty)를 읽어 **현재 HEAD와 비교**.
- `SHA≠HEAD` 또는 생성 후 dirty면 신선도를 "낡음"으로 강등하고 신뢰도 신호에 반영.
- review 출력 문구 정정: "생성시각 추정" → "SHA 기반 신선도".
- SHA 필드 없는 구(舊)증거는 graceful(기존 시각 추정 폴백, 하위호환).

## 수용 기준
- 코드 변경(HEAD 이동) 후 낡은 증거로 review하면 "증거 낡음"으로 신선도가 강등된다.

## Completion Check (작은 단위)
- [ ] review가 latest.json HEAD SHA·dirty 필드 읽음(Goal 44 스키마)
- [ ] `SHA≠HEAD` or dirty → 신선도 "낡음" 강등 + 신뢰도 반영
- [ ] review 출력 메시지 "생성시각 추정" → "SHA 기반"으로 정정
- [ ] SHA 필드 없는 구증거 graceful 폴백(크래시 0)
- [ ] 회귀 테스트 `tests/review.test.ts`: SHA 일치=신선 / 불일치=강등 / 필드없음=폴백
- [ ] check-goal-80.mjs
- [ ] 공통 게이트 통과, 회귀 0

## Forbidden Actions (OUT)
- verify/verify-report 시그니처 변경 0 (읽기 측만 추가 — GA 안정성)
- Goal 44의 SHA 기록 동작 변경 0
- 신선도 강등을 "차단(fail)"으로 격상 0 (review는 권고 신호 — 헌법, 강제는 별도 결정)

## Mandatory Reading
- src/commands/review.ts · src/commands/verify-report.ts · goals/44-evidence-sha-binding.md
- src/lib/git.ts(HEAD SHA·dirty 조회 통로, Goal 46)
