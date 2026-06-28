# 2026-06-28 — #286 vhk save 커밋 메시지 변경요약 자동 생성

## 증상 (이슈 #286)
독푸딩(cafe-pos-vhk)에서 `vhk save` 로 만든 14커밋이 전부 `chore: vhk save` 로 동일.
git 히스토리에서 "어떤 작업인지" 구분 불가 → 정보가치 낮음. 심각도 Low(히스토리 품질).
기대: 변경 파일/범위 기반 메시지 생성 또는 `-m` 메시지 인자.

## 진단 (정직하게 — 이슈 추정 일부는 이미 해결됨)
- `-m, --message` 인자는 **이미 존재**(#154, src/index.ts:334). 이슈가 적은 "메시지 인자 없음"은
  2.6.0 기준 스테일 — 사용자 직접 지정 경로는 이미 동작.
- 남은 진짜 갭 = **비-TTY/에이전트 fallback**이 하드코딩 `'chore: vhk save'`(save.ts:112).
  독푸딩 14커밋은 전부 이 경로(비대화형 자동화 + `-m` 미사용)를 탔다 → 리터럴 문자열이 정확히 일치.
- TTY 프롬프트 기본값은 `formatDefaultCommitMessage()` = `✨ vhk save: <타임스탬프>`(시각마다 달라 "항상 동일"
  문제는 비-TTY 한정). MCP save(server.ts:158)도 같은 타임스탬프 default.

## 고친 방법 (coherent — 한 값/한 경로)
- `src/commands/save.ts`
  - `formatDefaultCommitMessage`(타임스탬프) 제거 → `formatChangeSummaryMessage(lines)` 신규.
    porcelain 라인에서 경로 추출(rename `old -> new` 은 new 만), `chore: vhk save` 접두 유지하되
    파일 반영: 1개=경로, N개=`N files: a, b, …` + subject ~72자 상한 초과분은 `+K more`.
  - `save()`: `autoMessage = formatChangeSummaryMessage(lines)` 1회 계산 → TTY 프롬프트 default 와
    비-TTY fallback 둘 다 이 값 사용(타임스탬프 default 보다 "변경 반영" 기대에 부합 + 코드경로 단일화).
  - 우선순위: `--message`(직접) → TTY 프롬프트(기본=요약) → 비-TTY fallback(요약).
- `src/mcp/server.ts`: 인라인 타임스탬프 default → 동일 helper 재사용(CLI 파리티). `files` 가 이미
  같은 porcelain 라인 배열이라 무손실 교체. 미사용 `now`/`ts` 제거.

## 회귀 테스트 (tests/save.test.ts)
- 비-TTY fallback 테스트: 단언을 `'chore: vhk save'` → `'chore: vhk save — file.ts'` 로 갱신(버그를
  인코딩하던 단언 교정 + 회귀 방지 제목).
- `formatChangeSummaryMessage` 단위: 단일/다중/rename/대량(+N more·전부나열 안 함)/빈 입력.

## 게이트
- 로컬 worktree node_modules 없어 `pnpm install --prefer-offline` 선행(exit 0). `pnpm build` 통과 확인.
- 로컬 vitest forks 불안정(TS-004) 가능 → save.test 단독/표적 실행으로 확인, 불안정 시 CI 가 진실원으로 명시.

## 범위 밖(의도)
- conventional type(feat/fix) 파일 추론 안 함(불신뢰). i18n 미적용(기존 하드코딩 fallback 과 동일 정책).
- 역사적 문서(goals/archive·superpowers specs)의 `chore: vhk save` 문구는 손대지 않음.
