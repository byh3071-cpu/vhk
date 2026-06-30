# 2026-07-01 — N2: reinforce 성공패턴 evolve 후보 활용 + vhk 자기 도그푸딩

> append-only. 추가만, 수정·삭제 금지.

## 한 일 (N2 — 복리 척추 1/2)
`pattern.ts`가 감지만 하고 `evolve.ts`가 버리던 **reinforce(성공) 패턴**을 룰 후보로 살림. avoid(❌) 단방향이던 자산을 ✅/❌ 양방향으로 대칭화.

### 변경
- `src/commands/evolve.ts`
  - `generateCandidates`: 필터 `kind === 'avoid'` → `status === 'active'` (avoid+reinforce 모두). patternId가 kind 포함(`sigOf`)이라 dedupeKey 충돌 0.
  - `buildDraft`: kind 분기. reinforce → `- ✅ 권장: 태그 '…' 패턴 재사용 (근거: N건 성공, …)`. avoid는 기존 "사전 점검 필수" 유지.
  - `evolveSuggest` "후보 없음" 분기: `activeAvoid` → `activePatterns`(reinforce 포함 정직화).
- `tests/evolve.test.ts`: 옛 동작 박제 테스트(`reinforce 패턴 제외`) → 새 동작으로 교체 + buildDraft reinforce + dedupeKey 충돌 없음 테스트 추가.

### 철칙 부합
결정론 빈도 카운팅(LLM 0). RULES.md 반영은 여전히 `evolve apply` 사람 승인 게이트. apply 자동화는 안 함(ⓓ 철칙 위반).

### TDD
RED(2 fail 정확한 이유) → GREEN(52 pass) → 전체 `vhk verify` PASS.

## vhk 자기 도그푸딩 (이 작업으로 vhk를 vhk로 검증)
"VHK 작업 때 vhk 쓰나?" 질문 계기 — 그동안 raw git/vitest만 씀(도그푸딩 구멍) → 만회.

- **버전 스큐 발견**: 글로벌 `vhk` = 2.6.0(stale, pnpm bin), 로컬 dist = 2.7.0. → 이 브랜치 코드 검증하려면 `node dist/index.js`로 돌려야 함(글로벌은 옛 코드 테스트). **반복 위험 — 도그푸딩 시 항상 로컬 dist 확인.**
- `vhk mission set/check`: N2 범위 계약(scope=evolve.ts·test) 저장·검증 ✓. glob 한정(objective 의미 미검증) 정직 고지 확인 — ⓑ intent 격차 실물.
- `vhk verify`: 5게이트(tsc/lint/test:run/build/secure) PASS. 수동 build+test의 상위집합 = 도구가 더 촘촘.
- `vhk receipt`: 미커밋 상태 🔴 BLOCK 정상 발화("dirty" + "작업시작 미기록"). 거짓완료 탐지기 라이브 작동 증명.
  - 📝 습관 갭(도구 버그 아님): N2 시작 때 `vhk receipt --mark-start`로 기준선 고정했어야 → stale 판정 가능. 다음부터 작업 시작 시 mark-start.

## 다음
- N2 커밋(수동 — vhk save 안 씀, main push 차단·정크커밋 위험) → PR → CI green → 머지.
- **N7 receipt-log 영속** (복리 척추 2/2) = 다음.
