---
name: auto-merge
description: Use when an explicitly authorized VHK maintenance session must evaluate open pull requests carrying the auto-merge label.
---

# auto-merge — 제한된 자동 머지

> 가동: 전용 Codex 세션에서 `$auto-merge`를 명시적으로 호출한다. 호출 1회는 열린 PR을 한 번만 훑고 종료한다.
> 헌법 관계: **머지까지만** 자동. npm publish는 사람 2FA(가드 #119), main 직접 push 금지 그대로.

## 0. 하드 스톱 (매 주기 첫 단계, 예외 없음)

- 저장소 루트에서 `.vhk/HARD_STOP` 존재 여부를 읽기 전용으로 확인한다.
- 존재 → 즉시 전체 중단, 사유 보고. 우회·삭제 금지.
- 원래 checkout은 상태 확인 외에 이동하거나 수정하지 않는다. G4에서만 정확한 PR head를 detached 임시 worktree로 분리한다.

## 1. 대상 수집

```sh
gh pr list --state open --label auto-merge --json number,title,headRefName,additions,deletions
gh repo view --json nameWithOwner
```

- **`auto-merge` 라벨 없는 PR은 절대 건드리지 않는다** (조회도 라벨 필터로만).
- 0건이면 "대상 없음" 한 줄 보고 후 주기 종료.

## 2. PR별 게이트 (순서대로, 하나라도 탈락 시 스킵)

| 게이트 | 판정 | 탈락 시 |
|---|---|---|
| G1. CI | `gh pr checks <n>` 전부 pass. pending 있으면 "대기" — 실패 아님, 다음 주기 재검 | 스킵 |
| G2. diff 상한 | additions+deletions ≤ 500줄. 초과 = 사람 검토 필요 | 스킵 + 보고에 "사람 호출" 표기 |
| G3. CodeRabbit 해소 | 아래 GraphQL로 미해결 리뷰 스레드 0개 확인 | 스킵 |
| G4. 적대적 최종 리뷰 | 아래 §3 | 스킵 + 사유 보고 |

G3 쿼리 — `nameWithOwner`를 owner/name으로 나누고 GraphQL 변수로 전달한다. 저장소 좌표를 파일에 하드코딩하지 않는다. 현재 셸의 따옴표 규칙만 사용하고 서로 다른 셸 문법을 섞지 않는다.

```sh
query($owner:String!, $name:String!, $number:Int!, $endCursor:String) {
  repository(owner:$owner, name:$name) {
    pullRequest(number:$number) {
      reviewThreads(first:100, after:$endCursor) {
        nodes { isResolved }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}
```

`hasNextPage`가 false가 될 때까지 `endCursor`를 다음 요청에 넘긴다. 어느 페이지든 `isResolved: false`가 하나라도 있으면 탈락한다. 조회 실패나 페이지 누락은 통과가 아니라 스킵이다.

## 3. 적대적 최종 리뷰 (G4)

원래 checkout에서 base와 PR head를 갱신한 뒤, PR head를 detached 임시 worktree로 분리해 독립 리뷰를 실행한다. `<temporary-path>`는 이번 실행만을 위한 새 경로여야 한다.

```sh
git fetch origin main "pull/<n>/head:refs/vhk-auto-merge/pr-<n>"
git worktree add --detach <temporary-path> refs/vhk-auto-merge/pr-<n>
cd <temporary-path>
```

Windows PowerShell에서는 실행 정책에 걸리는 `codex.ps1` 대신 `codex.cmd review --base origin/main "머지하면 안 되는 이유를 우선 찾아 Critical, Important, Minor로 분류"`를 사용한다. POSIX에서는 `codex review`에 같은 인자를 전달한다.

- Critical 또는 Important가 하나라도 있으면 머지하지 않는다.
- 리뷰 실행 실패·인증 실패·결과 불명확도 통과가 아니라 스킵이다.
- 리뷰가 끝나면 원래 checkout에서 `git worktree remove <temporary-path>`와 `git update-ref -d refs/vhk-auto-merge/pr-<n>` 순서로 정리한다.
- 임시 worktree 정리가 실패하면 머지하지 않고 경로를 보고한다. 사용자의 원래 checkout은 이동하거나 수정하지 않는다.

## 4. 머지

- 주기당 **최대 3개** (초과분은 다음 주기 — AI 독주 방지).
- 실행: `gh pr merge <n> --squash`
- 실패(권한·보호규칙) 시 재시도 1회, 그래도 실패면 보고 후 다음 PR.

## 5. 주기 보고 (매 주기 마지막, 한 줄씩)

```text
[auto-merge] 머지: #N(제목) | 대기: #M(CI pending) | 스킵: #K(사유) | 사람호출: #J(diff 700줄)
```

## 금지 (절대)

- `vhk publish` / `npm publish` 호출
- main 직접 push, force push, 브랜치 보호 변경
- `auto-merge` 라벨 직접 부착/제거 (라벨은 사람만 붙임)
- HARD_STOP 우회, `vhk resume` 호출
- 게이트 탈락 PR에 대한 코드 수정 시도 (보고만 — 수정은 작업 세션 몫)
