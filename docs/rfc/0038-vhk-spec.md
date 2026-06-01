---
rfc: 38
title: "`.vhk/` 규격 v1.1 — 누락 항목 정합 + `reports/` 서브디렉토리 도입"
status: Proposed
author: VHK
created: 2026-06-02
discussion: https://github.com/byh3071-cpu/vhk/issues/38
normative_ref: docs/spec.md
supersedes_note: "RFC 0001 (`.vhk/` v1.0) 의 후속. 0001/`spec.md` 가 정의한 v1.0 계약은 유지하고, 이 RFC 는 v1.1 증분만 다룬다."
spec_version_target: "1.1"
---

# RFC 0038 — `.vhk/` 규격 v1.1

> **번호 안내:** 이 저장소의 RFC 는 보통 일련번호(`0001`)다. 본 문서는 이슈 **#38**(`.vhk` 규격 트랙)을
> 추적하려고 이슈 번호를 파일명에 쓴다. 규범 기반은 여전히 [RFC 0001](./0001-vhk-directory-spec.md) +
> [`docs/spec.md`](../spec.md)(`spec_version 1.0`)이며, 본 RFC 는 그 위의 **v1.1 증분 제안**이다.
> 둘이 어긋나면 `spec.md` 가 기준이고, 이 RFC 채택 시 `spec.md` 를 v1.1 로 갱신한다.

## 1. 요약 (Summary)

RFC 0001 이 `.vhk/` v1.0 의 공유/로컬 경계와 평면 파일 모델을 고정했다. 그 후 구현이 **규격에
등재되지 않은 항목**(`.synced`, `backups/`)을 추가했고, Goal 13(verify 증거화)이 **첫 서브디렉토리**
(`reports/`)를 요구한다. 본 RFC 는 두 가지를 한다:

1. **정합(reconcile):** 코드엔 있으나 `spec.md` 표에 없는 `.synced`·`backups/` 를 규격에 등재하고,
   v1.0 §0 의 *"하위 폴더 없는 평면 구조"* 단언이 이미 `backups/`(서브디렉토리)로 깨졌음을 바로잡는다.
2. **확장(extend):** `reports/` 서브디렉토리를 도입해 `verify` 의 증거 산출물(`reports/latest.json`,
   후속 `reports/latest.html`)을 담는다.

변경은 **순수 가산(additive)** — 기존 파일명·포맷·트래킹 정책을 바꾸지 않으므로 `spec_version` 은
**1.0 → 1.1**(minor) 만 올린다. 마이그레이션 불필요.

## 2. 동기 (Motivation)

- **규격-구현 드리프트:** v1.0 §4(호환성 정책)는 *"새 파일은 표·스키마에 먼저 등록한 뒤 구현한다"* 고
  못박았지만, `.synced`(sync 마커)와 `backups/`(sync 백업)는 구현이 먼저 들어가고 규격에 빠졌다.
  드리프트는 외부 도구·문서 신뢰를 깬다 → 정본을 코드에 맞춰 닫는다.
- **"평면" 단언의 사실 오류:** v1.0 §0 은 `.vhk/` 가 평면이라고 단언하지만 `backups/<stamp>/…` 는 이미
  중첩 폴더다. 규격이 사실과 어긋난 채로 두면 v2.0 폴더화 논의(0001 §7.2)의 출발점이 흐려진다.
- **증거 산출물의 집(home)이 필요:** Goal 13 은 게이트 실행 결과를 `reports/latest.json` 으로 항상
  남긴다(거짓완료 방지·성장 루프 입력). 평면 루트에 흩뿌리면 산출물/상태 파일 경계가 모호해지고,
  후속 `latest.html`·리포트 히스토리가 루트를 오염시킨다. → 전용 서브디렉토리 `reports/` 로 격리.

## 3. 가이드 설명 (비개발자 포함)

v1.0 의 "공유할 것 vs 내 것만" 경계는 그대로다. v1.1 은 거기에 **"자동 생성된 임시 산출물"** 한 칸을 더
나눈다.

- `reports/` = VHK 가 검증을 돌리고 남기는 **증거 리포트**가 사는 곳. "테스트 진짜 돌렸어?"에
  파일로 답한다.
