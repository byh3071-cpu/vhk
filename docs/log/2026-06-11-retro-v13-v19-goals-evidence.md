# 회고 — v1.3~v1.9: goal 체계와 증거 체인 (2026-05-28 ~ 06-03)

> governance T5 백필 회고(2026-06-11 작성). git 태그·CHANGELOG 기반 재구성.

## 무엇이 만들어졌나

- v1.3.0 **goal 시스템**(init/list/next/check/done) + 자율 루프(blocker/learn/resume) +
  HARD_STOP — "1 iteration = goal 하나 + 커밋 하나 + 게이트"의 의례가 코드가 됨.
- v1.4~1.5 포터빌리티(cloud push/pull, sync 3종→7종) · v1.6 드리프트 감지 ·
  v1.6.4~6 비대화형 가드(MCP/CI 안전).
- v1.7.0 **verify 증거화**(Evidence Ledger v0) → v1.7.1 verify --report(HTML) →
  v1.8.0 **review 적대적 자기검증** → v1.9.0 mission(범위 계약).

## 배운 것

- 거짓완료 문제의식이 이 구간에서 태동 — verify(증거) → review(적대 검증) →
  mission(계약) 3종 세트가 순서대로 쌓임. 이후 goal 43(드리프트)·60(스텁 게이트)·
  goal 51~61 까지 같은 줄기.
- v1.6.x 패치 5연발(드리프트 오경보 등) — 게이트를 만들면 게이트의 오탐이 다음 부채가
  된다. "과안정화 경계" 원칙이 여기서 생긴 것으로 추정.

## 손실 구간 (정직 표기)

- v1.0.2→v1.3.0 태그 갭(05-25~28): v1.1/v1.2 가 태그 없이 지나감 — MCP Phase 3/4
  (16→24 tools)가 이 구간 어딘가(mcp-evolution.md 에 추정 표기). npm 발행 이력과
  대조하면 복원 가능하나 이번 백필 범위 밖.
