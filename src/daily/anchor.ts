// Goal 32 Phase 3 — "첫 터미널 여는 순간" 자동 브리핑을 위한 셸 앵커.
//
// 핵심 안전 원칙: rc 파일(~/.bashrc · ~/.zshrc · PowerShell $PROFILE)을 절대 자동 수정하지 않는다.
// 사용자가 직접 붙여넣을 "한 줄"과 안내만 만든다(출력 전용). vhk 미설치/PATH 누락 환경에서도
// 셸 시작이 깨지지 않도록 각 줄에 존재 가드를 둔다.

export interface AnchorLines {
  bash: string // ~/.bashrc · ~/.zshrc 용
  powershell: string // PowerShell $PROFILE 용
}

/** 셸별 앵커 한 줄(순수). 존재 가드로 vhk 미설치 시에도 안전. */
export function buildAnchorLines(): AnchorLines {
  return {
    bash: 'command -v vhk >/dev/null 2>&1 && vhk standup --if-stale',
    powershell: 'if (Get-Command vhk -ErrorAction SilentlyContinue) { vhk standup --if-stale }',
  }
}
