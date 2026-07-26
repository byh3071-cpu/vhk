---
set: notion-summary-protocol
version: 1.0
total_cases: 10
scoring: rubric_pass_rate
case_pass: all_MUST
set_pass_threshold: 0.8
source: 'Notion: 원본자료 → 요약 처리 프로토콜 (SoT)'
note: 외부 유출 프롬프트 원문 미포함 — 관찰된 행동 패턴만 규칙으로 인코딩
---

# 원본→요약 골든 셋 (Golden Set)

> **TL;DR** — 이 파일은 요약 에이전트의 **원본→요약(source→summary) 처리 프로토콜** 출력 품질을 회귀 검사하기 위한 골든 셋이다. `vhk check evals`가 이 파일을 읽어 케이스별로 채점한다.

## 1. 이 파일은 무엇인가
- **평가 대상:** 요약 에이전트가 원본 자료(녹음 / 영상 / URL / 이미지 / 텍스트)를 RESOURCE·SUMMARY로 정리하는 작업의 품질.
- **소비자:** VHK CLI의 `vhk check evals` 명령.
- **생성 경로:** `vhk init`(로드맵 goal G-A)이 만드는 표준 위치 `docs/evals/golden-set.md`.
- **잡아내는 것:** 프로토콜 규칙 위반으로 인한 품질 회귀 — 잘린 원본을 전체인 척 처리, 무손실 이관 실패, 관계형 누락, 팩트체크 누락, 보호 블록 손상 등.

## 2. 채점 모델
- **케이스 단위:** `MUST`를 **전부** 충족하면 해당 케이스 PASS. `SHOULD`는 가점(보너스)이며 PASS 판정에는 미반영. `anti`는 나오면 안 되는 실패 패턴(발생 시 FAIL 신호).
- **세트 단위:** 10건 중 8건(`set_pass_threshold: 0.8`) 이상 PASS → 세트 **GREEN**, 미만 → **RED**.

## 3. 실행 / 케이스 추가 방법
- **실행:** 레포 루트에서 `vhk check evals` (채점기는 로드맵 goal G-B가 구현).
- **케이스 추가:** 아래 스키마대로 `## GS-NN · 제목` 섹션을 추가하고 frontmatter의 `total_cases`를 갱신.
- **회귀 사용법:** 요약 에이전트의 실제 SUMMARY 산출물을 각 케이스 `input` 시나리오로 돌려 MUST 충족 여부를 확인한다.

## 4. 결과 리포트 형식 (참고)
채점기(`vhk check evals`, G-B 구현)가 낼 결과의 권장 형태. **실제 출력 형식은 G-B 구현이 최종이며, 아래는 참고용 계약(contract)이다.**

```
SET: notion-summary-protocol v1.0
RESULT: GREEN | RED        # PASS 케이스 수 / 10 >= 0.8 → GREEN
SCORE: 9/10 (0.90)

GS-01  PASS  MUST 2/2
GS-02  PASS  MUST 2/2
GS-03  PASS  MUST 2/2
GS-04  PASS  MUST 2/2
GS-05  PASS  MUST 3/3
GS-06  FAIL  MUST 1/2  weight=high  miss="[미검증] 태그 누락"
GS-07  PASS  MUST 1/1
GS-08  PASS  MUST 2/2
GS-09  PASS  MUST 2/2
GS-10  PASS  MUST 2/2
```
- 케이스 PASS = 해당 케이스의 MUST 전부 충족. SHOULD 미충족은 PASS에 영향 없음(가점만).
- FAIL 행에는 어떤 MUST가 깨졌는지(miss) 한 줄로 남기는 것을 권장.

## 5. 케이스 스키마
각 `## GS-NN` 섹션의 필드 의미:
- `weight`: `critical` | `high` | `medium` — 실패 시 심각도(현재는 우선순위 표시용).
- `input`: 요약 에이전트에게 주어지는 가상 시나리오.
- `MUST`: 반드시 만족해야 하는 출력 조건. **전부 충족 = 케이스 PASS.**
- `SHOULD`: 충족 시 가점.
- `anti`: 발생하면 실패로 보는 안티패턴.

## 6. 용어집 (Glossary) — 레포 외부(노션) 맥락
| 용어 | 뜻 |
| --- | --- |
| 요약 에이전트 | 원본 자료를 구조화된 요약으로 변환하는 작업 주체. |
| 원본→요약 프로토콜 | 원본 자료를 RESOURCE(링크·메타)와 SUMMARY(요약본)로 분리·정리하는 노션 워크플로우. |
| RESOURCE DB | 원본 자료의 링크·메타데이터를 보관하는 노션 DB. 원문 전문(트랜스크립트) 복제 금지. |
| SUMMARY DB | 요약본을 작성하는 노션 DB. 관련 RESOURCE를 관계형으로 반드시 연결. |
| 사전진단 게이트 | 요약 착수 전 원본 읽기 완성도(읽기%)·등급(A/B/C)을 판정하는 단계. |
| meeting-notes 블록 | 노션의 회의록(녹취) 블록. AI가 직접 편집·이동하면 손상 위험 → 불가침. |
| 키워드 DB | 프롬프트 출력을 바꾸는 키워드(수식어·패턴·지시어·포맷·톤·도메인 용어)를 모으는 노션 DB. |
| AI 사전 / 트리플맵 | 개념·용어·전략을 정리하는 노션 지식 DB. 키워드 DB와 역할 구분(개념은 이쪽). |
| 인물 DB | 인물 프로필을 모으는 노션 DB. |
| `[미검증]` 태그 | 웹 교차확인에 실패한 사실에 붙이는 신뢰도 라벨. |
| 🆕 표시 | AI 요약이 누락한 내용을 트랜스크립트 대조로 보강했음을 나타내는 표식. |

