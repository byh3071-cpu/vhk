/**
 * 컨테이너 명령 → 서브커맨드(또는 위치 인자 값)의 **단일 소스**.
 * R1 가드(cli-args.ts)와 드리프트 가드 테스트(tests/command-registry.test.ts)가
 * 같은 출처를 본다 — commander 정의와 따로 노는 하드코딩 복제를 제거하기 위함.
 *
 * 새 서브커맨드를 commander 에 추가하면 여기도 추가해야 한다. 누락하면
 * 드리프트 가드 테스트가 실패해 R1(자연어 라우터가 명령 가로채기) 재발을 사전에 잡는다.
 */
export const CONTAINER_SUBCOMMANDS: Record<string, readonly string[]> = {
  goal: ['list', 'next', 'check', 'init', 'done', 'sync'],
  ref: ['add', 'list', 'open'],
  memory: ['add', 'list', 'remove'],
  cloud: ['push', 'pull'],
  secure: ['scan'],
  design: ['palette'],
  env: ['check'],
  mode: ['lite', 'standard', 'strict'],
}

/** 한국어 별칭 → 영문 컨테이너 명령. 별칭도 같은 서브커맨드 집합을 공유한다. */
export const CONTAINER_ALIASES: Record<string, string> = {
  목표: 'goal',
  레퍼런스: 'ref',
  기억: 'memory',
  클라우드: 'cloud',
  보안: 'secure',
  디자인: 'design',
  환경변수: 'env',
  모드: 'mode',
}
