# docs/adr/ — Architecture Decision Records

되돌리기 비싼 결정(패키지 도입·아키텍처·정책)을 결정 시점의 맥락과 함께 남긴다.
"왜 이렇게 했지?"에 git log 대신 이 폴더가 답한다.

- **네이밍**: `ADR-NNN-슬러그.md` (3자리 zero-pad, [ADR-000-template.md](ADR-000-template.md) 복사)
- **언제 쓰나**: 기술 스택 변경(RULES.md가 ADR 필수 명시) · 아키텍처 선택 · 운영 정책.
  작은 구현 선택은 commit 메시지로 충분 — 판단표는 [RULES.md §기록 규칙](../../RULES.md).
- **유지 정책**: append-only. 결정이 뒤집히면 기존 ADR 수정 대신 새 ADR로 supersede 표기.
- **자동 감지**: `vhk work handoff`가 미기록 ADR 후보(package.json·빌드설정 변경 등)를 보고한다(RFC 0051).
