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

## 보강 — G4 적대리뷰 후속 (치명 1건: core.quotePath 한글 경로 깨짐)

### 증상 (실측 재현)
한글 파일명이 있는 repo 에서 `vhk save` → 커밋 메시지가
`chore: vhk save — "\355\225\234\352\270\200\355\214\214\354\235\274.ts"` 처럼 8진 이스케이프로 깨짐.
이전 고정 메시지(`chore: vhk save`)는 경로를 안 넣었으니 **이 PR 이 새로 일으키는 회귀**.
한국어 사용자에서 즉시 발동.

### 근본 원인
`src/lib/git-session.ts` 의 `statusPorcelain()` 이 `git status --porcelain` 을 `-c core.quotepath=false`
없이 실행 → git 기본(quotepath=true)이 비ASCII 경로를 따옴표+8진으로 출력. 이 출력이
`formatChangeSummaryMessage` 의 입력(`lines`)이라 메시지에 그대로 박힘. (#319 에서 `diffUnified0` 가
같은 이유로 이미 quotepath=false 를 적용했었음 — 동일 계열 버그.)

### 고친 방법
- `git-session.ts`: `statusPorcelain` argv 를 `['-c','core.quotepath=false','status','--porcelain']` 로
  변경(`diffUnified0`/check-records/record-reminder 와 동일 패턴·casing). 공유 SoT 라 save 메시지 +
  status/MCP 파일 표시가 한 번에 고쳐짐. `trimOutput:false` 유지(check-goal-48 게이트).
- `git-session.test.ts`: statusPorcelain argv 단언을 quotepath 포함으로 갱신(#319 와 동일하게 argv
  레벨에서 fix 고정 — 플래그 제거 시 즉시 빨강).
- `tests/save-quotepath.test.ts`(신규): 실 git repo 에 한글 파일 생성 → statusPorcelain →
  formatChangeSummaryMessage 메시지에 raw `한글파일.ts` 포함 + `\NNN` 8진/따옴표 없음 고정.
  chdir 미사용(cwd 명시)으로 TS-004 회피.
- `src/mcp/server.ts`: save 핸들러 `files` 파싱을 CLI 와 동일 `parsePorcelainLines()` 로 통일
  (CRLF 정규화 — files 가 메시지가 되므로 파싱 파리티가 정확성에 직결).
- `formatChangeSummaryMessage`: 72자 상한이 `+N more` 접미사 미포함 근사치임을 주석 명시.
- README: save 동작(자동 메시지·`-m`) 갱신(헌법 "동작 바뀌면 README 갱신").

### 검증
- 빌드한 CLI 실측: fix 후 `chore: vhk save — 한글파일.ts`(raw). build·tsc·관련 테스트 PASS 는 PR 본문.
