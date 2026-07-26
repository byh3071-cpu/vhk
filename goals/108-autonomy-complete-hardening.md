---
vhk_format: 1
type: goal
id: 108
title: autonomy complete 판정 강화 — 결정론 3중 + 롤링 강등 (B1·B2)
status: NOT_STARTED
priority: P1
created: 2026-07-27
leads_to: D2 조건(a) "측정된 자율 신뢰"의 신뢰 가능한 카운터 — 딥리서치 결정 1
---

# Goal 108: autonomy complete 판정 강화 (B1·B2)

## 근거
딥리서치(yohan-brain research 2026-07-27, PR#143 머지) 결정 1: "complete" 자기보고는 카운터 자격 없음(LLM judge 거짓성공 AUROC<0.65·자기보고 부정확 악화). 업계 기본값 = 연속 20회+강등 규칙(Paperclip 74.8k★). complete≥5를 살리려면 정의 강화가 선결.

## 동작
- autonomy-log의 complete 집계 = **결정론 3중 확인**(vhk verify green + receipt 유효 + interventions=0)만 인정 — 자기보고·적대리뷰 소견은 카운터 제외
- `taskType` 필드 추가(chore/docs vs src 코드 — 유형 티어 이원화 기반)
- 롤링 강등: 최근 10회 중 3실패 = 자율 축소 판정 + 승급/강등 전이를 autonomy-log에 기록
- 승급 후에도 아침 3문답 유지(spot-check 전환은 후속)
- 인프라 오류(네트워크·quota)는 실패 집계 제외

## Completion Check
- [ ] autonomy-log 스키마 확장 + 마이그레이션(기존 jsonl 하위호환)
- [ ] stats 완주율 섹션이 3중 확인 기준으로 재계산
- [ ] check-goal-108 (스캐폴드)
- [ ] 공통 게이트

## Mandatory Reading
- docs/adr/ADR-008 · docs/rfc/0054-execution-evolution.md · docs/roadmap/autonomy-evolution.md · yohan-brain research 2026-07-27 결정 1
