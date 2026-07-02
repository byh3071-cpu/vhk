---
vhk_format: 1
type: goal
id: 90
title: sync 전파 정합성 — RULES.md 신규 섹션이 .cursorrules/CLAUDE.md까지 실제 도달하는가 — P1
status: NOT_STARTED
priority: P1
created: 2026-07-03
leads_to: goal 89(커스터마이징 트리거)가 쓰는 인터뷰 답변이 실제로 도구별 산출물(.cursorrules·CLAUDE.md)까지 도달함을 코드로 보장 — 원래 버그("안 짚으면 스킵")의 사촌(조용히 반쪽 전파)을 차단
---

# Goal 90: RULES.md → .cursorrules/CLAUDE.md 전파 정합성

> 출처: [goal 89](89-customization-hook.md) 설계 중 "인터뷰 답변을 RULES.md에 쓰면 `vhk sync`가 알아서 `.cursorrules`/CLAUDE.md로 전파한다, sync.ts는 안 건드려도 된다"는 가정을 세웠는데, 같은 날 외부 세션 교차검증이 이 가정을 코드로 반박했다. 이 세션에서 직접 재확인(2026-07-03) — 반박이 맞다.

## 근거 (실측 — 코드 확정 2026-07-03, 직접 재검증 완료)

`src/commands/sync.ts`의 라우팅은 섹션 제목의 **substring 매칭**이다:

```
sync.ts:19  const CURSORRULES_KEYS = ['코딩 규칙', '기술 스택', '아키텍처', '디자인', 'Anti-patterns', '커밋']
sync.ts:23  const CLAUDE_MD_KEYS = ['기록', '로그', 'ADR', '트러블슈팅', 'TIL', '/done', '체크리스트', 'VHK 운영']
sync.ts:79  const codingSections = sections.filter(s => CURSORRULES_KEYS.some(k => s.title.includes(k)))   // buildCodingDoc — .cursorrules 등
sync.ts:316 const codingSections = sections.filter(s => CURSORRULES_KEYS.some(k => s.title.includes(k)))   // toClaudeMd — CLAUDE.md
```

`## 도메인 규칙`이나 `## 절대 금지 행동` 같은 — goal 89의 인터뷰 훅이 자연스럽게 쓸 법한 — 섹션 제목은 위 두 키 목록 어디에도 substring으로 안 걸린다. 즉 `.cursorrules`·CLAUDE.md(정작 Cursor/Claude가 읽는 파일)엔 그 내용이 **빠지고**, RULES.md 원본과 (AGENTS.md 등 다른 SYNC_TARGETS 경유 시) 일부 산출물에만 남는다.

완전 침묵은 아니다 — `findUnmappedSections()`(`sync.ts:35-41`)가 매칭 안 되는 섹션 제목을 모아 `sync()` 실행 중 경고로 노출한다(`sync.ts:593` 호출부). 하지만 경고는 콘솔에 스쳐 지나가는 텍스트일 뿐 — 이 경고를 놓치면 원래 버그("사람이 안 짚으면 스킵됨")의 사촌이 그대로 재현된다: 인터뷰는 코드로 강제됐는데 그 산출물이 조용히 반쪽만 전파.

## 동작 (설계 — 구현 전 결정 필요)

인터뷰 답변을 어느 섹션 제목으로 쓸지, 아래 둘 중 하나를 **명시적으로 결정**해야 한다(이 goal의 첫 작업):

- **(a) 기존 키에 매칭되는 제목 재사용.** 예: `## 코딩 규칙 — 도메인 제약` 처럼 기존 키(`코딩 규칙`)를 포함한 제목을 쓰면 `.cursorrules`/CLAUDE.md 양쪽에 자동 도달. 단 "사주 계산은 반드시 음력 변환을 거친다" 같은 도메인 규칙을 "코딩 규칙" 밑에 넣는 게 의미상 맞는지, 프로젝트마다 자연스러운 제목이 다를 수 있다는 점을 판단해야 한다.
- **(b) `CURSORRULES_KEYS`/`CLAUDE_MD_KEYS`에 새 키(예: `'도메인'`) 추가.** 의미적으로 더 깨끗하지만 `sync.ts` 코드를 직접 건드리게 된다 — goal 89가 전제했던 "sync.ts 손 안 댐"이 깨지므로, 채택 시 goal 89 문서의 해당 문구를 정정해야 한다.

어느 쪽을 택하든 **블랙박스 회귀 테스트가 필수**: RULES.md에 인터뷰형 섹션을 넣고 `sync()`를 돌린 뒤 → `.cursorrules`와 CLAUDE.md의 실제 렌더 결과에 그 내용이 포함되는지 단언. "AGENTS.md에만 있음"이면 테스트 실패로 처리한다(이게 바로 이 goal이 막으려는 회귀).

## Completion Check

- [ ] (a)/(b) 중 하나를 결정하고 이 문서에 결정 근거 기록
- [ ] (b) 채택 시: `sync.ts`의 `CURSORRULES_KEYS`/`CLAUDE_MD_KEYS`(또는 둘 다) 확장 + 기존 `findUnmappedSections`/`buildCodingDoc`/`toClaudeMd` 테스트 회귀 없음 확인
- [ ] **블랙박스 전파 테스트**: RULES.md에 인터뷰형 섹션(가상 도메인 규칙 포함) 삽입 → `sync()` 실행 → `.cursorrules` 렌더 결과에 그 내용 포함 단언 + CLAUDE.md 렌더 결과(마커블록 안)에도 포함 단언
- [ ] `findUnmappedSections()` 경고가 실제로 뜨는 케이스(고의로 안 걸리는 제목)도 별도 테스트로 확인 — 이 goal이 그 경고에 의존하지 않고 애초에 안 걸리는 상황 자체를 막았는지 검증
- [ ] 공통 게이트(_meta) + `check-goal-90.mjs`(status `NOT_STARTED` 단계라 스텁 허용)

## Forbidden Actions (OUT)

- goal 89의 마커·SessionStart 훅·`.claude/settings.json` 배선 재구현 금지 — 이 goal은 라우팅/전파 정합성만 다룬다.
- goal 91(core-rules 폴백 가시화) 범위 침범 금지 — 별개 코드 경로(`core-rules.ts`).
- (a)/(b) 결정 없이 구현 착수 금지 — 결정이 이 goal의 첫 산출물이다.
- `CURSORRULES_KEYS`/`CLAUDE_MD_KEYS` 확장 시(옵션 b) 기존 키 삭제·이름변경 금지 — 추가만(GA 안정성, 기존 산출물 회귀 방지).

## Mandatory Reading

`src/commands/sync.ts`(전체, 특히 `CURSORRULES_KEYS`/`CLAUDE_MD_KEYS`/`parseRulesMd`/`buildCodingDoc`/`toClaudeMd`/`findUnmappedSections`/`SYNC_TARGETS`) · `tests/sync.test.ts`(기존 라우팅 테스트 패턴) · [goal 89](89-customization-hook.md)