- `backups/` = `vhk sync` 가 파일을 덮어쓰기 직전 떠 두는 **로컬 복구본**(이미 동작 중, 규격에만 추가).
- `.synced` = "이 프로젝트에서 sync 가 한 번이라도 돌았나"를 기록하는 작은 **마커**(이미 동작 중).

세 항목 모두 **로컬 전용(커밋·백업 제외)** — 개인 환경 산물이라 팀/클라우드로 새지 않는다.

## 4. 규격 변경 (Reference) — v1.1 증분

### 4.1 파일/디렉토리 목록 추가

`spec.md §1` 표에 아래 행을 추가한다(기존 행 무변경):

| 경로 | 포맷 | 트래킹 | 생성 주체 | 목적 |
| --- | --- | --- | --- | --- |
| `.synced` | text(ISO 타임스탬프) | ❌ 로컬 전용 | `vhk sync` | 첫 sync 판정 마커. 내용 = 마지막 sync 시각(ISO) |
| `backups/<stamp>/…` | 디렉토리 | ❌ 로컬 전용 | `vhk sync`(덮어쓰기 직전) | sync 덮어쓰기 전 원본 백업. `vhk restore` 가 복원 |
| `config.json` | JSON | ❌ 로컬 전용(권장) | `vhk mode` | 프로젝트 설정. 현재 `{ "safetyMode": "lite\|standard\|strict" }` |
| `reports/` | 디렉토리 | ❌ 로컬 전용 | `vhk verify` | **(신규 v1.1)** 검증 증거 산출물 디렉토리 |
| `reports/latest.json` | JSON | ❌ 로컬 전용 | `vhk verify` | **(신규 v1.1)** 최신 검증 리포트. 스키마 §4.3 |

> 참고: `config.json` 은 v1.0 표에 누락됐었다(코드: `src/lib/config.ts`). 정합 차원에서 함께 등재한다.
> 읽기는 절대 throw 하지 않고 없으면 기본값(`standard`)으로 동작한다.

### 4.2 "평면 구조" 단언 정정

`spec.md §0` 의 *"하위 폴더 없는 평면 파일 모음"* 을 다음으로 대체:

> `.vhk/` 는 **루트는 평면 파일 위주**이되, 자동 생성 산출물은 전용 서브디렉토리
> (`backups/`, `reports/`)로 격리한다. 상태/설정 파일은 루트 평면, 산출물·히스토리는 서브디렉토리 —
> 이 둘의 경계가 트래킹 정책(전부 로컬 전용)과 일치한다.

### 4.3 `reports/latest.json` 스키마 (신규)

Goal 13 의 계약. **head(기계용) + body(사람용)** 2단 구조.

```jsonc
{
  "schemaVersion": 1,                       // number, 필수
  "generatedAt": "2026-06-02T...Z",         // string(ISO/UTC), 필수 — 머신 타임스탬프
  "date": "2026-06-02",                      // string(localDate), 필수 — 사람용 날짜
  "status": "PASS",                          // "PASS" | "WARN" | "FAIL", 필수
  "summary": { "total": 4, "pass": 4, "fail": 0, "skip": 0 },  // 카운트(기계용 head)
  "gates": [                                  // 게이트별 실제 종료코드 기반 결과(body)
    { "id": "typecheck", "label": "tsc --noEmit", "status": "pass", "exitCode": 0, "skipped": false }
  ],
  "nextActions": [ "..." ]                    // string[], 다음 행동 힌트
}
```

- `status` 도출: 하나라도 `fail` → `FAIL`; fail 없고 `skip` 있음 → `WARN`; 전부 `pass` → `PASS`.
- **거짓 PASS 금지:** 결과는 실제 프로세스 종료코드에서만 나온다. 게이트 스크립트 부재 → `skip`(WARN),
  실행 자체 실패(ENOENT 등) → `fail`. 추측 금지.
- **시크릿 비포함:** secret/env 값·스캔이 찾은 시크릿 본문은 리포트에 넣지 않는다(`.vhkignore` 존중).
  게이트 메타(이름·종료코드·통과여부)만 기록.

