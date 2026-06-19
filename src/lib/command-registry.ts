/**
 * 컨테이너 명령 → 서브커맨드(또는 위치 인자 값)의 **단일 소스**.
 * R1 가드(cli-args.ts)와 드리프트 가드 테스트(tests/command-registry.test.ts)가
 * 같은 출처를 본다 — commander 정의와 따로 노는 하드코딩 복제를 제거하기 위함.
 *
 * 새 서브커맨드를 commander 에 추가하면 여기도 추가해야 한다. 누락하면
 * 드리프트 가드 테스트가 실패해 R1(자연어 라우터가 명령 가로채기) 재발을 사전에 잡는다.
 */
export const CONTAINER_SUBCOMMANDS: Record<string, readonly string[]> = {
  goal: ['list', 'next', 'check', 'init', 'done', 'sync', 'drift'],
  cost: ['add', 'check', 'budget'],
  ref: ['add', 'list', 'open'],
  memory: ['add', 'list', 'remove', 'archive', 'resolve', 'unarchive', 'migrate', 'eval'],
  cloud: ['push', 'pull'],
  secure: ['scan'],
  design: ['palette'],
  env: ['check'],
  mode: ['lite', 'standard', 'strict'],
  mission: ['set', 'check', 'clear'],
  pattern: ['detect', 'list', 'dismiss'],
  evolve: ['suggest', 'negatives', 'list', 'apply', 'reject', 'undo'],
  work: ['handoff'],
  worktree: ['add', 'check'],
  seo: ['init', 'submit', 'check', 'report', 'automate'],
}

/** 한국어 별칭 → 영문 컨테이너 명령. 별칭도 같은 서브커맨드 집합을 공유한다. */
export const CONTAINER_ALIASES: Record<string, string> = {
  목표: 'goal',
  비용: 'cost',
  레퍼런스: 'ref',
  기억: 'memory',
  클라우드: 'cloud',
  보안: 'secure',
  디자인: 'design',
  환경변수: 'env',
  모드: 'mode',
  미션: 'mission',
  패턴: 'pattern',
  진화: 'evolve',
  작업: 'work',
  워크트리: 'worktree',
}

/**
 * 최상위(top-level) 명령 카탈로그 — `vhk context`(.vhk/context.md)의 "명령 목록"의 **단일 소스**.
 * 과거 context.ts 가 별도 하드코딩 목록(getVhkCommands)을 가져 work/handoff/goal 등이
 * 누락·드리프트됐다(영상의 "같은 진실을 또 정의" 안티패턴). 이제 목록은 여기 하나로 모으고,
 * commander 실제 등록과의 일치는 tests/command-registry.test.ts 의 드리프트 가드가 강제한다
 * (누락/유령 명령 시 테스트 실패).
 *
 * desc 는 AI 컨텍스트 표시용 한 줄 설명. 새 명령을 index.ts 에 등록하면 여기에도 추가해야 한다.
 */
