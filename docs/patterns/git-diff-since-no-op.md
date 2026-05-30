---
패턴명: git diff 에 --since 를 쓰면 무시되어 변경 통계가 항상 0
카테고리: git
출처프로젝트: VHK (vhk-cli)
태그: [git, git-diff, git-log, git-rev-list, cli-flags, no-op, date-range, silent-failure]
발견일: 2026-05-31
출처DevLog: docs/log/2026-05-31-v1.6.2-dogfooding-release.md
---

# 패턴: `git diff --since=<date>` 는 무효 — 워킹트리만 비교되어 변경 통계가 항상 0

## 증상

특정 날짜 이후의 변경 통계(파일 수/추가·삭제 라인)를 내려고 `git diff` 에 `--since` 를 붙였는데,
에러는 전혀 나지 않으면서 **결과가 항상 0** 으로 나온다.

```bash
# 의도: "2026-05-01 이후 변경" 통계
git diff --since=2026-05-01 --stat
# → 에러 없음. 그러나 출력은 날짜와 무관하게
#   "현재 워킹트리 vs HEAD" 의 차이(보통 0)만 나옴
```

코드로 옮기면 다음과 같이 항상 빈/0 결과가 돌아온다.

```ts
// ❌ 잘못된 구현 — diff 가 --since 를 조용히 무시한다
const diff = await git.diffSummary(['--since', since])
// diff.insertions === 0, diff.deletions === 0, diff.files === []  (날짜와 무관)
```

`--since` 는 `git log` 의 리비전-셀렉션 옵션이지 `git diff` 의 옵션이 아니다.
`git diff` 는 모르는 인자를 (대부분) 무시하고 기본 동작(인덱스/워킹트리 비교)을 수행한다.
즉 **"에러 없는 0"** 이라 정상 통과처럼 보이지만 실제로는 옵션이 통째로 버려진 상태다.

## 원인

CLI 서브커맨드마다 받아들이는 플래그가 다른데, 이를 혼동한 것이 근본 원인이다.

- `--since` / `--until` / `--after` / `--before` 는 **`git log` (리비전 워크) 전용** 날짜 필터다.
  커밋 그래프를 시간으로 잘라 어떤 커밋을 보여줄지 고르는 옵션이다.
- `git diff` 는 **두 트리(커밋/인덱스/워킹트리)의 스냅샷 비교** 도구라 날짜 개념 자체가 없다.
  비교 대상은 "리비전 또는 범위"로 지정해야 하며, 날짜로는 지정할 수 없다.

`git diff` 에 `--since` 를 넘기면 알 수 없는 옵션으로 취급되어 효과 없이 무시되고,
인자 없는 `git diff`(= 워킹트리 vs 스테이징/HEAD)로 동작한다.
깨끗한 트리에서는 그 차이가 0이므로 "조용한 실패(silent no-op)"가 된다.

## 해결

**날짜를 직접 diff 에 넘기지 말고, 날짜를 경계 커밋 SHA 로 먼저 변환한 뒤 커밋 범위(`<boundary>..HEAD`)를 diff 한다.**

1. `git rev-list -1 --before=<date> HEAD` 로 그 날짜 **직전 커밋(boundary)** 의 SHA 를 구한다.
   (`rev-list` 는 `log` 계열이라 `--before` 날짜 필터가 유효하다.)
2. 그 boundary 에서 `HEAD` 까지의 **커밋 범위**를 diff 한다.
3. boundary 가 없으면(= 해당 날짜 이전 커밋이 하나도 없음, 전체 히스토리가 대상)
   **빈 트리 SHA** 를 기준점으로 써서 "최초부터 지금까지"를 비교한다.

실제 vhk 구현 (`src/lib/git.ts`):

