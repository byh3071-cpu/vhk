# 🌅 밤샘 무인 결함루프 — 2026-07-01

> ⚠️ **런처 정정(사람이 읽을 것):** 이 실행은 **의도한 대상(vhk·both·cap10)과 다르게** 돌았다.
> 원인 = Workflow `args`를 JSON **문자열**로 넘겨(객체 아님) 엔진이 `cfg.repos`를 못 읽음 → **기본 레포(yohan-mcp + control-tower)로 폴백** + scope=`audit`(both 아님) + cap=`6`(10 아님).
> **결과: vhk는 0건 커버.** 아래 리포트의 6 PR은 전부 yohan-mcp(2)+control-tower(4). 6 PR 모두 base=`master`로 정상 생성됨(master→main 패치는 이 실행엔 무영향).
> **재실행 필요**: vhk 대상은 args를 객체로 넘겨 다시 돌려야 함. — 백요한

---

## 결론 먼저
- **밤새 6개 결함을 고쳐 PR 6건 생성. 머지는 0건(설계대로 밤엔 안 함).**
- **6건 전부 자체검증·적대리뷰에서 "머지 가능" 판정** (강도 차이 있음, 아래 분류).
- **보류(park) 0건.**
- ⚠️ **발굴 갭:** 총 10 발굴 · PR 6 · 보류 0 → **4건 처리 상태가 데이터에 없음**(중복/무효 걸림 or 집계 차이 추정, 미확정).

---

## 1. PR별 머지 권고

### 🟢 바로 머지 권고 (증거 강함 — 실제 테스트로 검증)
| PR | 레포 | 결함(쉬운 말) | 근거 |
|----|------|------|------|
| [#18](https://github.com/byh3071-cpu/yohan-mcp/pull/18) | yohan-mcp | 같은 글 재발행 시 매번 새 파일 무한 증식(멱등 깨짐) | 전용 회귀테스트 + **전체 pytest 170 pass**. 교차-슬러그 오탐 없음 확인 |
| [#19](https://github.com/byh3071-cpu/yohan-mcp/pull/19) | yohan-mcp | 일시 실패가 영구 캐시돼 원인 해소 후에도 재시도 0 (완결 루프 영구 정지) | **173 pass** + **반증 테스트**(수정 원복 시 버그 재현) → 증거 최강 |

### 🟡 머지 권고하되 CI 그린 확인 후 (검증이 typecheck+lint뿐)
| PR | 레포 | 결함 | 근거 / 주의 |
|----|------|------|------|
| [#14](https://github.com/byh3071-cpu/yohan-control-tower/pull/14) | control-tower | 청크가 토큰예산(512)의 2배로 잘림 — 자기 규칙 위반 | 프로브 재현(1024→512) 명확. 청킹 테스트 없음 → typecheck+lint만 |
| [#15](https://github.com/byh3071-cpu/yohan-control-tower/pull/15) | control-tower | Qdrant/쿼리 경로 타임아웃 부재 → 무한 대기 | 라이브러리 소스로 timeout=ms(30초) 실측. typecheck+lint만 |
| [#16](https://github.com/byh3071-cpu/yohan-control-tower/pull/16) | control-tower | 차원 불일치 시 벡터 전량 조용히 삭제됨을 경고로 노출(low) | +5줄, 시그니처 불변. typecheck+lint만 |

> ⚠️ control-tower는 관련 **테스트 스위트 없음** → 자체검증 typecheck+lint 한정. 교훈(parallel-agent-ci-gate: local green ≠ 머지가능)대로 **머지 전 `gh pr checks` CI 그린 필수 확인.**

### 🔵 저위험 문서성 — 언제든 머지 가능
| PR | 레포 | 내용 | 근거 |
|----|------|------|------|
| [#17](https://github.com/byh3071-cpu/yohan-control-tower/pull/17) | control-tower | 헤더 주석 옛 임베딩 모델명 정정(nomic→bge-m3), 1줄 | 런타임 미접촉, 코드 실측 일치. 순수 주석 |

---

## 2. 보류(park) 목록
- **없음.**

## 3. 미시도 발굴목록 (⚠️ 데이터 갭)
- 전달된 "미시도" 목록 = 빈 배열. 발굴 10 − PR 6 − 보류 0 = **4건 행방 불명.**
- 가능성: (a) 중복/무효 필터 (b) 발굴만·미착수인데 목록 누락 (c) 집계 방식 차이. **미확정 — 없는 셈 치지 말 것.**

## 4. 후속 권고
1. **CI 확인 → 머지:** control-tower 4건 `gh pr checks` 그린 확인 후. yohan-mcp 2건은 테스트 근거 충분.
2. **발굴 갭 4건 규명:** 루프 로그 확인해 "10−6−0=4" 정체 특정. 실 결함이면 다음 루프 재투입.
3. **머지 순서 제안:** 저위험(#17→#16) 손풀기 → 핵심(#19→#18) → 검증약(#14→#15). 독립 PR이라 순서 자유.
4. **vhk 재실행:** 이 실행은 vhk 미커버 → args 객체로 다시.

*밤 동안 코드 집행·머지·발송 0건(설계 준수).*
