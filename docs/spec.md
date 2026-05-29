---
title: ".vhk/ Directory Specification"
spec_version: "1.0"
status: draft
updated: 2026-05-29
---

# `.vhk/` 디렉토리 규격 (Specification)

> VHK가 프로젝트별 상태를 저장하는 표준 폴더 구조의 공식 규격서.
> 이 문서는 RFC 초안으로 그대로 공개 가능한 수준을 목표로 한다.
> 구현(코드)과 규격이 어긋나면 **이 문서가 기준**이며, 코드를 맞춘다.

## 0. 개요

`.vhk/` 는 한 프로젝트 안에서 VHK CLI가 읽고 쓰는 **로컬 상태 디렉토리**다.
구조는 하위 폴더 없는 **평면(flat) 파일 모음**이다. (하위 폴더 구조 아님 —
`spec_version 1.0` 기준.)

각 파일은 특정 커맨드가 **필요할 때 생성**(lazy)하거나, `vhk init`이
프로젝트 시작 시 **씨앗(seed)** 으로 미리 만든다.

## 1. 파일 목록

| 파일 | 포맷 | 트래킹 | 생성 주체 | 목적 |
| --- | --- | --- | --- | --- |
| `README.md` | Markdown | ✅ 커밋 | `vhk init` (씨앗) | 폴더 안내 + 트래킹 정책 |
| `.gitignore` | gitignore | ✅ 커밋 | `vhk init` (씨앗) | 로컬 전용 파일을 폴더 단위로 무시 (memory/refs/HARD_STOP) |
| `context.md` | Markdown | ✅ 커밋 | `vhk init`(씨앗) → `vhk context`(갱신) | 프로젝트 맥락: 기술 스택·디렉토리·명령어·결정사항 |
| `brief.md` | Markdown | ✅ 커밋 | `vhk brief` (lazy) | 상태 요약 브리핑: git 상태·결정사항·다음 단계 |
| `memory.json` | JSON | ❌ 로컬 전용 | `vhk memory add` (lazy) | 프로젝트 의사결정 메모 (개인/세션 기록) |
| `refs.json` | JSON | ❌ 로컬 전용 | `vhk ref add` (lazy) | 참고 URL + 메모 모음 |
| `HARD_STOP` | (내용 없음) | ❌ 로컬 전용 | 게이트/사용자 | 존재하면 모든 자동화 즉시 중단 |

> **트래킹 정책 요약**
> - `README.md`·`context.md`·`brief.md` → 팀 공유용, 커밋 권장.
> - `memory.json`·`refs.json` → 개인 메모/참고링크 노출 방지 위해 **로컬 전용**(`.gitignore`).
> - `HARD_STOP` → 로컬 안전 신호, 커밋 금지.

## 2. JSON 스키마

### 2.1 `memory.json`

의사결정·기억할 내용의 배열.

```jsonc
[
  {
    "content": "API는 tRPC 사용하기로 결정",  // string, 필수
    "addedAt": "2026-05-29T12:00:00.000Z",     // string(ISO 8601), 필수
    "tags": ["decision", "api"]                  // string[], 선택(기본 [])
  }
]
```

### 2.2 `refs.json`

참고 자료 URL의 배열. `url` 은 중복 저장 금지(유니크).

```jsonc
[
  {
    "url": "https://example.com",   // string, 필수, 유니크
    "memo": "참고 사이트",            // string, 필수(없으면 빈 문자열)
    "addedAt": "2026-05-29T12:00:00.000Z"  // string(ISO 8601), 필수
  }
]
```

> 두 파일 모두 **JSON 배열 루트**이며, 파일 끝에 개행 1개를 둔다.
> 파싱 실패·비배열이면 빈 배열 `[]` 로 간주한다(관대한 읽기).

## 3. `HARD_STOP` 규칙

- **역할:** 파일이 존재하기만 하면 VHK 자동화 전체가 즉시 멈춘다.
- **자동 생성 조건:**
  - 블로커 3개 누적 (`docs/state/blockers.md`)
  - 토큰 예산 초과 감지 (옵션)
- **해제:** `vhk resume --confirm` (사람이 직접 실행, 자동 호출 금지).
- 게이트 스크립트(`scripts/check-*`)는 시작 시 이 파일을 검사하고
  존재하면 `exit 1` 한다.

## 4. 호환성 정책

- 기존 파일명·포맷은 GA 안정성 정책에 따라 **변경하지 않는다.**
- 새 파일을 추가할 때는 이 문서의 표와 스키마에 먼저 등록한 뒤 구현한다.
- 구조를 평면→폴더로 바꾸는 등 호환성 깨는 변경은 `spec_version` 을 올리고
  마이그레이션 경로를 명시한다.

## 5. 비개발자용 한 줄 요약

`.vhk/` = 이 프로젝트에서 VHK가 기억하는 것들을 모아두는 폴더.
맥락(context)·브리핑(brief)은 팀과 공유하고, 개인 메모(memory)·참고링크(refs)는
내 컴퓨터에만 남기며, `HARD_STOP` 파일이 있으면 모든 자동 작업이 멈춘다.
