---
title: ".vhk/ Directory Specification"
spec_version: "1.1"
status: draft
updated: 2026-06-10
---

# `.vhk/` 디렉토리 규격 (Specification)

> VHK가 프로젝트별 상태를 저장하는 표준 폴더 구조의 공식 규격서.
> 이 문서는 RFC 초안으로 그대로 공개 가능한 수준을 목표로 한다.
> 구현(코드)과 규격이 어긋나면 **이 문서가 기준**이며, 코드를 맞춘다.

## 0. 개요

`.vhk/` 는 한 프로젝트 안에서 VHK CLI가 읽고 쓰는 **로컬 상태 디렉토리**다.
기본은 **평면(flat) 파일 모음**이고, `spec_version 1.1`부터 기능별 **하위 폴더를
공식 인정**한다(전부 로컬 전용): `backups/`(sync 백업) · `events/`(AI 행동 원장,
Goal 55) · `eval/`(recall 평가) · `reports/`(검증 리포트) · `seo/`(SEO 대시보드 설정).
1.0의 "평면" 문구는 현실(기능들이 폴더를 사용)과 어긋나 1.1에서 정정했다 —
파일명·포맷 호환성은 그대로다(§4).

각 파일은 특정 커맨드가 **필요할 때 생성**(lazy)하거나, `vhk init`이
프로젝트 시작 시 **씨앗(seed)** 으로 미리 만든다.

## 1. 파일 목록

| 파일 | 포맷 | 트래킹 | 생성 주체 | 목적 |
| --- | --- | --- | --- | --- |
| `README.md` | Markdown | ✅ 커밋 | `vhk init` (씨앗) | 폴더 안내 + 트래킹 정책 |
| `.gitignore` | gitignore | ✅ 커밋 | `vhk init` (씨앗) | 로컬 전용 파일을 폴더 단위로 무시 |
| `config.json` | JSON | ✅ 커밋 | `vhk init` | 프로젝트 설정 |
| `context.md` | Markdown | ✅ 커밋(기본)¹ | `vhk init`(씨앗) → `vhk context`(갱신) | 프로젝트 맥락: 기술 스택·디렉토리·명령어·결정사항 |
| `brief.md` | Markdown | ✅ 커밋(기본)¹ | `vhk brief` (lazy) | 상태 요약 브리핑: git 상태·결정사항·다음 단계 |
| `work-prompt.md` · `handoff-prompt.md` | Markdown | ❌ 로컬 전용 | `vhk work` | 세션 시작/인수인계 프롬프트 산출물 |
| `memory.json` | JSON | ❌ 로컬 전용 | `vhk memory add` (lazy) | 프로젝트 의사결정 메모 (개인/세션 기록) |
| `refs.json` | JSON | ❌ 로컬 전용 | `vhk ref add` (lazy) | 참고 URL + 메모 모음 |
| `mission.json` | JSON | ❌ 로컬 전용 | `vhk mission set` | 미션 범위 계약 |
| `recall-log.jsonl` | JSONL | ❌ 로컬 전용 | `vhk recall` | recall 측정 로그 (RFC 0049) |
| `.synced` | (마커) | ❌ 로컬 전용 | `vhk sync` | 마지막 sync 마커 |
| `HARD_STOP` | (내용 없음) | ❌ 로컬 전용 | 게이트/사용자 | 존재하면 모든 자동화 즉시 중단 |
| `cloud.json` | JSON | ❌ 로컬 전용² | `vhk cloud push/pull` | 클라우드 백업 gist 포인터 `{ "gistId": "..." }` |
| `backups/` `events/` `eval/` `reports/` `seo/` | 폴더 | ❌ 로컬 전용 | 각 기능 | §0 참조 (1.1 공식 인정) |

> ¹ **1.1 명확화**: 기본은 커밋(팀 공유, `vhk init` 템플릿과 일치)이되, 동시 세션
> 충돌·세션 산출물 노이즈가 큰 프로젝트는 `.vhk/.gitignore` 에 추가해 **로컬 전용으로
> 오버라이드할 수 있음을 공식 인정**(vhk 레포 본체가 이 오버라이드 사용). 공유는 cloud push 로도 가능.
> ² gist id 공개 repo 노출 방지(VHK-022)로 1.0 표기와 달리 로컬 전용이 구현 정책(init 템플릿이 무시 처리).

