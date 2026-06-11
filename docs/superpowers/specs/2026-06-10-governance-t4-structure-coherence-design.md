# Governance T4 — 구조 정합성 (설계)

> 출처: audit-docs-governance-2026-06-10 테마 T4. governance 브랜치 stack. docs/spec.md는 v1.0 frozen — 변경 시 버전 범프(v1.1) + 근거.

## Context
docs 외 구조 불일치: ①goal frontmatter 불균일(version 42개 누락·created/completed 혼용·version 형식 혼용) ②`.vhk/.gitignore`↔docs/spec.md context/brief 추적 정책 충돌 ③`.vhk` 평면정책 위반(spec=flat인데 eval/reports/backups 폴더 존재) ④next-task.md 자동 덮어쓰기 위험(.claude memory에 기록됨) ⑤memory successes 공란·learnings.md↔memory.json 이원기록 ⑥PRD.md 미완성 템플릿(__FILL__).

## 동작
- **goal frontmatter 스키마 + validate**: `scripts/check-goal-frontmatter.mjs`(또는 vhk goal validate) — 필수(id·title·status)·권장(priority·created·completed) 검증. version은 SemVer 정규식(있을 때만). **기존 42개 일괄 마이그레이션 금지**(risky) — 신규/수정 goal만 강제 + 누락 리포트(경고).
- **.vhk/.gitignore ↔ spec 정합**: context.md/brief.md 추적 정책 1개로 확정 → docs/spec.md 명시 + 루트/.vhk gitignore 통일. `git check-ignore` 자동 검증(vhk doctor 또는 게이트).
- **.vhk 폴더 공식화**: spec v1.0 "flat" → v1.1로 eval/reports/backups 폴더 **공식 인정**(평탄화보다 현실 반영). spec.md 버전 범프 + 근거.
- **next-task 보호**: `.claude` memory의 "goal next가 next-task 덮어씀" 위험 → next-task.md 상단에 경고(이미 있음) 강화 OR vhk goal next가 수동콘텐츠 감지 시 확인(과안정화 경계 — 우선 경고 강화만).
- **PRD.md**: 미완성이면 docs/templates/로 이동 + 마크, 또는 실내용 채움(판단: README와 중복이면 제거).
- **learnings↔memory 이원 정리**: spec.md대로 learnings.md = 동결(흡수 완료) 명시 or 명확한 역할분담 1줄.

## 경계 (OUT)
- 42개 goal 일괄 frontmatter 마이그레이션(validate+리포트만, 일괄수정은 별도 결정). memory successes CLI 신설(T1 범위 아님 — 후속). CHANGELOG 자동화(별도).

## 순서: check-goal-frontmatter.mjs+test → .gitignore/spec 정합 → spec.md v1.1(.vhk 폴더 공식화) → next-task 경고강화 → PRD 정리 → 게이트 green.
## 검증: 필수필드 뺀 가짜 goal → validate FAIL. context.md가 추적/무시 일관 확인(check-ignore). spec.md v1.1 반영.
## 체크포인트: spec.md frozen 해제는 버전범프 필수(version-sync 테스트 영향 확인). PRD 이동은 참조 끊김 grep.
