---
vhk_format: 1
type: goal
id: 83
title: 보안 scan 테스트 픽스처 false positive allowlist — P2
status: NOT_STARTED
priority: P2
created: 2026-06-20
leads_to: secure scan 노이즈 ↓ (진짜 시크릿 신호 보존)
---

# Goal 83: 보안 scan 테스트 픽스처 false positive

> 출처: RFC 0053 §4(D7). 도그푸딩 감사 [D7]. 연계: Goal 59(secure 미완 신호).

## 근거 (실측)
- `vhk 보안 scan` → `MEDIUM — 1건: JWT Token · tests/property-parsers.test.ts:31 → eyJabc.e****`.
- 이는 **테스트 픽스처(가짜 토큰)** — 실제 유출 아님. 사용자가 "유출됐나?" 놀람(거짓 경보로 신호 신뢰 저하).

## 동작
- `tests/**` 픽스처·예시 토큰을 식별해 allowlist 또는 컨텍스트 기반 강등(MEDIUM→INFO).
- 단, `.env`·소스의 진짜 시크릿과 CRITICAL/HIGH 탐지는 **그대로 유지**(약화 금지).

## 수용 기준
- 알려진 테스트 픽스처는 경보에서 빠지거나 INFO로 강등되고, 실제 시크릿(소스/.env)은 여전히 잡힌다.

## Completion Check (작은 단위)
- [ ] `tests/**` 내 알려진 가짜 토큰/픽스처 패턴 식별(property-parsers 등)
- [ ] allowlist 메커니즘 or `tests/` 픽스처 컨텍스트 MEDIUM→INFO 강등 구현
- [ ] CRITICAL/HIGH는 위치 무관 유지 — 회귀 테스트로 보장
- [ ] 진짜 시크릿(소스/.env mock) 여전히 탐지 단언 테스트
- [ ] check-goal-83.mjs
- [ ] 공통 게이트 통과, 회귀 0

## Forbidden Actions (OUT)
- CRITICAL/HIGH 탐지 약화 0
- 실제 `.env`·소스 평문 시크릿 누락(false negative) 0
- allowlist를 광범위 패턴으로 만들어 진짜 유출을 가리는 일 0

## Mandatory Reading
- src/lib/scan-secrets.ts · src/commands/secure.ts · tests/property-parsers.test.ts(픽스처 위치)
- goals/59-secure-incomplete-signal.md
