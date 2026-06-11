# docs/rfc/ — Request for Comments (설계 문서)

구현 전에 설계를 글로 검증하는 곳. 동기·아키텍처·범위(IN/OUT)·위험을 먼저 적고
코드는 그 다음이다. ADR이 "결정의 기록"이라면 RFC는 "설계의 전개"다.

- **네이밍**: `NNNN-슬러그.md` (4자리 zero-pad, 예: `0051-doc-capture-wiring.md`)
- **언제 쓰나**: 여러 파일/단계에 걸친 기능 설계 · measure-first 실험 설계 · PR 분할 계획.
- **유지 정책**: 상태(제안/Accepted/구현됨)를 머리에 표기. 구현 후에도 삭제하지 않는다 —
  "왜 이 모양인가"의 원본 근거.
