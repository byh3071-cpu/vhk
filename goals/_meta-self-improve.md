---
vhk_format: 1
type: meta
project: vhk-self-improve
---

# VHK 자기개선 — 공통 규칙

> 이 메타는 기존 `goals/_meta.md`(project: vhk-cli)와 별개의 **자기개선 배치 게이트**다.
> `vhk goal list`는 `type: meta` 파일을 제외하므로 이 파일은 목록에 노출되지 않는다.
> 배치 goal id는 기존 0~6 DONE 스택과 충돌을 피해 **7~10**으로 부여했다.

## 출처
2026-05-31 VHK A/B 미니 해커톤 dogfood 결과. 카페 대시보드를 VHK로
빌드하며 나온 버그·마찰을 VHK 자체 수정 작업으로 등록.
- 실험 레포: `byh3071-cpu/vhk-project-` (cafe-no-vhk / cafe-with-vhk)

## 배치 goal 매핑
| 배치 id | 파일 | 원래 실험 번호 |
| --- | --- | --- |
| 7 | check-script-all-goals | 0 |
| 8 | init-yes-noninteractive | 1 |
| 9 | windows-first-class | 2 |
| 10 | vhk-context-discoverability | 3 |

## 공통 게이트 (모든 goal done 조건)
- lint / typecheck / build exit 0
- 기존 테스트 통과 (회귀 없음)
- Windows(PowerShell) + macOS/Linux 양쪽 동작 확인

## 금지
- 기존 `vhk init` / `vhk goal` 정상 동작을 깨는 변경
- 플랫폼 의존 셸 문법(`&&`, `sh` 경로) 신규 도입
- 검증 없이 "동작할 것" 추정으로 done 처리

## 우선순위
P0(7,8,9) = harness 깨는 명백한 버그, 먼저. P1(10) = 핵심 가치, 설계 후.
