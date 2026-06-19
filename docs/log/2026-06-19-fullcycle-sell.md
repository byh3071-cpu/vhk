# 2026-06-19 — goal 77: vhk sell (풀사이클 뒷단 판매 트랙·마지막)

> RFC 0052 §4·§5 넷째(마지막) 트랙. content→launch→ops→**sell** 4트랙 완성. ops 패턴 복제.

## 한 일
- `vhk sell`(별칭 판매) 신규 — VISION What → 판매 준비 체크리스트(가격·결제수단·환불정책·가치제안) + 가격 페이지 카피·FAQ 초안 프롬프트(`.vhk/sell-prompt.md`). 자문형(결제·과금 연동 0 — 실패비용 최상위라 트랙 마지막·가장 보수적).
- `src/commands/sell.ts`: `buildSellPrompt` 순수함수 + `emitPrompt` 공유헬퍼 재사용. Fable5 위생(✅/❌·FAQ ≤3·승인 전 결제·과금 금지·다크패턴 금지).
- 등록 10지점 + MCP(34→35) + COMMANDS/README. ops(76)→sell 체인 연결로 **뒷단 4트랙 마감**.
- tests/sell.test.ts 5 + scripts/check-goal-77.mjs(고유검증 15) + goals/77 카드(DONE).

## 검증 (게이트)
- typecheck ✓ · build ✓ · lint ✓
- sell 5/5 · ops 5/5 · launch 5/5 · goal77 고유검증 15/15 ✓
- mcp-cli-contract A: 도구 정확셋 34→35 갱신(EXPECTED_TOOLS+sell · length 35 · 위임매트릭스+sell) ✓
- ※ vitest forks worker exit(환경 flaky)는 goal 76 dev log 참조 — main에도 동일, 변경 무관. D섹션(deploy/publish) 2건은 threads 풀의 `process.chdir` 미지원 한정(forks에선 통과).

## 적대 검토 발견·반영
- sell 라우팅 정규식 `sell` 단어경계 없음 → "sells/bestseller" 오탐 위험 → `\bsell\b` 강화.
- check-goal-77 외부호출 검사: 프롬프트 텍스트의 "Stripe" 예시 ≠ SDK 호출 — `.charges.create`·`checkout.sessions.create` 등 실제 호출 패턴만 차단(텍스트 오탐 회피).

## 후속
- **풀사이클 뒷단 4트랙(content·launch·ops·sell) 전부 구현 완료** — RFC 0052 본문 구현 마감. 승격(게이트/CI)은 measure-first(트랙별 실사용 후).
- README "MCP NN tools" 섹션 드리프트(goal 75부터 누적, 실제 35) — 별도 위생 PR 권장.
- 브랜치 = feat/fullcycle-ops 위 stacked. ops PR(#294) 머지 후 base 자동 main 전환.
