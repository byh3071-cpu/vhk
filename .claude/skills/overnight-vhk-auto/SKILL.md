---
name: overnight-vhk-auto
description: VHK 야간 지휘 — 작업 단위 카드 1장을 골라 vhk-auto 계약대로 돌리고, push + PR 까지만 한다(머지 0). 트리거 - "밤새 vhk-auto", "overnight vhk", "자율 overnight", "큐부터 한 장".
---

# Overnight vhk-auto conductor

호출 1회 = 작업 단위 카드 **1장**. `overnight-autoloop` 과는 별개 트랙이다(섞지 마라).

> 이 파일이 SoT다. 글로벌(`~/.claude/skills/overnight-vhk-auto/`)에 사본이 있으면
> 그쪽이 복제본이며, 어긋나면 **이 파일이 이긴다.**
> 안쪽 구현 루프의 SoT 는 `.claude/skills/vhk-auto/SKILL.md`.

## 환경 (설치 시 1회)

이 스킬은 저장소 밖 스크립트 하나에 의존한다. 경로는 사람마다 다르므로 **환경변수로 주입**한다.

| 변수 | 용도 | 없으면 |
|---|---|---|
| `VHK_AUTO_PR_SCRIPT` | push + PR 래퍼(PowerShell) 절대경로 | INV-B 를 건너뛰고 commit 까지만. 사람에게 "PR 은 수동" 이라고 보고 |

절대경로를 이 파일에 적지 마라 — 공개 저장소이고 `pnpm boundary:check` 가 막는다.

## 불변조건

- **INV-A** 구현 루프는 `.claude/skills/vhk-auto/SKILL.md` 의 INV-1..INV-9 를 따른다.
  commit 은 그 루프 안에서만. (vhk-auto INV-7)
- **INV-B** verify green + commit 이후에만 `VHK_AUTO_PR_SCRIPT` 를 호출해 push + PR 할 수 있다.
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
3. 성공 시(커밋 완료, 작업트리는 깨끗할 수 있음):
   `VHK_AUTO_PR_SCRIPT` 가 설정돼 있으면 저장소 루트를 대상으로 호출해 push + PR.
   기준 브랜치는 `main`. PR 본문에 아침 확인 3문항을 넣는다.
   설정돼 있지 않으면 이 단계를 건너뛰고 "PR 은 사람이" 로 보고한다.
4. (선택) 아침 보고 생성 — `node scripts/gen-autonomy-morning-report.mjs --date YYYY-MM-DD`.
5. PR URL(또는 HARD_STOP 사유)을 보고한다. **머지하지 않는다.**

## 관련 문서

- RFC: `docs/rfc/0063-overnight-vhk-auto.md`
- 안쪽 루프 SoT: `.claude/skills/vhk-auto/SKILL.md`
- 작업 항목 원본: `docs/roadmap/2.x-roadmap.md` · 수용 기준 `docs/PRD-2.x.md`
- 운영 런북은 **로컬 전용(비추적)** 이다. 없으면 없는 대로 진행하고, 링크를 이 파일에 다시
  적지 마라 — 저장소에서 죽은 링크가 된다.
