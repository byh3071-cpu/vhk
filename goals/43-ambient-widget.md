---
vhk_format: 1
type: goal
id: 43
title: vhk 앰비언트 위젯 — 터미널 배너로 standup 앵커 확장 (a안) — P2
status: TODO
priority: P2
created: 2026-06-07
depends_on: goal-32-standup
---

# Goal 43: vhk 앰비언트 위젯 (터미널 배너)

> 출처: Notion "C3 · 앰비언트 위젯 상세 설계". 전제: Goal 32 standup 의 `--if-stale` 앵커.
> 터미널을 열 때마다 "마지막 활동·오늘 할 일"이 자연스럽게 눈에 들어오게 한다. 새 런타임/상주 프로세스 0으로, standup 앵커를 배너 형태로 확장하는 것이 핵심.

## 배경 (왜)
- 1인 개발은 컨텍스트가 쉽게 휘발된다 — "어제 어디까지 했지"를 매번 머리로 복원하는 비용이 크다.
- standup(Goal 32)은 이미 `--if-stale`(`~/.vhk/last-standup.json`)로 "오래되면 한 번 보여주기" 앵커를 갖고 있다. 이걸 **셸 진입 시 배너**로 확장하면, 명시적으로 명령을 치지 않아도 상태가 앰비언트하게 떠오른다.

## 철학
- ① **a안 채택(터미널 배너)** — 셸 rc 훅에서 `vhk standup --if-stale --banner` 호출. 신규 런타임·상주 프로세스 0, 기존 daily/anchor 모듈 재사용.
- ② **b안(Tauri 데스크톱 위젯) 보류** — 신규 런타임·빌드 파이프라인·상주 프로세스 비용이 1인 운영엔 과함. v0 제외.
- ③ **비침습적** — stale 하지 않으면 아무것도 출력하지 않는다(셸 시작 지연·소음 0). 하루 1회·조용히.
- ④ **오프라인·결정적** — LLM 호출 0, 네트워크 0. 로컬 git/Dev Log/앵커 파일만 읽는다.
- ⑤ **옵트인** — `vhk standup --install-anchor` 로 사용자가 명시적으로 rc 훅을 설치할 때만 동작.

## 동작 (셸 진입 배너)
- `vhk standup --banner` 플래그 추가: standup 출력을 한 줄~몇 줄짜리 압축 배너 포맷으로 렌더(전체 리포트 대신 헤드라인).
- `--if-stale` 와 조합 시: `~/.vhk/last-standup.json` 의 마지막 표시 시각이 오늘이 아니면 1회 출력, 아니면 무출력(exit 0).
- `--install-anchor` 확장: 셸(zsh/bash/PowerShell) rc 파일에 `vhk standup --if-stale --banner` 훅 라인을 멱등 설치/제거(`--uninstall-anchor`). 마커 주석으로 중복 삽입 방지.
- 배너 내용 = 마지막 활동일(="어제" 기준, 마지막 Dev Log/커밋 날짜) + 오늘 미완료 P0/P1 goal 수 + 한 줄 격려. daily 모듈 재사용.

## Completion Check
- [ ] `vhk standup --banner` 가 압축 배너 포맷으로 출력(전체 리포트와 구분)
- [ ] `--if-stale --banner` 가 stale 아닐 때 무출력·exit 0(셸 진입 소음 0)
- [ ] `--install-anchor` / `--uninstall-anchor` 가 zsh/bash/PowerShell rc 에 멱등 삽입·제거(마커 기반)
- [ ] 신규 런타임·상주 프로세스·네트워크 호출 0(daily/anchor 모듈 재사용)
- [ ] stale 판정·배너 렌더·rc 멱등성 vitest mock
- [ ] vhk goal sync → check-goal-43.mjs → vhk goal check --id 43 통과
- [ ] 공통 게이트 통과 (typecheck + test + build), 기존 회귀 0

## 제외 범위 (v0)
- b안 Tauri 데스크톱 위젯(신규 런타임·상주 프로세스·빌드 파이프라인) — 보류
- 실시간/주기적 백그라운드 갱신(데몬) — 셸 진입 트리거만
- 텔레그램·데스크톱 알림 연동(Phase 3)

## Mandatory Reading
- goals/32-standup.md (daily 모듈 + anchor `--if-stale` 계약 — 먼저 구현 후 배너로 확장)
- src/anchor.ts (`~/.vhk/last-standup.json`, `--install-anchor` 멱등 설치)
- src/daily/devlog.ts (마지막 활동일·오늘 범위 집계)
