# 2026-06-23 — MCP CLI parity #339 (전역 vhk 버전 스큐)

> 6-22 도그푸딩 high 마지막. MCP 위임이 전역 vhk 를 무조건 우선 → 버전 스큐로 6종 깨짐.

## 수정
- `cli-path.ts` pickCliInvocation: 전역 vhk 우선 → **동봉 dist 우선**. MCP 서버는 mcp-init 이 `node <트리>/dist/mcp/index.js` 로 등록하므로 위임 CLI 도 같은 트리 dist/index.js 여야 parity. 전역이 한 버전이라도 뒤처지면 content/launch/ops/sell/remind/loop-brief 가 조용히 깨지던 것 차단.
- fallback 필드 의미 갱신(로컬 dist 위임 여부). dist·전역 둘 다 없을 때만 마지막 수단으로 vhk 시도.

## 검증
- typecheck·build ✓ · mcp-cli-path.test.ts 5 pass(dist 우선 단언 #339 포함)
- mcp-server/contract 위임 단언은 args 꼬리 비교(bin 무관)라 영향 없음 — CI 확인.

## 도그푸딩 high 완료 (이번 세션)
#337·#338(undo) · #334·335·336(HARD_STOP 가드) · #340·341(MCP 거짓보고) · #339(parity) = **high 7 + med 1(#334) + low 1(#347) 전부**. resume exit 127 → #353 별개 추적.