## 7. 출처·범위
- SoT: Notion "원본자료 → 요약 처리 프로토콜".
- 외부 유출 프롬프트 원문은 미포함 — 관찰된 행동 패턴만 규칙으로 인코딩.

---

## GS-01 · 사전진단 게이트
weight: critical
input: 긴 원본 URL + "요약해줘". loadPage 결과 truncated, 실제 읽기 약 60%.
- MUST: 요약 착수 전 사전 진단 리포트(읽기% · 소스가이드 유무 · 원본 길이 · 등급 A/B/C · 권장조치) 먼저 출력
- MUST: 읽기 70% 미만 → 등급 C 판정 + 분할읽기 또는 채팅보충 권장
- SHOULD: 사용자가 강행하면 SUMMARY에 [부분 읽기] 태그를 남김
anti: 진단 없이 바로 요약 / 잘린 줄 모르고 전체인 척 작성

## GS-02 · 원본 AI요약 무손실 이관
weight: critical
input: 이미 AI summary가 달린 녹음 미팅노트를 SUMMARY로 1차 이관.
- MUST: 원본 summary를 삭제·축약 없이 전체 복사(1차)
- MUST: 포맷 보강(2차)은 기존 내용 보존 상태에서 섹션 추가만
anti: 원본 요약을 더 짧게 재요약 / 문단 임의 누락

## GS-03 · RESOURCE↔SUMMARY 관계형 필수
weight: high
input: 새 원본을 받아 RESOURCE와 SUMMARY를 만든다.
- MUST: SUMMARY 생성 시 관련 RESOURCE 관계형 연결(절대규칙 2)
- MUST: RESOURCE에는 원본 전문(트랜스크립트) 복제 금지 — 링크/메타만
anti: RESOURCE 미연결 SUMMARY / RESOURCE에 트랜스크립트 통째 복사

## GS-04 · AI요약 누락 보강 (3체크)
weight: high
input: 후반부 라이브 데모가 있는 긴 강의. AI summary는 데모 결과를 누락.
- MUST: 트랜스크립트 대조로 ①목표 커버리지 ②도구·스킬명 완전성 ③후반부 데모 결과 3항목 점검
- MUST: 누락 발견 시 해당 내용을 SUMMARY에 🆕 표시로 즉시 보강
anti: AI summary를 무검증 신뢰 / 후반부·데모 누락 방치

## GS-05 · 입력 타입별 포맷 분기
weight: medium
input: (a) 트윗 1개 캡처 (b) 3단락+코드 포함 아티클
- MUST: (a) 축소 포맷(핵심요약+상세+적용)으로 처리
- MUST: (b) 풀 포맷(표준 구조 전체)으로 처리
- MUST: 녹음이 아닌 입력은 Step 0(캡처)·Step 5(아카이브) 생략
anti: 짧은 글에 풀 포맷 억지 / 긴 자료를 과도 축약

## GS-06 · 팩트체크 + [미검증] 태그
weight: high
input: SUMMARY 본문에 수치·날짜·고유명사·논문명이 등장.
- MUST: 수치/날짜/고유명사/논문명을 웹 검색으로 교차 확인
- MUST: 확인 불가 항목은 [미검증] 표기, 단정 금지
anti: 미확인 수치·출처를 사실처럼 단정

## GS-07 · 키워드 DB 결과 명시
weight: medium
input: 온톨로지 추출 단계에서 키워드 DB 스캔 수행.
- MUST: 스캔 후 채팅에 한 줄 보고 — "키워드 DB: N건 등록" 또는 "키워드 DB: 스킵(이유)"
anti: 스캔 결과를 보고하지 않고 조용히 넘어감

## GS-08 · 키워드 DB 범위 게이트
weight: high
input: SUMMARY에 프롬프트 수식어 1개 + 비즈니스 전략 개념 1개가 동시 등장.
- MUST: 프롬프트 출력을 바꾸는 키워드(수식어/패턴/지시어/포맷/톤/도메인 용어)만 키워드 DB 등록
- MUST: 비즈니스·전략·철학 등 개념성 항목은 AI 사전·트리플맵으로 보냄
anti: 개념·전략 항목을 키워드 DB에 오등록

## GS-09 · meeting-notes 블록 불가침
weight: critical
input: 아카이브 처리 요청 — 미팅노트 블록 이동 필요.
- MUST: AI는 이관 내역 테이블 행 추가 + 빈 토글 H2 생성까지만
- MUST: meeting-notes 블록 이동·추가·삭제·contentUpdate 편집 금지(손상) → 사람이 직접 이동하도록 안내
anti: AI가 meeting-notes 블록을 직접 편집/이동해 데이터 손상

## GS-10 · 인물 감지 훅
weight: medium
input: 특정 인물이 저자/발화자/핵심 등장인물로 등장 + 다른 인물 1회성 인용.
- MUST: 핵심 인물은 인물 DB 검색 → 등록돼 있으면 관계형 연결, 미등록이면 1회 등록 제안
- MUST: 단순 1회성 인용 인물은 감지 대상에서 제외
anti: 단순 인용에 인물 등록 남발 / 핵심 발화자를 누락
