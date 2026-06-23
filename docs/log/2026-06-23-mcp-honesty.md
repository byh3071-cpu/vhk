# 2026-06-23 — MCP 거짓 보고 수정 (#340/#341)

> 6-22 도그푸딩 high. MCP 가 실패/불명을 성공으로 위장하는 2건(같은 주제 — 정직성).

## #340 — runVhkCli 가 NL 미인식을 ✅ 로 위장
- runVhkCli(server.ts)가 헤드라인을 exit code + `isGuardBlockedOutput` 만으로 결정 → NL 라우터 미인식 폴백(`❓ 무슨 뜻인지 모르겠어요`, exit 0)이 `✅` 거짓 성공으로 표시(content/launch/ops/sell/remind).
- `isNotMatchedOutput` 추가 → runVhkCli 분기에서 `❓ 미인식` prefix. 주석(L64)이 "막는다"던 바로 그 케이스 봉인.

## #341 — MCP audit 이 감사 불가를 '취약점 0건'으로
- MCP audit 핸들러가 `parseAuditOutput`(.summary 만, indeterminate 폐기) → ENOLOCK·빈/형식불량 출력을 0건 단정(CLI 는 '결과 불명' exit 1).
- `parseAuditOutputDetailed` 로 교체 → `indeterminate` 면 '감사 결과를 해석하지 못했습니다 (결과 불명)'(CLI parity).

## 검증
- typecheck·build ✓
- **tsx 직접검증 4/4**: isNotMatchedOutput(미인식=true·정상=false) · parseAuditOutputDetailed(빈=indeterminate true·정상=false)
- 회귀 테스트 mcp-cli-contract.test.ts(#340 ❓ prefix + isNotMatchedOutput + #341 결과불명) — 로컬 forks 환경(TS-004) crash, **CI 진실원**.

## 남은 high
#339 MCP 글로벌 vhk 우선(cli-path 버전 스큐) — 별도 PR.