export const TOP_LEVEL_COMMANDS: ReadonlyArray<{ name: string; desc: string }> = [
  { name: 'gate', desc: '아이디어 검증' },
  { name: 'start', desc: '새 프로젝트 시작 마법사' },
  { name: 'init', desc: '하네스 파일 생성' },
  { name: 'recap', desc: '오늘 한 일 정리 + ADR 분리' },
  { name: 'sync', desc: 'RULES.md → 규칙 파일 동기화' },
  { name: 'check', desc: 'RULES.md 규칙 점검' },
  { name: 'secure', desc: '보안 스캔 (시크릿 유출 검사)' },
  { name: 'cloud', desc: '.vhk 클라우드 백업·복원 (push/pull)' },
  { name: 'ship', desc: '배포 체크리스트 + 회고' },
  { name: 'doctor', desc: '개발 환경 점검 (+ --strict 드리프트 게이트)' },
  { name: 'save', desc: 'git 저장 (add → commit → push)' },
  { name: 'undo', desc: '최근 커밋 되돌리기' },
  { name: 'restore', desc: 'sync 백업 복원' },
  { name: 'status', desc: '프로젝트 상태 대시보드' },
  { name: 'stats', desc: '통계 대시보드 — 패스율/차단율/진화 적용율 (읽기 전용)' },
  { name: 'diff', desc: 'Git 변경사항 한국어 요약' },
  { name: 'diff-cover', desc: '이번 변경이 테스트로 커버됐는지 측정 (자문형)' },
  { name: 'mcp', desc: 'MCP 서버 시작 (stdio)' },
  { name: 'mcp-init', desc: 'Cursor·Claude Desktop MCP 설정 생성' },
  { name: 'deploy', desc: '프로덕션 배포 (자동 감지)' },
  { name: 'env', desc: '.env → .env.example 동기화' },
  { name: 'env-check', desc: '필수 환경변수 누락 검사' },
  { name: 'publish', desc: 'npm 배포 (버전 범프 → 빌드 → 테스트)' },
  { name: 'design', desc: '디자인 토큰 생성' },
  { name: 'design-palette', desc: '컬러 팔레트 프리셋 선택' },
  { name: 'theme', desc: '다크/라이트 모드 CSS 생성' },
  { name: 'ref', desc: '레퍼런스 URL 관리 (add/list/open)' },
  { name: 'harness', desc: '통합 품질 점검 (lint+type+test+build)' },
  { name: 'audit', desc: '보안 취약점 감사 (npm audit)' },
  { name: 'migrate', desc: '패키지 매니저 전환 (npm/yarn/pnpm)' },
  { name: 'update', desc: 'VHK CLI 셀프 업데이트' },
  { name: 'context', desc: '프로젝트 맥락 파일 생성 (.vhk/context.md)' },
  { name: 'mode', desc: 'Safety Mode 조회/변경 (lite|standard|strict)' },
  { name: 'verify', desc: '검증 게이트 실행 + 증거 기록' },
  { name: 'cost', desc: '비용·예산 가드 — add/check/budget (자문형)' },
  { name: 'preflight', desc: '출고 전 안전점검 (2FA·shim·env·lint·타입·테스트·git, 치명 시 차단)' },
  { name: 'testmap', desc: 'test-first 매핑 점검 (변경 기능 ↔ 테스트 누락 경고)' },
  { name: 'worktree', desc: 'worktree 가드 — 생성 시 env/설정 자동 복사·누락 점검 (add/check)' },
  { name: 'standup', desc: '아침 브리핑 (어제 한 일 + 오늘 추천 goal + 미해결)' },
  { name: 'today', desc: '저녁 자축·회고 (오늘 커밋·완료 goal 카운트 + 격려)' },
  { name: 'review', desc: '적대적 자기검증 (거짓완료 의심 탐지)' },
  { name: 'mission', desc: '미션 계약 — 작업 목표·허용/금지 범위 선언·검증' },
  { name: 'context-show', desc: '컨텍스트 파일 내용 출력' },
  { name: 'memory', desc: '기억 관리 v2 (decisions/failures/successes)' },
  { name: 'recall', desc: '기억 회상 (자연어 키워드 검색 — RFC 0049)' },
  { name: 'brief', desc: '프로젝트 요약 보고서 생성' },
  { name: 'loop-brief', desc: '루프 1틱 앵커 생성 (의도+goal1+교훈+STOP)' },
  { name: 'remind', desc: '치명 규칙 재주입 (RULES.md NON-NEGOTIABLE/Forbidden 압축)' },
  { name: 'content', desc: '콘텐츠 초안 프롬프트 (풀사이클 뒷단 — 콘텐츠/마케팅)' },
  { name: 'launch', desc: '런칭 게시물 프롬프트 (풀사이클 뒷단 — 런칭)' },
  { name: 'work', desc: 'AI 작업 시작/이어하기 (+ handoff)' },
  { name: 'goal', desc: 'Goal 단계별 미션 관리' },
  { name: 'blocker', desc: '블로커 기록 (3건 누적 시 HARD_STOP)' },
  { name: 'learn', desc: '교훈 기록 → memory v2 단일 SoT' },
  { name: 'resume', desc: '.vhk/HARD_STOP 해제 (--confirm 필요)' },
  { name: 'pattern', desc: '반복 패턴 감지·목록 (avoid/reinforce)' },
  { name: 'evolve', desc: '패턴 → 룰 후보 제안·반영·undo' },
  { name: 'seo', desc: 'SEO·수익 대시보드 (init: 사이트 등록 + 자격증명 보관)' },
]
