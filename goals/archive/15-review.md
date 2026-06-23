---
vhk_format: 1
type: goal
id: 15
title: vhk review (적대적 자기검증 v0) — P1
status: DONE
priority: P1
version: v1.8.0
completed: 2026-06-02
---

# Goal 15: vhk review (적대적 자기검증 v0)

> 출처: Trust Loop 로드맵 배치 5 (잔여 — verify JSON은 Goal 13에서 완료). 전제: Goal 13(latest.json) 완료, Goal 14(HTML 패널) 권장.
> 성장 루프에서 "증거 → 적대적 재검증" 단계. verify가 모은 증거를 그대로 믿지 않고, 거짓완료를 적극적으로 찾는 반대 심문 층.

## 배경
verify(Goal 13)는 게이트를 실제 실행해 latest.json에 증거를 남긴다. 하지만 "게이트 통과 = 진짜 완료"는 아니다 — 테스트가 변경을 안 건드리거나, 완료조건 일부만 채우고 done 선언하는 거짓완료가 여전히 가능하다. review는 같은 증거를 적대적으로 다시 심문해 "이 완료 주장이 증거로 버티나?"를 판정한다.

## 철학
① 증거를 믿지 말고 의심 — 통과 신호도 반례를 먼저 찾음 ② 새 증거 안 만듦 — latest.json + goal 완료조건을 교차검증만 ③ 판정은 보장이 아니라 신뢰도 — "거짓완료 의심" 플래그 + 근거 제시 ④ 비결정·거짓양성 주의 — 수렴 정지선, "보장 아님" 표기 필수.

## 동작 (파일·계약)
- src/commands/review.ts: .vhk/reports/latest.json + 대상 goal의 Completion Check를 읽어 교차검증. 각 완료조건이 실제 증거(게이트 결과·변경 파일)로 뒷받침되는지 매핑.
- 출력: 의심 항목 리스트(완료조건 ↔ 증거 갭) + 신뢰도 요약 + "AI에게 다시 물을 프롬프트". 결과는 latest.json에 review 섹션으로 병합(SoT 유지).
- --id N: 특정 goal 대상. 없으면 active goal.
- 거짓완료 신호 감지: 완료조건 체크됐는데 대응 증거 없음 / 테스트 0건 추가 / status DONE인데 게이트 FAIL 등.
- 크로스플랫폼: 게이트 재실행 없이 기존 latest.json 읽기 우선(없으면 verify 선실행 안내).
- secret/env 미포함 (latest.json 그대로 사용).

## Completion Check
- [ ] vhk review → latest.json + goal Completion Check 교차검증, 갭 리스트 출력
- [ ] 완료조건 체크됐으나 증거 없음 → "거짓완료 의심" 플래그 (회귀 가드: 빈 증거로 done 시 잡힘)
- [ ] 판정에 "보장 아님" 표기 + 신뢰도 수준 명시 (거짓 PASS 단언 금지)
- [ ] latest.json 없을 때 동작 정의대로 (verify 선실행 안내 or 명확 종료)
- [ ] --id N / active goal 양쪽 동작
- [ ] review 출력에 secret 누출 0 (vhk secure scan)
- [ ] vhk goal sync → check-goal-15.mjs 생성 → vhk goal check --id 15 통과
- [ ] 공통 게이트 통과 (typecheck + test + build), 기존 회귀 0

## 제외 범위
- Verify Swarm / 멀티 에이전트 적대 검증 런타임 → 버림(플랫폼 레이어)
- 반복 패턴 감지 / evolve → 배치 8+
- HTML 리포트에 review 시각화 → 후속(배치 6 확장)

## Mandatory Reading
- src/commands/verify.ts (Goal 13 verifyEvidence/latest.json 스키마)
- src/commands/goal.ts (Completion Check·status·게이트 로직)
- Trust Loop 로드맵 "배치 5" + 원칙 가드(수렴 정지선·보장 아님 표기)
