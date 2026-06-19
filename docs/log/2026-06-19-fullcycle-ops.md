# 2026-06-19 — goal 76: vhk ops (풀사이클 뒷단 운영 트랙)

> RFC 0052 §4·§5 셋째 트랙. content(74)→launch(75)→**ops(76)**→sell(77). launch 패턴 복제.

## 한 일
- `vhk ops`(별칭 운영) 신규 — VISION What → 운영 현황 체크리스트(피드백채널·30일 사용자수·탈출조건) + 운영 회고·다음 결정(유지/피벗/아카이브) 초안 프롬프트(`.vhk/ops-prompt.md`). 자문형(중단·삭제·피벗 실행 0 — 헌법 실패비용 high 제외).
- `src/commands/ops.ts`: `buildOpsPrompt` 순수함수 + `emitPrompt` 공유헬퍼 재사용(content/launch 단일 SoT). Fable5 위생(✅/❌·액션 ≤3·승인 전 중단·삭제 금지).
- 등록 10지점: index·command-registry·cli-args·nlp-router·nlp-run·MCP(33→34)·vhk-dir(문서표·gitignore) + COMMANDS/README.
- launch(75)→ops 체인: launch printNextStep 에 `command: 'vhk ops'` (content→launch→ops 흐름 완성).
- tests/ops.test.ts 5건 + scripts/check-goal-76.mjs(고유검증 15) + goals/76 카드(DONE).

## 검증 (게이트)
- typecheck ✓ · build ✓ · lint ✓
- ops 5/5 · launch 5/5 · goal76 고유검증 15/15 ✓
- mcp-cli-contract A: 도구 정확셋 33→34 갱신(EXPECTED_TOOLS+ops · length 34 · 위임매트릭스+ops) ✓
- 전체 vitest: **failed 0**. ※ vitest 4.1.7 forks worker "exited unexpectedly" 87건 = **환경 flaky**(Node 24.13+win32). main(d02f9ac)을 stash 후 동일 87건 재현 — 내 변경 무관 확정.

## 적대 검토 발견·반영
- ops 라우팅 정규식 `ops` 단어경계 없음 → "stops/drops" 오탐 위험 → `\bops\b` 로 강화.
- launch.ts 체인 변경은 `buildLaunchPrompt` 와 무관(launch.test 5/5 통과 — printNextStep만 추가).

## 미해결/후속
- README "MCP 30 tools" 섹션 = goal 75(launch)부터 누적된 별도 드리프트(실제 34). goal 76 범위 밖 — 별도 위생 PR 권장.
- sell(77) = 뒷단 마지막 트랙, 미착수(RFC 0052 §5 동시착수 금지 — 개별 goal·개별 PR).
- 환경 flaky(vitest forks worker exit)는 프로젝트 공통 — 별도 인프라 이슈로 추적 권장(maxWorkers/pool 설정 검토).
