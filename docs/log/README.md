# docs/log/ — 세션 dev log (append-only)

세션이 무엇을 했는지의 시계열 원장. 헌법이 append-only로 보호한다 — **추가만, 수정·삭제 금지**.

- **네이밍**: `YYYY-MM-DD-작업명.md` (같은 날 여러 작업 = 여러 파일 OK)
- **언제 쓰나**: 모든 실질 코드변경 작업. `scripts/check-records.mjs`가 커밋 시점에
  오늘자 dev log 스테이지를 강제한다(사소 커밋은 `[skip-record]`).
- **내용**: 한 일 / 결정(→ ADR 승격 후보) / 막힌 것 / 교훈(→ `vhk learn` 졸업).
- **유지 정책**: 영구 보존. 과거 항목 수정 금지 — 정정도 새 항목으로.
