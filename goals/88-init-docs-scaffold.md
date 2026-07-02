---
vhk_format: 1
type: goal
id: 88
title: vhk init/start — docs 스캐폴딩 완성 (rfc·patterns README + goal init 발견성) — P2
status: NOT_STARTED
priority: P2
created: 2026-07-03
leads_to: 새 프로젝트가 노션 바이브코딩 스타터킷 docs 구조(rfc/patterns)를 갖고 시작 + goal 단계 체계를 발견 가능하게 — 매번 사용자가 "이 문서 필요하지 않아?"라고 직접 짚어주는 비용 제거
---

# Goal 88: docs 스캐폴딩 완성

> 출처: 대화(2026-07-03) — 사용자가 사주운세 디스코드봇·축구 레포 독푸딩 중 "노션 바이브코딩 스타터킷에 있는 docs 구조가 새 프로젝트엔 안 만들어진다"고 보고. [goal 89](89-customization-hook.md)와 같은 세션에서 나온 짝 — 88은 순수 기계적(코드로 100% 강제 가능한) 부분만, 89는 판단이 필요한 부분(도메인 커스터마이징 인터뷰).

## 근거 (실측 — 코드 확정 2026-07-03)

- `src/commands/init.ts` `generateFiles()`(329-366행)가 반환하는 파일 목록에 `docs/rfc/`·`docs/patterns/` 생성 0건 (`grep "docs/rfc"`, `grep "docs/patterns"` 대상 src/ 전체 — 0 매치).
- `docs/adr/`(템플릿 스텁)·`docs/troubleshooting/`(빈 폴더)만 `vhk init`이 생성. `docs/state/`(next-task.md·blockers.md)와 `goals/`(_meta.md + 번호 goal)는 별도 커맨드 `vhk goal init`(`src/commands/goal.ts` `goalInit()`, 261-292행)에만 있음.
- `vhk start`(`src/commands/start.ts`)는 `git init → init() → sync() → mcpInit() → context()` 5단계 오케스트레이터인데 `goalInit()`을 호출하지 않음(`grep goalInit src/` — 정의부·index.ts 등록부 외 참조 0건). 즉 `vhk goal init`의 존재 자체가 `start` 마법사 흐름에서 완전히 발견 불가능.
- vhk 자기 자신의 `docs/`(governance-v2, `docs/log/2026-06-10-governance.md`)는 카테고리별 README 인덱스를 갖춘 훨씬 풍부한 구조지만, 이 구조를 새 프로젝트로 포팅하는 코드는 없음.

## 동작

- `generateFiles()`에 `docs/rfc/README.md`·`docs/patterns/README.md` 두 항목 추가 — 제네릭 버전(vhk 자기 자신의 카테고리 코드·Notion DB 연동 경고 같은 vhk-repo 전용 내용은 뺀다).
- `vhk start`의 마지막 안내 출력(`printNextStep` 주변)에 `vhk goal init`을 "이런 것도 있다"고 한 줄 노출.
- **자동 실행은 안 함** — `start()`가 `goalInit()`을 직접 호출하지 않는다. 작은 사이드 프로젝트에 goal 단계 체계를 강제로 얹으면 YAGNI 위반(빈 `goals/_meta.md`+게이트 스크립트가 안 쓰이는 프로젝트에도 깔림). 발견 가능하게만 만드는 게 이 goal의 경계.

## 설계 (구현 단계 — PR 분해)

1. **PR1:** `src/templates/docs-readme.ts` 신규(`RFC_README_TEMPLATE()`·`PATTERNS_README_TEMPLATE()`, `ADR_TEMPLATE()`처럼 인자 없는 순수 함수) + `generateFiles()` 배선 + `tests/init.test.ts`의 `EXPECTED_FILES` 배열에 두 경로 추가.
2. **PR2:** `start.ts` 마지막 출력 블록에 `vhk goal init` 힌트 한 줄 + `src/i18n/ko.ts`에 새 문구 키 추가 + `tests/start.test.ts`에 출력 검증 테스트(무거운 하위 단계는 `vi.mock`으로 no-op 처리, `init()`은 실제 실행 — `tests/init-yes.test.ts` 패턴 참고).

## Completion Check

- [ ] `docs/rfc/README.md`·`docs/patterns/README.md`가 `generateFiles()` 산출물에 포함
- [ ] `tests/init.test.ts` `EXPECTED_FILES` 확장, green
- [ ] `vhk start` 실행 후 콘솔 출력에 `vhk goal init` 문구 포함(테스트로 확인)
- [ ] `start()`의 5단계 흐름에 `goal init` 자동 호출이 추가되지 **않았음**을 확인(의도적 — 회귀 방지용 별도 검증 항목)
- [ ] 공통 게이트(_meta) + `check-goal-88.mjs`(status `NOT_STARTED` 단계라 스텁 허용 — `goals/_meta.md` M.6 규칙)

## Forbidden Actions (OUT)

- `start()`에 `goal init` 자동 호출 추가 금지 — YAGNI, 사이드 프로젝트에 goal 체계 강제 금지.
- vhk 자기 자신 전용 카테고리 코드·Notion DB 연동 경고를 새 템플릿에 그대로 복사 금지(반드시 제네릭화).
- `goalInit()` 자체 로직 변경 금지 — 이 goal은 발견성만 다룬다.

## Mandatory Reading

`src/commands/init.ts`(`generateFiles`·`writeInitExtras`) · `src/commands/start.ts` · `src/commands/goal.ts`(`goalInit`) · `tests/init.test.ts` · `docs/log/2026-06-10-governance.md`(governance-v2, 카테고리 README 패턴 원본)
