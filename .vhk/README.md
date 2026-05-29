# `.vhk/` — VHK runtime state

이 디렉토리는 VHK 의 로컬 런타임 신호용. 커밋되는 파일과 커밋되지 않는
파일이 섞여 있다. 전체 규격은 `docs/spec.md` (spec_version 1.0) 참조.

## 트래킹 정책

| 파일 | 트래킹 | 용도 |
| --- | --- | --- |
| `README.md` | ✅ | 본 안내 |
| `context.md` | ✅ | 프로젝트 맥락 (`vhk context` 로 갱신) |
| `brief.md` | ✅ | 상태 요약 브리핑 (`vhk brief`) |
| `memory.json` | ❌ (로컬 only) | 의사결정 메모 (`vhk memory add`). 개인 메모 노출 방지로 `.gitignore`. |
| `refs.json` | ❌ (로컬 only) | 참고 URL (`vhk ref add`). `.gitignore`. |
| `HARD_STOP` | ❌ (로컬 only) | 존재하면 모든 자동화 즉시 중단. `vhk resume --confirm` 으로만 해제. |

## HARD_STOP 규칙

- 다음 조건에서 자동 생성:
  - 블로커 3 개 누적 (`docs/state/blockers.md`)
  - 토큰 예산 초과 감지 (옵션)
- 해제: `vhk resume --confirm` (사람이 직접 실행, 자동 호출 금지)
- 게이트 스크립트 (`scripts/check-*.sh`) 는 시작 시 이 파일을 검사하고
  존재하면 exit 1 한다.
