---
id: TS-007
date: 2026-08-28
category: verification
---

# TS-007 — receipt 작업 기준선과 검증 SHA를 섞으면 정상 커밋이 stale이 된다

## 증상

작업 시작 커밋 A에서 기준선을 기록하고 구현을 커밋 B로 마친 뒤, B에서 전체 검증을 통과했다.
작업 트리가 깨끗한데도 `vhk receipt`는 A와 B가 다르다는 이유로 `stale=true`와 BLOCK을 냈다.

## 원인

하나의 `baseSha`가 서로 다른 두 질문에 쓰였다.

- 변경·의도 대조: 작업 시작 A부터 어떤 파일이 바뀌었는가
- 검증 신선도: verify가 검사한 코드와 현재 HEAD가 같은가

첫 질문에는 A가 맞지만, 두 번째 질문은 receipt가 자체 verify를 시작할 때 캡처한 커밋 B와 게이트 종료 후 HEAD B를 비교해야 한다.
작업이 커밋되면 A와 B가 다른 것이 정상이므로 이를 stale로 취급하면 완료 영수증이 구조적으로 막힌다.

## 해결

- 작업 시작 SHA와 `--since`는 intent의 커밋된 변경 범위에만 사용한다.
- stale은 receipt가 자체 verify를 시작할 때의 SHA·dirty와 게이트 종료 후 HEAD·dirty를 비교한다.
- 작업 기준선이 없으면 mission 검사는 미커밋 변경만 볼 수 있으므로 caution으로 정직하게 표시한다.
- 기존 receipt JSON 필드와 CLI 인자는 유지한다.

## 회귀 검증

- 시작 A → 구현·커밋 B → B 검증: `base=A`, `head=B`, `stale=false`
- B 검증 뒤 HEAD C로 이동: `stale=true`
- A 이후 커밋된 forbidden 변경: stale 오판 없이 intent가 계속 BLOCK

## 관련 변경

- `src/commands/receipt.ts`
- `src/lib/receipt.ts`
- `tests/receipt.test.ts`
- #605
