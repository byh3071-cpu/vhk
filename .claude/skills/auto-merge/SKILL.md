---
name: auto-merge
description: auto-merge 라벨이 붙은 열린 PR을 3중 게이트(CI green + CodeRabbit 해소 + 적대적 최종 리뷰) 통과 시 무인 squash 머지. /loop 15m /auto-merge 로 전용 세션에서 상주 가동. 머지만 자동 — publish·main 직접 push는 절대 금지.
---

# auto-merge — 무인 머지 에이전트

> 가동: 전용 세션에서 `/loop 15m /auto-merge`. 노트북 종료 = 자동 정지 (의도된 kill switch).
> 헌법 관계: **머지까지만** 자동. npm publish는 사람 2FA(가드 #119), main 직접 push 금지 그대로.

## 0. 하드 스톱 (매 주기 첫 단계, 예외 없음)

- `.vhk/HARD_STOP` 존재 → 즉시 전체 중단, 사유 보고. 우회·삭제 금지.
- git 작업은 반드시 레포 루트 기준. worktree 생성 불필요 (읽기 + gh 명령만 사용, 소스 체크아웃 안 함).

## 1. 대상 수집

```
gh pr list --state open --label auto-merge --json number,title,headRefName,additions,deletions
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

G3 쿼리:
```
gh api graphql -f query='query($n:Int!){repository(owner:"byh3071-cpu",name:"vhk"){pullRequest(number:$n){reviewThreads(first:50){nodes{isResolved}}}}}' -F n=<번호>
```
`isResolved: false` 노드가 하나라도 있으면 탈락.

## 3. 적대적 최종 리뷰 (G4)

서브에이전트(Agent 도구, 일반 텍스트 출력 — **구조화 스키마 금지**, 발견사항 유실 전적 있음)에게:

> "PR #N의 diff(`gh pr diff <n>`)를 읽고 **머지하면 안 되는 이유**를 적극적으로 찾아라. 관점: ①의도-구현 불일치 ②테스트가 못 잡을 통합 결함 ③RULES.md 위반(execSync, any, 빈 catch, console.log) ④보안(시크릿 평문, 인젝션) ⑤append-only 문서 수정 여부. 치명(merge-blocking) / 경미(머지 후 후속) / 없음 으로 구분해 텍스트로 보고하라. 불확실하면 치명으로 분류하라."

- **치명 1개라도 → 머지 안 함**, 보고에 사유 인용.
- 경미만 → 머지 진행, 보고에 후속 작업으로 기록.

## 4. 머지

- 주기당 **최대 3개** (초과분은 다음 주기 — AI 독주 방지).
- 실행: `gh pr merge <n> --squash`
- 실패(권한·보호규칙) 시 재시도 1회, 그래도 실패면 보고 후 다음 PR.

## 5. 주기 보고 (매 주기 마지막, 한 줄씩)

```
[auto-merge] 머지: #N(제목) | 대기: #M(CI pending) | 스킵: #K(사유) | 사람호출: #J(diff 700줄)
```

## 금지 (절대)

- `vhk publish` / `npm publish` 호출
- main 직접 push, force push, 브랜치 보호 변경
- `auto-merge` 라벨 직접 부착/제거 (라벨은 사람만 붙임)
- HARD_STOP 우회, `vhk resume` 호출
- 게이트 탈락 PR에 대한 코드 수정 시도 (보고만 — 수정은 작업 세션 몫)
