# 2026-06-27 — Goal 87 PR2: review 의도 대조 합류 (+ 좀비 청소 세션)

## 한 일

### Goal 87 PR2 (의도 장갑 손바닥 — review 면)
- `review`가 mission(scope/forbidden)을 거짓완료 교차검증에 합류 — "시킨 범위를 어겼나"를 review 가 본다.
  - `crossCheck`에 `mission?: MissionCheckResult` 옵셔널 인자 추가(GA 하위호환).
  - **forbidden 위반 → suspicion**(거짓완료 강한 의심 → confidence low → exit 1).
  - **scope 밖 변경 → gap**(advisory, high 금지 — block 아님).
  - `mission.json` 없으면 영향 0(하위호환). 단조성 유지(의도 신호가 신뢰도 격상 0).
- `review()` 경계: `readMission` + `collectChangedFiles` + `checkMission` → `crossCheck` 전달. git 레포 아니면 catch→null(거짓 위반 금지).
- `mission.ts`의 `collectChangedFiles` export(재사용 — `vhk mission check`와 동일 소스).
- receipt(PR1, #394)의 forbidden→block · scope→caution 과 **동급 매핑**(Goal 87 옵션 A 정합).
- 테스트 4개 추가: forbidden→low · scope→gap · null 하위호환 · 단조성(high→low). 통과.

### 좀비 청소 (핸드오프 "B-좀비 진단")
- 머지 완료 원격 브랜치 **21개** `git push --delete`. dependabot **#397**(actions/checkout 6→7) 머지.
- `.claude/agent-memory/` gitignore + CLAUDE.md LIVE 잔존 정정. (#404)
- 트랙B 발견: `vhk check evals` 채점기 미구현(로드맵 G-B)이라 규칙점검 silent fallback → 이슈 **#405**.

## 게이트
- `pnpm build` ✅(타입 통과). 로컬 vitest forks 불안정(TS-004) — 의도 대조 테스트 4개 단독(threads) 통과. 전체 회귀는 CI(forks 정상)가 진실원.

## 다음
- goal 87 PR3(선택): receipt `.md`에 "의도 대조" 섹션. status DONE 은 공통 게이트(CI) 통과 후 판단.
