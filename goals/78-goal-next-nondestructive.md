---
vhk_format: 1
type: goal
id: 78
title: goal next 비파괴화 + vhk goal peek — 조회/변경 분리 — P0
status: IN_PROGRESS
priority: P0
created: 2026-06-20
leads_to: 읽기 안전성 — 조회 의도가 상태파일을 파괴하지 않음
---

# Goal 78: `goal next` 비파괴화 + `vhk goal peek`

> 출처: RFC 0053 §4(D1). 도그푸딩 감사 `docs/log/2026-06-20-dogfood-audit.md` [D1].

## 근거 (실측)
- "다음 goal 뭐지?" 조회 의도로 `vhk goal next` 1회 실행 → `docs/state/next-task.md`가 **30줄 삭제·8줄 추가**로 스텁이 됨(`git diff --stat`). 수동 작성 내용(measure-first·백로그·주의) 전부 소실, `git restore`로 복구.
- 경고문이 파일 안에 박혀 있다("⚠️ goal next/work가 이 파일을 스텁으로 전체 덮어쓸 수 있음") = 위험을 알면서 코드로 방치. **조회처럼 보이는 명령이 파괴적 쓰기를 한다.**

## 동작
- `goal next`가 next-task.md를 덮어쓰기 **전** `.vhk/backups/next-task-<timestamp>.md`로 자동 백업.
- next-task.md에 **미커밋 수동 변경**이 있으면(working tree dirty) 덮어쓰기 전 경고(비대화 모드면 백업만 + 경고, 대화 모드면 확인).
- **`vhk goal peek` 신설** — 다음 goal을 출력만(쓰기 0). 순수 조회 통로 제공.

## 수용 기준
- 조회 의도(`goal peek`)로는 어떤 파일도 변경되지 않는다. `goal next`로 덮어써도 직전 상태가 백업으로 복구 가능.

## Completion Check (작은 단위)
- [x] `goal next`: next-task.md 덮어쓰기 전 `.vhk/backups/`에 백업(`saveBackup` 재사용, 보존 20개·`pruneBackups`)
- [x] `goal next`: 수동 편집 휴리스틱(auto-update 마커 부재) 감지 시 경고
- [x] `vhk goal peek` 신설 — 쓰기 0(파일 무변경 단언 통과), 다음 goal만 출력
- [x] 등록: index.ts(`.command('peek')`+`미리보기`) + command-registry(goal 서브커맨드 `peek`) + ko.ts(`peekTitle`) — 서브커맨드라 cli-args top-level 토큰 불요, nlp-run 은 registry 기반 자동
- [x] 한국어 별칭(`vhk 목표 미리보기`) — 영문·한글 둘 다 동작 확인(CLI 실행)
- [x] 회귀 테스트 `tests/goal-peek.test.ts`(peek 무변경 + next 백업 5건) — `goalNext/goalPeek` 에 cwd 인자 도입해 chdir 없이 격리(chdir 은 fork worker 충돌)
- [x] COMMANDS.md·README 사용법 갱신
- [x] check-goal-78.mjs (goalPeek export + saveBackup + 등록 가드)
- [ ] 공통 게이트(_meta): typecheck ✓ · build ✓ · **test 는 로컬 vitest 환경 불안정(D2/goal 79)으로 CI 검증 대기** — 동작은 tsx 직접검증 5/5 통과(peek 불변·next 백업보존·스텁덮어씀·신규생성·백업없음)

> 상태 IN_PROGRESS 유지 사유: 구현·문서·고유게이트 완료. test 게이트는 로컬 환경(goal 79 대상)으로 미실행 — 헌법 "게이트 실패 시 done 금지" 준수, CI green 확인 후 DONE 전이.

## Forbidden Actions (OUT)
- 기존 `goal next` 시그니처 breaking change 0 (백업은 추가 동작 — GA 정책)
- `goal done`/`goal check`/`work` 등 다른 goal 서브커맨드 동작 변경 0
- MCP 모드에서 inquirer 확인 프롬프트 호출 0 (TTY 없음)

## Mandatory Reading
- src/commands/goal.ts · src/commands/work.ts(동일 덮어쓰기 경로 확인)
- src/lib/ (원자적 write 헬퍼, Goal 37/38) · docs/state/next-task.md(스텁 생성 로직)
