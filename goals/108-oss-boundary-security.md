---
vhk_format: 1
type: goal
id: 108
title: 오픈소스 공개 경계와 보안 기본값 정리
status: DONE
priority: P0
created: 2026-07-27
leads_to: v2.11.1 보안 패치와 v2.12.0 범용 규칙 소스 전환
completed: 2026-07-27
---

# Goal 108: 오픈소스 공개 경계와 보안 기본값 정리

## 근거

공개 저장소와 npm 번들에 개인 생태계 규칙·저장소명·절대경로가 포함되어 범용 CLI라는 제품 경계와 충돌한다. GitHub 보안 기능 비활성화와 의존성 취약점도 함께 해소한다.

## 동작

- 범용 규칙 파일 계약과 기존 요한 전용 설정의 1회 호환 경고
- 범용 bootstrap·MCP 예시·Cursor 스킬 생성물
- 공개 경계 검사, 보안 문서, 의존성 감사 보강
- 개인 운영 산출물은 승인 후 비공개 저장소로 이전하고 공개 HEAD에서 제거

## Completion Check

- [x] `VHK_RULES_FILE`·`rulesFile`·`set-rules-file` 구현과 호환 테스트
- [x] 생성물·npm tarball 공개 경계 검사
- [x] `pnpm audit` High/Critical 0
- [x] typecheck·lint·test·build 통과
- [x] 삭제·GitHub 보안 설정은 사람 승인 후 처리

## Mandatory Reading

- docs/adr/ADR-008-oss-public-boundary.md
- SECURITY.md
