---
vhk_format: 1
type: goal
id: 1
title: vhk goal 명령어 — goals/ 체계를 CLI 로 노출
status: NOT_STARTED
priority: P0
version: v1.2
---

# Mission: Ship `vhk goal` — the dogfooded goals/ workflow as a first-class CLI

## Your Identity

You are a CLI ergonomics engineer. You prefer parsing well-formed YAML
frontmatter to inventing new file formats. You add subcommands one at a time,
each with a test, and you keep `printNextStep()` consistent across the family.
You favor file-based source-of-truth (`goals/*.md`) over hidden state.

## The Goal

`goals/` 패턴을 VHK 사용자에게도 제공한다. Goal 0 의 dogfooding 결과를
v1.2 의 사용자용 명령어로 졸업시킨다. 구체적으로:

1. `vhk goal init` — 현재 프로젝트에 `goals/` + `docs/state/` + `scripts/`
   스캐폴딩 생성 (vhk 자체 레포 구조 기반 템플릿).
2. `vhk goal list` — `goals/*.md` 의 YAML frontmatter 파싱 후 표 출력
   (id, title, status, priority).
3. `vhk goal next` — `status: NOT_STARTED` 중 id 최소값을 active 로 선택,
   `docs/state/next-task.md` 갱신.
4. `vhk goal check [--id N]` — id 미지정 시 active goal, 지정 시 해당 goal 의
   `scripts/check-goal-N.sh` 실행. exit code 그대로 전달.
5. `vhk goal done [--id N]` — 게이트 재검증 후 frontmatter `status` 를
   `DONE` 으로 갱신. 검증 실패 시 변경하지 않음.
6. 한국어 별칭 + `src/i18n/ko.ts` 메시지 + 자연어 라우터 키워드 추가
   (예: "다음 목표", "목표 점검", "목표 완료").
7. `_meta` 모든 게이트 통과.

## Mandatory Reading Order

1. `CLAUDE.md` + `AGENTS.md`
2. `goals/_meta.md`
3. `goals/0-mcp-full-coverage.md` — frontmatter / 섹션 포맷 참조
4. `src/commands/init.ts` — 스캐폴딩 패턴 참조 (`goal init` 베이스)
5. `src/commands/memory.ts` — 서브커맨드 + 파일 SoT 패턴 참조 (`add/list/remove`)
6. `src/i18n/ko.ts` — 메시지 키 규약
7. `src/nlp-router.ts` — 자연어 키워드 등록 방식

## YAML Frontmatter 표준

```yaml
---
vhk_format: 1
type: goal
id: <number>
title: <string>
status: NOT_STARTED | IN_PROGRESS | DONE | BLOCKED
priority: P0 | P1 | P2
version: <semver>
---
```

파서는 `gray-matter` 미사용을 권장 (의존성 추가 회피). 정규식 + 직접 파싱.

## Completion Check

`bash scripts/check-goal-1.sh` 가 exit 0 을 반환한다. 구체적으로:

- [ ] 5 개 서브커맨드 (`init/list/next/check/done`) 모두 구현 + 단위 테스트
- [ ] `vhk goal list` 가 본 레포의 `goals/` 를 파싱해서 4 개 항목 출력
- [ ] `vhk goal next` 가 `docs/state/next-task.md` 를 멱등하게 갱신
- [ ] `vhk goal check` 가 `scripts/check-goal-N.sh` 의 exit code 를 그대로 전달
- [ ] `vhk goal done` 이 게이트 실패 시 frontmatter 를 변경하지 않음
- [ ] `COMMANDS.md` + `README.md` 명령어 표 업데이트
- [ ] `_meta` 게이트 통과

## Forbidden Actions

- 새 의존성 추가 (`gray-matter` 등 frontmatter 파서) — 정규식 기반 파싱 사용
- frontmatter 키 이름 변경 (vspec/vooster 호환성 유지)
- 게이트 실패에도 `done` 으로 마킹 (실패 = 보존)
- 본 goal 범위 안에서 Goal 2 의 `blocker/learn/resume` 명령 선구현
- `execSync` 신규 사용

## When Stuck

Goal 0 의 동일 프로토콜 적용. 3 iteration 정체 → blockers.md → 다음 태스크.

## Dependencies

- Goal 0 완료 (MCP 풀 커버리지) 이후 진입 권장. 단, 병렬 진행 가능.
