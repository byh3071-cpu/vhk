# 회고 — v2.0~v2.3: memory v2 와 진화 루프 (2026-06-03 ~ 06-05)

> governance T5 백필 회고(2026-06-11 작성). git 태그·CHANGELOG 기반 재구성.

## 무엇이 만들어졌나

- v2.0.1 **memory schema v2 BREAKING**([ADR-004](../adr/ADR-004-memory-schema-v2-breaking.md)) —
  4버킷 + 생명주기 + learn 단일 SoT + 무손상 자동 마이그레이션(.v1.bak).
- v2.1.0 pattern detection v0(goal 19) → v2.3.0 **vhk evolve**(goal 20) + MCP 29 tools 완성.
- v2.0.2 글로벌 심링크 실행 가드.

## 배운 것

- **v2.0.0 발행 사고**: 2.0.0 이 릴리즈 분리로 미발행, 2.0.1 로 정리 — 이후
  "publish 는 main 에서만 + 발행 전 브랜치 확인 + tarball 검증" 관례의 배경.
  (2.3.1 오발행 사고와 함께 가드 #119 의 동기.)
- breaking 을 "자동·멱등 마이그레이션 + write-once 백업"으로 치른 경험이
  breaking 템플릿(ADR-004 §결정 ⑤항목)으로 남음 — 다음 breaking 은 이 절차 재사용.
- goal 19 도그푸딩이 유닛테스트가 못 잡은 통합 결함 2건을 발견 — "신규 기능 도그푸딩
  1회 필수" 규칙의 직접 기원.

## 손실 구간 (정직 표기)

- v2.2.0 은 버전 범프만(내용 없음 — CHANGELOG 실측). 이유 기록 없음.