> 프로젝트 루트의 `.vhkignore` (선택, 커밋) 는 `vhk cloud push` 백업에서 제외할
> `.vhk/` 파일을 한 줄에 하나씩 적는다. 기본 제외(자동): `memory.json`·`refs.json`·
> `HARD_STOP`·`cloud.json`·`.gitignore`.

> **트래킹 정책 요약 (1.1)**
> - 커밋 = `README.md`·`.gitignore`·`config.json` + (기본값) `context.md`·`brief.md`.
> - 로컬 전용 = 개인 메모(memory/refs)·런타임 신호(HARD_STOP·.synced)·세션 프롬프트·
>   `cloud.json`·하위 폴더 전부. context/brief 는 프로젝트별 로컬 오버라이드 허용(¹).
> - 팀 공유가 필요한 로컬 항목은 `vhk cloud push`(secret gist) 경로를 쓴다.

## 2. JSON 스키마

### 2.1 `memory.json` (schema v2)

**v2.0.0 BREAKING**: 평면 배열 → 4버킷 객체. v1(평면 배열)은 `vhk` 실행 시 자동 마이그레이션(`.bak` 백업, 멱등).
교훈은 `failures.lesson` 단일 SoT (구 `docs/state/learnings.md` 흡수, `vhk learn` 통합).

```jsonc
{
  "schemaVersion": 2,
  "decisions": [
    { "id": "d1", "content": "API는 tRPC", "tags": ["api"], "createdAt": "...", "status": "active" }
  ],
  "failures":  [
    // status: active|resolved|archived (+resolvedAt/archivedAt). 패턴·진화는 active 만 본다.
    { "id": "f1", "content": "테스트 미커버", "why": "...", "lesson": "회귀 가드 먼저", "tags": [], "createdAt": "...", "status": "active" }
  ],
  "successes": [
    { "id": "s1", "content": "롤백 빨랐다", "why": "백업 먼저", "tags": [], "createdAt": "...", "status": "active" }
  ],
  "patterns": []  // Goal 19(vhk pattern)에서 채움
}
```

> v1 → v2: 평면 항목 → `decisions`, `docs/state/learnings.md` 교훈 → `failures`(lesson, content 비움).
> 백업: `memory.json.v1.bak`(v1 원본 write-once 영구) + `memory.json.bak`(롤링, 매 쓰기 직전).

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

## 3.5 클라우드 동기화 (cloud sync)

- `vhk cloud push` — `.vhk/` 공유 파일을 GitHub **secret gist** 로 백업하고
  gist id 를 `cloud.json` 에 저장한다. 인증은 `gh` CLI 가 담당(코드에 토큰 없음).
- `vhk cloud pull [gistId]` — gist 에서 `.vhk/` 를 복원한다. id 생략 시 `cloud.json` 사용.
- 백업 대상은 `collectVhkFiles` 가 결정: `.vhk/` 평면 파일 중 기본 제외 + `.vhkignore` 적용 후.
- 개인 메모(`memory.json`)·참고링크(`refs.json`)·`HARD_STOP` 은 기본 제외(프라이버시).

## 4. 호환성 정책

- 기존 파일명·포맷은 GA 안정성 정책에 따라 **변경하지 않는다.**
- 새 파일을 추가할 때는 이 문서의 표와 스키마에 먼저 등록한 뒤 구현한다.
- 구조를 평면→폴더로 바꾸는 등 호환성 깨는 변경은 `spec_version` 을 올리고
  마이그레이션 경로를 명시한다.

### 변경 이력

- **1.1 (2026-06-10, governance T4 — RFC 0038 후속)**: 하위 폴더 공식 인정(backups/events/
  eval/reports/seo — 전부 로컬 전용) · context/brief 는 기본 커밋 + 프로젝트별 로컬 무시
  오버라이드 공식 인정 · cloud.json 은 로컬 전용으로 정정(VHK-022) · 누락 파일
  (config.json·mission.json·recall-log.jsonl·work/handoff-prompt.md·.synced) 표 등록.
  파일 마이그레이션 없음 — 문서를 현실에 맞춘 가산·정정.
- **1.0 (2026-05-29)**: 최초 규격.

## 5. 비개발자용 한 줄 요약

`.vhk/` = 이 프로젝트에서 VHK가 기억하는 것들을 모아두는 폴더.
맥락(context)·브리핑(brief)은 팀과 공유하고, 개인 메모(memory)·참고링크(refs)는
내 컴퓨터에만 남기며, `HARD_STOP` 파일이 있으면 모든 자동 작업이 멈춘다.
