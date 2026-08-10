---
name: overnight-vhk-auto
description: Use when one VHK goal should run unattended overnight and stop after opening a pull request without merging.
---

# Overnight vhk-auto conductor

호출 1회 = 작업 단위 카드 **1장**. `overnight-autoloop` 과는 별개 트랙이다(섞지 마라).

> 이 파일이 SoT다. 글로벌(`~/.claude/skills/overnight-vhk-auto/`)에 사본이 있으면
> 그쪽이 복제본이며, 어긋나면 **이 파일이 이긴다.**
> 안쪽 구현 루프의 SoT 는 `.claude/skills/vhk-auto/SKILL.md`.

## 저장소 래퍼

구현 커밋 뒤에는 저장소에 추적되는 `scripts/auto_pr_goal.ps1`만 사용한다. 호출 규약은 다음과 같다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/auto_pr_goal.ps1 `
  -RepositoryRoot <repo-root> -BaseBranch main -Title <title> -BodyFile <body-file>
```

`AGENTS.md` 형식과 아침 확인 3문항을 담은 임시 PR 본문 파일을 만들되 커밋하지 않는다.

## 불변조건

- **INV-A** 구현 루프는 `.claude/skills/vhk-auto/SKILL.md` 의 INV-1..INV-9 를 따른다.
  commit 은 그 루프 안에서만. (vhk-auto INV-7)
- **INV-B** verify green + commit 이후에만 `scripts/auto_pr_goal.ps1`을 호출해 push + PR 할 수 있다.
  **머지 = 0.** 래퍼는 *깨끗한 작업트리 + 미푸시 커밋* 상태를 지원한다(vhk-auto 가 이미 커밋한
  뒤의 push-only 경로) — dirty porcelain 을 기대하지 마라.
- **INV-C** autonomy-log 의 시작 또는 종결 이벤트가 없으면 `.vhk/HARD_STOP` 을 쓰고 멈춘다.
- **INV-D** 사람에게 A/B/C 를 묻지 않는다 — `docs/roadmap/autonomy-evolution.md` 의 기본값을 쓴다.
- **INV-E** 중단 조건: HARD_STOP · verify 2회 연속 red · PR 을 열어 보고 완료.

## 루프

0. `.vhk/HARD_STOP` 이 있으면 사유를 보고하고 즉시 종료.
1. **다음 카드 선택** — `vhk goal next` 가 고르는 active 카드를 그대로 쓴다.
   무엇을 먼저 할지의 근거는 **로드맵 원본**이다: `docs/roadmap/2.x-roadmap.md` §5(티켓 전량) ·
   §8(이번 계열에서 안 하는 것). 카드 번호를 이 파일에 하드코딩하지 마라 — 계열이 바뀌면 낡는다.
   고른 카드의 frontmatter 를 `IN_PROGRESS` 로 바꾼다.
2. 그 카드에 대해 **vhk-auto** 루프를 돈다(autonomy-log 포함 — vhk-auto INV-9).
3. 성공 시(커밋 완료, 깨끗한 작업트리) 저장소 루트·기준 브랜치 `main`·PR 제목·임시 본문 파일을 인자로
   `scripts/auto_pr_goal.ps1`을 호출한다. PR 본문에는 아침 확인 3문항을 넣는다.
4. (선택) 아침 보고 생성 — `node scripts/gen-autonomy-morning-report.mjs --date YYYY-MM-DD`.
5. PR URL(또는 HARD_STOP 사유)을 보고한다. **머지하지 않는다.**

## 관련 문서

- RFC: `docs/rfc/0063-overnight-vhk-auto.md`
- 안쪽 루프 SoT: `.claude/skills/vhk-auto/SKILL.md`
- 작업 항목 원본: `docs/roadmap/2.x-roadmap.md` · 수용 기준 `docs/PRD-2.x.md`
- 운영 런북은 **로컬 전용(비추적)** 이다. 없으면 없는 대로 진행하고, 링크를 이 파일에 다시
  적지 마라 — 저장소에서 죽은 링크가 된다.
