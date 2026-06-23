---
vhk_format: 1
type: goal
id: 83
title: 보안 scan 테스트 픽스처 false positive allowlist — P2
status: DONE
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
- [x] `tests/**` 픽스처 컨텍스트 식별 — `isTestFixturePath`(tests?/·__tests__·__mocks__·fixtures?/·*.test.*·*.spec.*, Windows 정규화, 'latest' 부분문자열 오탐 방지)
- [x] 컨텍스트 기반 MEDIUM→INFO 강등 — `downgradeTestFixtureFindings`(순수함수, 제거 아님=신호 보존) + secure.ts INFO 그룹("유출 아님")
- [x] CRITICAL/HIGH는 위치 무관 유지 — 강등 조건 medium 한정 + 회귀 테스트(tests/** AWS=critical 유지)
- [x] 진짜 시크릿(소스 .ts MEDIUM·src AWS) 여전히 탐지/유지 단언 테스트
- [x] check-goal-83.mjs
- [x] 공통 게이트 통과, 회귀 0 (게이팅 소비처 verify·save·mcp 는 filterSevereFindings=critical/high 만 → info 영향 0)

## 구현 노트 (선조사)
- 카드 premise 정확(재조정 불필요). secure.ts 는 이미 MEDIUM 을 exit 1 안 시킴(ℹ 정보성) — 문제는 *표시 문구*가 "MEDIUM 1건"으로 떠 비개발자가 "유출?" 놀람.
- **픽스처 실범위(카드 문구 "tests/**"보다 넓음, 의도적):** `isTestFixturePath` 는 `tests?/`·`__tests__`·`__mocks__`·`fixtures?/`·`__fixtures__` 디렉터리 + `*.test.*`·`*.spec.*` 파일 모두 픽스처로 본다(가짜 토큰이 정상적으로 들어가는 관례 경로). 경계는 보수적 — `latest.ts`·`contest/`·`tests-data/` 는 미매칭. 강등은 medium 한정이라 이 경로들의 critical/high 는 그대로 잡힌다.
- `info` severity 추가가 안전한 이유: 게이팅 소비처(verify:206·save:64·mcp:127)가 전부 `filterSevereFindings`(critical/high)만 사용 → medium/info 무시. preflight·check 는 자체 severity 타입(무관).
- 라이브: `vhk secure` → 원래 false positive(property-parsers.test.ts:31 JWT)가 `INFO — 1건 (테스트 픽스처 — 유출 아님)`, CRITICAL/HIGH/MEDIUM 0.

## Forbidden Actions (OUT)
- CRITICAL/HIGH 탐지 약화 0
- 실제 `.env`·소스 평문 시크릿 누락(false negative) 0
- allowlist를 광범위 패턴으로 만들어 진짜 유출을 가리는 일 0

## Mandatory Reading
- src/lib/scan-secrets.ts · src/commands/secure.ts · tests/property-parsers.test.ts(픽스처 위치)
- goals/59-secure-incomplete-signal.md
