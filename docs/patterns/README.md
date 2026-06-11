# docs/patterns/ — 범용 패턴 사전

이 프로젝트를 넘어 재사용 가능한 패턴만 모은다. 기준 3가지를 모두 만족할 때:
①다른 프로젝트에서도 발생 가능 ②반복 가능 ③해결책 명확.

- **네이밍**: 신규 = `PAT-NNN-영문명.md` (3자리 zero-pad, 카테고리는 frontmatter `카테고리`).
  기존 `{카테고리}-{이름}.md` 14건은 개명 금지(append-only) — 신규부터 새 형식.
- **frontmatter**: id(PAT-NNN)/패턴명/카테고리/증상/원인/해결/적용조건/출처프로젝트/태그/발견일/출처DevLog.
  카테고리 코드: css | env | browser-api | build | auth | ux | test | state | mcp | git
- **유지 정책**: 중복 생성 금지(생성 전 이 폴더 확인). Notion 패턴 사전 DB 직접 주입 금지 —
  파일만 생성, DB 등록은 별도 주체.