```ts
/** 빈 트리 SHA — since 가 전체 히스토리를 포함할 때(boundary 없음) diff 기준점. */
const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

export async function getSessionDiff(since?: string): Promise<SessionDiff> {
  const sinceDate = since || localDate() // 기본 since 는 로컬 '오늘'
  try {
    // `git diff --since` 는 무효(--since 는 log 옵션) → 워킹트리만 diff 해 항상 0.
    // since 직전 커밋(boundary)..HEAD 의 커밋 범위를 diff 해 실제 변경 통계를 낸다.
    const boundary = (await git.raw(['rev-list', '-1', `--before=${sinceDate}`, 'HEAD'])).trim()
    const base = boundary || EMPTY_TREE_SHA
    const diffSummary = await git.diffSummary([`${base}..HEAD`])
    // ... diffSummary.insertions / deletions / files 로 통계 구성
  } catch {
    return { filesChanged: 0, insertions: 0, deletions: 0, files: [] }
  }
}
```

핵심 변환은 두 줄이다.

```ts
const boundary = (await git.raw(['rev-list', '-1', `--before=${sinceDate}`, 'HEAD'])).trim()
const base = boundary || EMPTY_TREE_SHA
const diffSummary = await git.diffSummary([`${base}..HEAD`])
```

`git.diffSummary` 에는 날짜가 아니라 **리비전 범위 문자열(`base..HEAD`)** 하나만 넘어간다.
또한 커밋이 0개인 신규 레포에서는 `rev-list`/`diff` 가 throw 하므로 `try/catch` 로 흡수해 빈 결과를 반환한다.

> 교훈: **CLI 플래그가 그 서브커맨드 소속인지 먼저 확인하라.**
> 어떤 옵션이 `log` 전용인데 `diff` 에 붙이면 에러가 아니라 "무시"로 끝난다.
> **"에러 없이 0" 은 정상이 아니라 옵션 무시일 수 있다** — 0/빈 결과가 나올 때
> "정말 0인지" vs "필터가 먹지 않은 것인지"를 의심하라.

## 적용 조건

- ✅ "특정 날짜/시점 이후의 변경"을 diff 통계(파일 수·추가/삭제 라인)로 내야 할 때
- ✅ `git log` 계열 날짜 플래그(`--since`/`--before`/`--after`/`--until`)를 `git diff` 에 잘못 넘기고 있을 때
- ✅ simple-git 등 래퍼로 diff 를 호출하는데 결과가 항상 0/빈 배열로 나올 때
- ✅ 날짜 → 커밋 SHA 변환이 가능한 환경(로컬 git 히스토리 존재)일 때
- ❌ "커밋이 아니라 워킹트리/스테이징의 현재 미커밋 변경"을 보고 싶을 때 (이때는 인자 없는 `git diff` 가 맞다)
- ❌ "어떤 커밋을 보여줄지" 목록만 필요할 때 — 그건 원래 `git log --since` 로 충분하다(이 경우 `--since` 는 유효)
- ❌ 빈 트리 SHA 미지원/비표준 git 호환 도구 — `EMPTY_TREE_SHA` 폴백이 통하지 않을 수 있음

## 검증

`getSessionDiff` 의 boundary→범위 변환 로직을 직접 검증하는 단위 테스트는 없다.
상위 소비자 테스트(`tests/recap.test.ts`)는 `getSessionDiff` 를 모킹해 호출부만 검증한다.

```ts
// tests/recap.test.ts
vi.mock('../src/lib/git.js', () => ({
  getSessionDiff: (...a: unknown[]) => mockGetSessionDiff(...a),
  getRecentCommits: (...a: unknown[]) => mockGetRecentCommits(...a),
}))
```

수동 검증 절차:

```bash
# boundary 가 잡히는지 먼저 확인 (비어 있으면 EMPTY_TREE_SHA 로 폴백됨)
git rev-list -1 --before=2026-05-01 HEAD
# 그 범위의 실제 통계가 0 이 아닌 값으로 나오는지 확인
git diff --stat <boundary>..HEAD
```