### 4.4 트래킹 / 클라우드 정책

- `reports/`·`backups/`·`.synced`·`config.json` → **로컬 전용**: `.vhk/.gitignore` 에 등재(이미
  `backups/`·`.synced` 류는 코드가 자기방어). `vhk cloud push` 기본 제외 집합에도 포함.
- 근거: 검증 리포트·백업·마커·설정은 **개인 환경 산물**이라 팀 공유·클라우드 백업 대상이 아니다.

## 5. 설계 근거 & 대안 (Rationale & Alternatives)

- **왜 minor 범프(1.0→1.1)인가:** 파일명·포맷·기존 정책 무변경 + 신규는 전부 가산 → 호환성 안 깨짐.
  v1.0 §4 의 "평면→폴더 등 호환성 깨는 변경만 spec_version 상향" 과 충돌하지 않게, "단언 정정 +
  서브디렉토리 추가"는 호환 가산으로 분류해 **minor** 로 둔다(major 아님).
- **왜 `reports/` 서브디렉토리(루트 평면 아님):** ① 산출물 히스토리(`latest.html`, 향후 타임스탬프
  리포트)가 루트를 오염시키지 않음 ② 트래킹 정책이 디렉토리 단위로 깔끔(전체 ignore) ③ "상태=루트,
  산출물=서브디렉토리" 멘탈 모델이 `backups/` 선례와 일관.
- **대안 — 루트 평면 유지(`vhk-report.json`):** 거부. `latest.html`·히스토리까지 루트에 쌓이면 §4.2
  경계가 다시 무너진다.
- **대안 — `reports/` 를 커밋(공유):** 거부. 리포트는 로컬 환경(설치된 toolchain) 산물이라 기기마다
  달라 팀 공유 시 머지 충돌·노이즈. 필요하면 사용자가 옵트인으로 `.vhkignore`/`.gitignore` 조정.

## 6. 마이그레이션 & 호환성 (Compatibility)

- **마이그레이션 불필요.** 기존 `.vhk/` 는 그대로 유효. `.synced`·`backups/` 는 이미 존재하던 것을
  규격에 등재할 뿐, `reports/` 는 `vhk verify` 가 필요 시 `mkdir -p` 로 생성(lazy).
- v1.0 클라이언트가 v1.1 디렉토리를 만나도 `reports/`·`backups/` 를 모를 뿐 동작 안 깨짐(전방 호환).
- GA 안정성: 기존 tool API·파일 시그니처 변경 0.

## 7. 미해결 질문 (Unresolved Questions)

1. **리포트 히스토리:** `latest.json` 외에 타임스탬프 스냅샷(`reports/<stamp>.json`)을 둘지, 둔다면
   `backups/` 처럼 보존 정책(prune)을 적용할지. (배치 6 `--report` 논의로 이관 가능)
2. **`.synced` 내용 계약:** 현재 "마지막 sync 시각" 한 줄. 멀티 RULES.md/모노레포에서 per-target
   마커가 필요할지.
3. **`config.json` 확장:** safetyMode 외 설정(예: 기본 verify 게이트 셋) 추가 시 스키마 버저닝.
4. **v2.0 폴더화:** 루트 평면 파일들도 카테고리 폴더로 옮길지(0001 §7.2 연장). 본 RFC 는 산출물만
   서브디렉토리로 분리하고 상태/설정 루트는 유지 — v2.0 의 부분 선례.

## 8. 채택 시 작업 (If Accepted)

- [ ] `docs/spec.md` → `spec_version 1.1` 갱신: §1 표에 `.synced`·`backups/`·`config.json`·`reports/`
      추가, §0 평면 단언 정정, §2 에 `reports/latest.json` 스키마 추가.
- [ ] `.vhk/README.md` 트래킹 표에 신규 항목 반영(`src/templates/vhk-dir.ts`).
- [ ] Goal 13 구현이 `reports/latest.json` 을 본 스키마로 산출(별도 PR — 본 RFC 는 코드 아님).
- [ ] RFC 0001 §7.2(폴더화)에 본 RFC 를 "부분 선례"로 상호 링크.
