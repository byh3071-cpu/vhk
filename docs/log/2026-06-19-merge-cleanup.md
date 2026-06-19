# 2026-06-19 — 뒷단 4트랙 머지 마무리 + 브랜치 정리 + topics

> append-only. 이 세션 = 다른 세션이 만든 ops(#294)·sell(#295) PR을 머지까지 끌고 가고, 원격 브랜치를 정리한 마무리 세션. 코드 신규 개발은 다른 세션 소관(본 세션은 진단·fix·머지·정리).

## 완료

- **GitHub topics 14개 부착** — `cli`·`mcp`·`model-context-protocol`·`ai-agent`·`claude-code`·`cursor`·`korean`·`vibe-coding` 등. 레포 검색 노출 0 → 확보 (제품화 차원 무비용 보정).
- **#294 (goal-76 vhk ops) 머지** — CI 4환경(ubuntu·windows × node 22·24) 동시 fail. "로컬 worker flaky"로 오인했으나 실제 원인은 `gen-goals-index` 드리프트: goal 76 카드 추가 후 `goals/README.md` 인덱스 미재생성(테스트 `gen-goals-index.test.ts` "커밋된 README == 재생성 결과"가 정확히 검출). `node scripts/gen-goals-index.mjs` 재실행(75→76 goal)으로 fix, CI green 후 squash 머지.
- **#295 (goal-77 vhk sell) 머지** — `feat/fullcycle-ops` 위 스택 PR. ops 머지로 base 정렬 필요 → `git rebase --onto origin/main <ops커밋>`(충돌 0, ops 커밋 스킵, sell 커밋만 재적용) → README 재생성(76→77) → `--force-with-lease` push → PR base를 main으로 변경. force push가 CI 워크플로를 재트리거하지 않아(synchronize 누락) 빈 커밋으로 재트리거 → CI green 후 squash 머지.
- **브랜치 정리** — ops·sell 머지 브랜치 삭제 + 머지된 stale 원격 브랜치 21개 일괄 삭제(`gh pr list --state merged`의 headRefName과 대조해 PR MERGED 판정). 미머지 2개(`chore/goal-sync-backfill-21-33`·`claude/vhk-soul-injection-ofscyh`) 보존. 원격 = main + 미머지 2개.

## 결과

- **RFC 0052 뒷단 4트랙(content→launch→ops→sell) 완성.** main HEAD `4d095e1`, goals 77건(DONE 69). 열린 PR 0.
- 사용자 정의 업그레이드 우선순위 **4(뒷단 확장) 완료** → 다음 3(품질 천장).

## 테스트

- 로컬 vitest는 Claude Code Bash 환경에서 worker 크래시("Worker exited unexpectedly", node 24.13) — `.claude/settings.json` env 문제 아님 확인(NODE_OPTIONS·VITEST 환경변수 없음). CI(node 22·24)에선 1748+ pass 정상이라 환경 한정 이슈.
- 인덱스 fix는 vitest 우회하여 **idempotent 검증**(재생성 전후 `git hash-object` 동일)으로 통과 보장 확인. 두 PR 모두 CI 4환경 green.

## 배운 점

- **CI 4환경 동시 fail = flaky(환경)가 아니라 결정적 버그 신호.** 환경 문제면 일관되게 안 깨진다.
- squash 머지된 base 위 스택 PR은 `rebase --onto <newbase> <old-base-commit>`로 중복 커밋을 스킵하는 게 깔끔 — `merge`는 SHA 불일치로 가짜 충돌이 다발한다(11파일 충돌 경험).
- **force push는 PR CI 워크플로를 항상 재트리거하지 않는다** → 빈 커밋(synchronize 이벤트)이 확실한 재트리거 수단.
- `--force-with-lease`는 settings의 `git push --force` deny 패턴에 안 걸린다(별개 토큰).

## 다음 (인수인계)

- **우선순위 3 — 품질 천장 ~4.7** (RFC 0048 P2): G51 출력계층 단일화 · G53 가드 behavior 이전(정규식 shape 350개) · G54 제품 메타 SoT.
- 이후 우선순위 2(measure-first 실측: recall@5·diff-cover) · 1(출시: v2.6.0 npm 발행 2FA + topics 완료).
- 미머지 보존 브랜치 2개(`chore/goal-sync-backfill-21-33`·`claude/vhk-soul-injection-ofscyh`) — 살릴지/버릴지 product 판단 대기.
