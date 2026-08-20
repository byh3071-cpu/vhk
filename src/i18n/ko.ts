import { STACK_CANDIDATE_LABEL } from '../lib/stack-state.js'

export const ko = {
  stats: {
    title: '통계 대시보드',
    ledger: '증거 원장:',
    blockRate: 'AI 행동 차단율:',
    applyRate: '진화 결정 채택률:',
    noActions: '데이터 없음 (action-ledger 미연동 — Goal 55 머지 후 집계)',
    nextMessage: '집계 확인 완료! 증거를 더 쌓으려면 검증을 실행하세요.',
    nextCursor: '검증 실행해줘',
    trendTitle: 'receipt 추세 (완료 보고 검증 판정 추이)',
    trendNoData: '측정 데이터 없음 — vhk receipt 를 반복 발행하면 추세가 쌓입니다.',
    trendNextMessage: '추세는 receipt 발행이 누적될수록 정밀해집니다.',
    trendNextCursor: 'receipt 발행해줘',
    autonomyTitle: '자율 완주율 (autonomy-run):',
    autonomyNoData: '표본 없음 — vhk autonomy-log / overnight 런 누적 필요 (0%로 위장하지 않음)',
    bottleneckTitle: '병목 계측 (Goal 111 — PR 사람 반응·아침 이월):',
  },
  loop: {
    tickTitle: 'loop tick — 자가진화 조율 (읽기 전용)',
    closed: '닫힌 것:',
    watch: '주의:',
    nextMove: '다음 한 수:',
    nextMessage: '읽기 전용 조율 — 실행은 사람이 결정합니다.',
    nextCursor: '다음 한 수 실행해줘',
  },
  status: {
    title: '프로젝트 상태',
    notGitRepo: 'Git 저장소가 아니에요. 먼저 git init을 실행하세요.',
    branch: '브랜치:',
    changes: '변경:',
    recentCommits: (n: number) => `최근 커밋 (${n}):`,
    noCommits: '커밋 없음',
    remote: '원격:',
    noUpstream: 'upstream 없음',
    inSync: '동기화됨',
    ahead: (n: number) => `↑${n} ahead`,
    behind: (n: number) => `↓${n} behind`,
    package: 'package.json:',
    noPackage: 'package.json 없음',
    unstarted: (count: number) => `아직 시작하지 않은 작업 ${count}개`,
    oldestUnstarted: (id: number, title: string, days: number) =>
      `가장 오래된 작업: #${id} ${title} · ${days}일 전 등록`,
    detached: '(detached HEAD)',
    unknownBranch: '(알 수 없음)',
    nextWithChangesMessage: '변경사항이 있어요. 먼저 무엇이 바뀌었는지 확인하세요.',
    nextWithChangesCursor: '뭐 바뀌었어?',
    nextWithChangesAlt: '확인했으면 vhk save 로 저장하세요',
    nextCleanMessage: '클린 상태! 다음 미션으로 넘어가세요.',
    nextCleanCursor: '다음 목표 알려줘',
    // Goal 84: 신규(초기) 레포 — 활성 레포의 "다음 미션" 대신 온보딩 안내.
    nextNewRepoMessage: '환경 준비됐어요. 새 프로젝트를 시작해보세요.',
    nextNewRepoCursor: '프로젝트 만들어줘',
  },
  save: {
    title: '저장하기',
    notGitRepo: 'git 저장소가 아닙니다. 먼저 git init을 실행하세요.',
    noChanges: '저장할 변경사항이 없습니다.',
    filesHeader: (n: number) => `변경된 파일 (${n}개):`,
    commitMessage: '커밋 메시지 (Enter로 기본값 사용):',
    saving: '저장 중...',
    pushing: '원격 저장소에 올리는 중...',
    successWithPush: '저장 + 원격 업로드 완료!',
    successLocal: '로컬 저장 완료!',
    noRemote: '원격 저장소가 설정되지 않아 push를 건너뛰었습니다.',
    failed: '저장 실패',
    stagedAfterFail:
      '커밋은 실패했지만 파일은 스테이징되어 있습니다. 확인: git status / 취소: git reset HEAD',
    securityWarnHeader: '저장 전 보안 확인:',
    secretsFound: (n: number) => `코드에서 CRITICAL/HIGH 시크릿 패턴 ${n}건 감지`,
    secretsConfirm: '그래도 커밋·push를 진행할까요?',
    cancelled: '저장을 취소했습니다.',
    pushFailed: 'push 실패 (로컬 커밋은 완료됨)',
    commitOkPushFailed: '로컬 커밋은 됐지만 원격 push에 실패했습니다. git push를 직접 확인하세요.',
    done: (n: number) => `${n}개 파일 저장 완료!`,
    doneLocalOnly: (n: number) => `${n}개 파일 로컬 저장됨 (push는 실패)`,
    nextOkMessage: '저장 완료! 오늘 작업을 정리해두면 좋아요.',
    nextOkCursor: '오늘 한 일 정리해줘',
    nextPushFailMessage: '커밋은 됐지만 push 실패. 원격을 확인하세요.',
    nextPushFailCursor: '왜 push 실패인지 알려줘',
  },
  undo: {
    title: '되돌리기',
    notGitRepo: 'git 저장소가 아닙니다.',
    noCommits: '되돌릴 커밋이 없습니다.',
    recentHeader: '📋 최근 커밋:',
    howMany: '몇 개의 커밋을 되돌릴까요?',
    nonTtyHint: '비대화형 모드 — 되돌릴 커밋 수 선택이 필요합니다. TTY 터미널에서 vhk undo 를 실행하세요.',
    alreadyPushed: '이 커밋은 이미 원격에 올라갔습니다. 되돌리면 충돌이 생길 수 있어요.',
    noUpstreamWarning:
      'upstream 브랜치가 없습니다. 이미 push한 커밋일 수 있어요. 되돌린 뒤 force push가 필요할 수 있습니다.',
    confirmMessage: '최근 커밋을 되돌리시겠습니까?',
    confirmRisky: (n: number) =>
      `⚠️ 위험: 최근 ${n}개 커밋을 soft reset합니다. 원격과 어긋날 수 있습니다. 계속할까요?`,
    cancelled: '취소됨',
    success: '되돌리기 완료! 변경사항은 그대로 남아있습니다.',
    stagedHint: '변경사항은 스테이징 영역에 남아 있어요.',
    rootCommit: '첫 커밋만 있어서 더 되돌릴 수 없습니다.',
    forcePushHint:
      '원격과 맞추려면: git push --force-with-lease (혼자 작업한 브랜치에서만, 팀과 합의 후)',
    failed: '되돌리기 실패',
    nextMessage: '변경사항이 스테이징 영역에 남았어요. 메시지 고쳐서 다시 저장하세요.',
    nextCursor: '커밋 메시지 바꿔서 저장해줘',
  },
  diff: {
    title: '변경사항 확인',
    notGitRepo: 'git 저장소가 아닙니다.',
    noChanges: '변경사항 없음! 깨끗합니다.',
    stagedHeader: '📦 커밋 대기 (staged):',
    unstagedHeader: '✏️  수정됨 (unstaged):',
    untrackedHeader: (n: number) => `➕ 새 파일 (${n}개):`,
    summaryHeader: '📊 총 변경 요약 (작업 트리 vs HEAD)',
    filesLine: (n: number) => `파일: ${n}개`,
  },
  start: {
    title: '🚀 VHK 새 프로젝트 시작 마법사',
    intro: '5단계로 자동 진행됩니다:',
    step1: '1) git 저장소 초기화',
    step2: '2) 프로젝트 문서 생성 (vhk init)',
    step3: '3) AI 도구 규칙 동기화 (vhk sync → AGENTS.md 등)',
    step4: '4) Cursor MCP 등록 (vhk mcp-init)',
    step5: '5) AI 컨텍스트 생성 (vhk context)',
    confirmStart: '계속할까요?',
    cancelled: '취소했어요. 다음에 다시 vhk start를 실행하세요.',
    step1Header: '[1/5] git 저장소 초기화',
    step2Header: '[2/5] 프로젝트 문서 생성',
    step3Header: '[3/5] AI 도구 규칙 동기화',
    step4Header: '[4/5] Cursor MCP 등록',
    step5Header: '[5/5] AI 컨텍스트 생성',
    gitAlreadyInit: '이미 git 저장소입니다. 건너뜁니다.',
    gitInitDone: 'git 저장소 초기화 완료',
    allDone: '🎉 모든 단계 완료!',
    nextHintMessage: '프로젝트 시작 준비 끝! 이제 개발을 시작하세요.',
    nextHintCursor: 'docs/PRD.md 보고 개발 시작해줘',
    goalInitHint: '💡 goal 단계 체계(goals/·docs/state/)가 필요하면 vhk goal init 으로 언제든 추가할 수 있어요 (선택).',
  },
  injectBootstrap: {
    confirm: 'tier S harness (ecosystem.mdc · CORE-RULES · context seed · mcp.json.example) 설치할까요?',
    cancelled: '취소했어요.',
    created: '.cursor/rules/ecosystem.mdc 생성 완료',
    updated: '.cursor/rules/ecosystem.mdc 갱신 완료',
    unchanged: 'ecosystem.mdc 가 이미 최신입니다.',
    skipped: '기존 ecosystem.mdc 가 vhk 템플릿이 아닙니다 — 건너뜀',
    itemCreated: '생성 완료',
    itemUpdated: '갱신 완료',
    itemUnchanged: '이미 최신',
    itemSkipped: '건너뜀 (커스텀 파일 — --force)',
    retryHint: '덮어쓰려면: vhk inject-bootstrap --force',
    nextHint: 'tier S harness bootstrap 완료',
  },
  gate: {
    title: '💡 아이디어 검증',
    welcome: '새 아이디어를 검증합니다. 질문에 답해주세요.',
    modePrompt: '어떻게 검증할까요?',
    modeQuickLabel: '⚡ 짧게 (핵심 5문항) — 막 떠올랐을 때',
    modeFullLabel: '🔍 자세히 (13문항) — 기획이 어느 정도 잡혔을 때',
    modeSkipLabel: '⏭️ 건너뛰기 — 노션·문서에 이미 기획해 둠',
    skipSourcePrompt: '📄 기획 문서 위치 (노션 주소, 파일 경로 등):',
    skipGo: '✅ 시작해도 돼요! 이제 프로젝트를 만들어 보세요 (vhk init)',
    skipSourceLabel: (source: string) => `기획 문서: ${source}`,
    quickHeader: '⚡ 짧은 검증',
    fullHeader: '🔍 자세한 검증',
    modeCountSuffix: (total: number) => `— ${total}문항`,
    idea: '💡 어떤 걸 만들 건가요? (한 줄)',
    ideaHint: '예: "팀 할 일을 3초에 추가하는 앱"',
    painPoint: '😤 이 문제, 누가 얼마나 아파해요?',
    painPointHint: '예: "매일 엑셀에 복붙하느라 30분씩 날림"',
    edge: '💪 나만의 강점은? (비슷한 게 있는데 왜 이걸?)',
    edgeHint: '예: "한국어로 된 가이드 + 바로 쓰는 템플릿"',
    checklistStart: '─── 이어서 질문합니다 ───',
    hintPrefix: '  💡',
    verdictPrompt: (_failIf: string) => '  → 지금 상태는?',
    statusPassChoice: '✅ 괜찮아요',
    statusHoldChoice: '🟡 아직 모르겠어요 (나중에 채워도 됩니다)',
    statusFailChoice: '🔄 범위를 줄여볼게요',
    statusPassLine: '  ✅ 괜찮아요',
    statusHoldLine: '  🟡 보류 — 개발하면서 채워도 됩니다',
    statusFailLine: '  🔄 범위 조정이 필요해 보여요',
    verdictTitle: '═══ 결과 ═══',
    ideaLabel: '만들 것:',
    painPointLabel: '아픈 점:',
    edgeLabel: '나만의 강점:',
    countLine: (failCount: number, holdCount: number, total: number) =>
      `범위 조정 ${failCount}개 · 보류 ${holdCount}개 / ${total}문항`,
    go: '✅ 시작해도 돼요! 다음 단계(프로젝트 만들기)로 넘어가세요.',
    refine: '🔄 조금 더 다듬으면 좋겠어요. 위 항목을 보완해 보세요.',
    drop: '💡 다른 아이디어를 검토해 보는 건 어떨까요?',
    nextCommand: '다음: vhk init (프로젝트 시작하기)',
    holdRemainHint: '💡 보류한 항목은 개발하면서 채워도 괜찮아요.',
    failMessage: '아직 모르겠어요 → 괜찮아요, 개발하면서 채워도 됩니다.',
  },
  init: {
    title: '🛠️ 프로젝트 시작하기',
    skipGate: '⏭️ 1단계(아이디어 검증) 건너뛰기 — 기획·설계가 이미 있어요',
    projectName: '📦 프로젝트 이름은?',
    projectNameHint: '예: "팀 할 일 앱"',
    description: '📝 한 줄로 설명하면?',
    descriptionHint: '예: "3초 만에 할 일 추가"',
    projectType: '🏗️ 어떤 종류인가요?',
    confirmStack: '이 기술 스택을 확정할까요?',
    stackInput: '🧱 기술 스택은? (쉼표로 구분, Enter = 건너뛰고 나중에 확정)',
    stackEdit: '🧱 사용할 기술 스택을 직접 입력하세요 (쉼표로 구분, Enter = 취소)',
    stackSkipHint: `기술 스택 미정 — ${STACK_CANDIDATE_LABEL} 상태로 기록합니다`,
    canceled: '취소했어요. 기술 스택을 바꾸려면 다시 vhk init을 실행하세요.',
    candidateStack: `기술 스택 ${STACK_CANDIDATE_LABEL}:`,
    confirmedStack: '기술 스택 확정:',
    emptyStack: '--stack에 유효한 기술 스택이 없습니다. 감지·기본값으로 찾은 스택을 후보로 기록하고, 못 찾으면 미정으로 둡니다.',
    filesGenerating: '📂 필관리자 파일 만드는 중...',
    overwrite: (filePath: string) => `  ⚠️ ${filePath} 파일이 있어요. 덮어쓸까요?`,
    skipped: (filePath: string) => `${filePath} — 건너뜀`,
    done: '🎉 프로젝트 뼈대가 준비됐어요!',
    nextSteps: '다음에 할 일:',
    fillHint: 'CLAUDE.md · RULES.md의 프로젝트 설명·기술 스택이 맞는지 확인하세요 (첫 세션을 열면 AI가 도메인 규칙을 인터뷰로 채워줘요)',
    prdHint: 'docs/PRD.md에 1차 버전에 넣을 기능·빼는 기능을 적어 보세요',
    notionFetching: '📡 노션 기획 페이지 불러오는 중...',
    notionDone: (name: string) => `노션에서 가져오기 완료: ${name}`,
    notionReviewHint: 'docs/PRD.md를 읽고 비어있는 항목을 채우세요',
    gitHintLabel: '터미널에 복사할 명령 (아래 박스 복붙):',
    // vhk init 을 git init 뒤에 한 번 더: 기록 집행 훅(.git/hooks/commit-msg, RFC 0061)은 .git 이
    // 있어야 배선된다. git 없이 init 한 사용자가 이 명령을 복붙하면 재실행으로 훅이 자동 배선돼
    // 첫 커밋부터 세션일지 집행이 걸린다(도그푸딩 P1: 재실행 안내 부재로 집행 그물을 통째로 놓침).
    gitHintCommand: 'git init && vhk init && git add . && git commit -m "feat: 프로젝트 시작"',
    startDev: '이제 개발해 보세요! 🚀',
    commandsMdDone: '📋 COMMANDS.md 생성',
    scriptsDone: '📦 package.json scripts 추가',
    ciCreated: (workflowPath: string) => `${workflowPath} 생성 — PR 검사 준비 완료`,
    ciExisting: (workflows: string[]) =>
      `기존 GitHub Actions 워크플로 보존: ${workflows.join(', ')} — VHK Gate 단계를 기존 파일에 병합하세요.`,
    ciMergeHeader: '기존 job에 아래 명령을 실패 허용 없이 순서대로 추가하세요:',
    ciMergeCommands: (version: string) => [
      `npx --yes @byh3071/vhk@${version} verify`,
      `npx --yes @byh3071/vhk@${version} sync --check`,
      `npx --yes @byh3071/vhk@${version} check`,
      `npx --yes @byh3071/vhk@${version} secure scan`,
      'npm run boundary:check --if-present',
    ],
    ciRequiredCheckHint: 'GitHub 저장소 Settings → Rules에서 상태 검사 “VHK Gate”를 필수로 지정하세요.',
    ciInstallFailed: (message: string) => `PR 검사 파일을 만들지 못했습니다: ${message}`,
    gitignoreCreated: '🔒 .gitignore 생성 (.env·node_modules·dist 제외)',
    gitignoreUpdated: '🔒 .gitignore 보강 (누락 항목 추가)',
    customizationMarkerDone: '🎯 .vhk/NEEDS_CUSTOMIZATION 생성 — 첫 세션에서 도메인 인터뷰 자동 트리거',
    customizationHookWired: '🪝 .claude/settings.json SessionStart 훅 배선 (커스터마이징 트리거)',
    customizationHookSkipped: '⚠️  .claude/settings.json 파싱 실패 — SessionStart 훅 배선 건너뜀(기존 파일 보존).',
    cursorHookWired: '🪝 .cursor/hooks.json sessionStart 훅 배선 (Cursor 에서도 커스터마이징 트리거 자동)',
    cursorHookFailed: '⚠️  .cursor/hooks.json 배선 실패 — 건너뜀(Cursor 미사용이면 무시).',
    recordHookWired: '🪝 .git/hooks/commit-msg 기록 집행 훅 배선 — 세션일지 없는 코드 커밋 차단([skip-record] 우회 가능)',
    recordHookRespected: '⚠️  기존 commit-msg 훅 발견(vhk 소유 아님) — 보존하고 기록 집행 훅 배선 건너뜀. 통합하려면 기존 훅에 node .vhk/hooks/record-check.mjs 호출을 추가하세요.',
    recordHookNoGit: '⚠️  기록 집행 훅 미배선 — git 저장소가 없거나 worktree/bare 저장소입니다. 일반 저장소면 git init 후 vhk init 재실행 시 자동 배선됩니다.',
    recordHookHooksPath: '⚠️  core.hooksPath 설정 감지(husky 등) — .git/hooks 는 git 이 무시하므로 기록 집행 훅 미배선. 해당 훅 디렉터리의 commit-msg 에 node .vhk/hooks/record-check.mjs 호출을 수동 추가하세요.',
    recordHookFailed: '⚠️  기록 집행 훅 배선 실패(선택 기능 — init 은 계속):',
    coreRulesBundledWarn: (version: string) => {
      const v = version === 'unknown' ? '버전 확인 안 됨' : `v${version}`
      return (
        `사용자 규칙 파일이 없어 core-rules가 번들 스냅샷(${v})으로 사용되고 있어요. ` +
        `별도 규칙을 사용하려면 VHK_RULES_FILE을 설정하거나 ` +
        `vhk inject-bootstrap --force 를 실행하세요. 이 명령은 ecosystem.mdc 등 다른 tier-S 파일도 최신 템플릿으로 되돌릴 수 있어요 — ` +
        `직접 손으로 고친 적 있으면 먼저 git status로 확인하세요. ` +
        `재시작 없이 적용하려면 vhk config set-rules-file <HOME>/sample-rules.yaml을 실행하세요.`
      )
    },
    adoptPrompt: (n: number, list: string) =>
      `📥 기존 규칙 파일 ${n}개 발견 (${list}). RULES.md로 가져올까요?`,
    adoptPreview: (n: number) =>
      `기존 규칙 ${n}개를 RULES.md 표준 섹션으로 병합했어요 (출처 주석 포함).`,
    adoptIntegrityFailed: (detail: string) =>
      `기존 규칙을 가져오지 않았습니다 — ${detail}`,
    adoptDone: '📥 RULES.md — 기존 규칙 adopt 완료',
    missionScaffold: '🎯 .vhk/mission.json 생성 (작업 계약 뼈대 — vhk mission set 으로 목표·범위 채우기)',
    missionScaffoldFailed: '⚠️  .vhk/mission.json 생성 실패 (권한 확인) — 작업 계약 없이 계속합니다:',
    missionScaffoldCorrupt: '⚠️  .vhk/mission.json 이 손상된 것 같아요 — vhk mission set 으로 다시 만드세요 (덮어쓰지 않았습니다).',
  },
  recap: {
    title: '📝 오늘 한 일 정리',
    analyzing: '📊 오늘 바뀐 파일·커밋을 살펴보는 중...',
    noRepo: '❌ Git 저장소가 아니에요. 먼저 git init을 실행하세요.',
    noChanges: '⚠️ 오늘 바뀐 내용이 없어요.',
    summary: '📝 이번에 뭘 했나요? (1~3줄)',
    summaryHint: '예: "로그인 화면 만들고 버튼 색 고침"',
    decisions: '🧭 정한 결정이 있나요? (없으면 Enter)',
    nextTodo: '⏭️ 다음에 할 일은?',
    blockers: '🚧 막힌 게 있나요? (없으면 Enter)',
    done: '✅ 오늘 기록을 저장했어요!',
    updateClaude: 'CLAUDE.md "지금 상태"도 같이 고칠까요?',
    adrDetected: '📐 쓰는 기술·설정이 바뀐 것 같아요!',
    createAdr: '왜 그렇게 했는지 기록 문서를 만들까요?',
    troubleDetected: '🔧 버그·오류를 고친 커밋이 보여요!',
    createTroubleshoot: '어떻게 고쳤는지 메모를 남길까요?',
    // #288: 비-TTY(헤드리스 AI·파이프)·--yes 비대화형 경로 안내.
    notProvided: '_(미입력 — 비대화형 실행)_',
    nonInteractiveNote: '비대화형 모드 — 회고 본문은 --summary / --next / --decisions / --blockers 플래그로 채울 수 있어요 (미지정 항목은 "미입력"으로 기록).',
    detectSkipNonInteractive: '비대화형 모드 — 문서 자동 생성은 대화형(vhk recap)에서만. 위 후보를 참고해 직접 기록하세요.',
    workingTreeTitle: '📂 미커밋 변경 (working tree):',
    autoDirtySummary: (n: number, sample: string) =>
      `미커밋 변경 ${n}건${sample ? `: ${sample}${n > 5 ? ' …' : ''}` : ''}`,
  },
  bootstrapCursor: {
    title: '🚀 VHK Cursor bootstrap (설치 + 배선)',
    stepDoctor: '[1/6] vhk doctor',
    stepGoalMigrate: '[2/6] vhk goal migrate --dry-run',
    stepInject: '[3/6] vhk inject-bootstrap',
    stepMcp: '[4/6] vhk mcp-init',
    stepSync: '[5/6] vhk sync',
    stepSkills: '[6/6] Cursor skills 설치',
    stepVerify: '배선 검증 — vhk verify',
    skillsCreated: (names: string[]) => `Cursor skills 생성: ${names.join(', ')}`,
    skillsSkipped: (names: string[]) => `Cursor skills 이미 있음(건너뜀): ${names.join(', ')}`,
    done: '✅ Cursor bootstrap 완료',
    nextHint: 'goal/receipt/review/learn 루프를 vhk-gate skill 로 실행하세요.',
  },
  check: {
    rulesReadFailed: (message: string) => `RULES.md를 읽거나 해석하지 못했습니다: ${message}`,
    coverage: (checked: number, declared: number, percent: number) =>
      `검사 비율: ${checked}/${declared} (${percent.toFixed(1)}%)`,
    unchecked: (n: number) => `선언만(미검사): ${n}개`,
    bindingPassed: (id: string) => `연결 검사 통과: ${id}`,
    bindingInvalidId: (id: string) => `잘못된 검사 ID: ${id || '(비어 있음)'}`,
    bindingMultiple: '검사 연결 표시는 규칙 하나에 하나만 쓸 수 있습니다.',
    bindingMissing: (id: string) =>
      `검사 파일이 없습니다: scripts/check-rule-${id}.mjs 또는 .sh`,
    bindingFailed: (scriptPath: string) => `연결 검사 실패: ${scriptPath}`,
    title: '🔍 프로젝트 규칙 점검',
    noRules: '⚠️ RULES.md 파일이 없어요.',
    noAutoRules: '⚠️ 자동으로 검사할 규칙이 없어요.',
    allPassed: '🎉 규칙을 모두 지켰어요!',
    summary: '📊 점검 결과:',
    // #405: 'evals' 는 골든셋 채점기용 예약 서브명령 — 본체는 로드맵 goal G-B 에서 구현(현재 미구현).
    evalsTitle: '🚧 골든셋 채점기는 아직 미구현이에요 (로드맵 goal G-B).',
    evalsHint: '채점 기준은 docs/evals/golden-set.md 에 있어요 — 자동 채점은 goal G-B 에서 구현 예정이에요.',
    // #405: 미인식 인자는 규칙점검으로 조용히 빠지지(silent fallback) 않고 정직하게 안내.
    unknownTarget: (arg: string) => `알 수 없는 인자 '${arg}' — vhk check 는 RULES.md 규칙 점검 명령이에요.`,
    unknownHint: '인자 없이 `vhk check` 로 실행하면 규칙을 점검해요.',
  },
  doctor: {
    title: '🩺 개발 환경 점검',
    allOk: '🎉 개발 환경 준비 완료!',
    missing: '⚠️ 일부 도구가 없습니다.',
    missingHint: '위 안내를 따라 설치하세요.',
    warnSummary: (n: number) => `⚠️ 경고 ${n}개 — 위 권장 조치를 확인하세요 (필수는 아님)`,
    projectFiles: '📁 프로젝트 파일 확인:',
    envNotIgnored: '⚠️ .env가 .gitignore에 없음! 추가하세요',
    nextOkMessage: '환경 점검 통과! 이제 프로젝트를 시작하세요.',
    // Goal 84: 기존(활성) 레포 — 온보딩 대신 이어서 작업 안내(D9).
    nextEstablishedMessage: '환경 점검 통과 — 이어서 작업하세요.',
    nextEstablishedCursor: '이어서 작업할래',
    nextRetryMessage: '위 도구를 설치한 후 다시 점검하세요.',
    updateAvailable: (latest: string) =>
      `🆕 v${latest} 사용 가능 — npm i -g @byh3071/vhk`,
    updateCurrent: '최신 버전을 쓰고 있어요',
    driftTitle: '🔀 규칙·작업 안내 최신 상태 확인:',
    driftNoRules: '⬚ RULES.md 없음 — 규칙 불일치(drift) 점검 생략',
    driftRuleClean: '✅ 규칙 파일이 RULES.md와 일치',
    driftRuleWarn: (files: string) =>
      `⚠️ RULES.md와 맞지 않는 규칙 파일: ${files}`,
    driftExpected: (location: string, content: string) => `기대 (${location}): ${content}`,
    driftActual: (location: string, content: string) => `실제 (${location}): ${content}`,
    driftAction: '맞추기: vhk sync (전체 차이: vhk doctor --diff)',
    driftMissingLine: '(줄 없음)',
    driftEmptyLine: '(빈 줄)',
    driftSensitiveHidden: '[민감정보로 숨김]',
    driftGeneratedFile: 'RULES.md에서 생성될 규칙 파일',
    driftMissingFile: '(파일 없음)',
    driftDiffLimited: (files: string) =>
      `전체 차이 생략 (크기 제한, 첫 상이 지점만 표시): ${files}`,
    diffOption: '규칙 파일의 전체 차이 출력 (기본은 첫 상이 지점만)',
    driftContextWarn: '⚠️ 작업 맥락에 최신 변경사항이 반영되지 않았습니다.',
    driftContextAction: '갱신: vhk context',
    driftNextTaskWarn: '⚠️ 다음 작업 안내에 최신 변경사항이 반영되지 않았습니다.',
    driftNextTaskAction: '갱신: vhk goal next',
    goalSchemaTitle: 'Goal frontmatter',
    goalSchemaOk: (n: number) => `✅ goals/ ${n}개 goal 파싱 정상`,
    goalSchemaSkipped: (n: number) => `⚠️ 스키마 불일치로 무시된 goal 파일 ${n}개`,
    goalSchemaEmpty: (n: number) => `⚠️ goals/*.md ${n}개 있으나 파싱된 goal 0개 — type/id 누락 가능`,
    ecosystemMdcTitle: 'Ecosystem rule file',
    ecosystemMdcMissing: '⚠️ AGENTS.md references .cursor/rules/ecosystem.mdc but file is missing',
  },
  preflight: {
    title: '🛫 Preflight — 출고 전 안전점검',
    resultBlocked: (n: number) => `결과: 차단 — 치명 실패 ${n}개. 고친 뒤 다시 실행하세요.`,
    resultPass: (warn: number) => (warn > 0 ? `결과: 통과 (경고 ${warn})` : '결과: 통과'),
    nextBlocked: '치명(🔴) 항목을 수정한 뒤 다시 실행하세요.',
    nextPass: 'publish/PR 진행 가능',
  },
  standup: {
    title: (d: string) => `🌅 Standup — ${d}`,
    yesterday: '📌 어제 한 일',
    noHistory: '이전 기록 없음 — 첫 세션이거나 신규 repo',
    todayRecommend: '🎯 오늘 추천',
    unresolved: '⚠️ 미해결',
    commitsLine: (n: number) => `커밋 ${n}개`,
  },
  today: {
    title: (d: string) => `🎉 Today — ${d}`,
    done: '✅ 해낸 것',
    commits: (n: number) => `커밋 ${n}개`,
    doneGoals: (n: number) => `완료 goal ${n}개`,
    devlogs: (n: number, m: number) => (m > 0 ? `Dev Log ${n}건 (교훈 ${m}개)` : `Dev Log ${n}건`),
    restDay: '오늘은 기록이 없네 — 쉬어가는 것도 하루.',
    restEncourage: '쉬는 것도 페이스의 일부. 내일 또.',
  },
  // Goal 86 (RFC 0056 T1): 검증 리포트 — 에이전트 "됐어요"를 기계 증거로 판정 (용어: ADR-011).
  receipt: {
    title: '검증 리포트',
    noCommit: 'git 커밋을 찾을 수 없습니다 — 작업시작 기준선을 기록하려면 커밋이 1개 이상 필요합니다.',
    markStartDone: '작업시작 기준선 SHA 기록 완료 (이후 stale 비교 기준):',
    nextBlockMessage: '🔴 기계증거가 "됐어요"와 모순 — 아직 완료 아님. 막힌 증거(red/dirty/stale/forbidden)부터 고치세요:',
    learnBlockHint: 'receipt BLOCK — 막힌 증거 원인과 재발방지',
    nextCautionMessage: '🟡 실차단은 없으나 약신호 있음(수동 확인 권장). 보강 후 다시 떼세요:',
    nextPassMessage: '🟢 게으른 허위 완료 보고 징후 없음(미묘한 오류는 못 잡음). 완료 처리하려면:',
    // Goal 87 방향 2-1: glob 미지원 문법 경고 — 거짓 안전을 caution 으로 드러냄.
    unsupportedForbiddenGlob: (n: number) =>
      `forbidden 패턴 ${n}개에 미지원 glob 문법(!, {}, [], 후행 /) — 해당 forbidden 검증 무효. 지원: *, **, ?`,
    // Goal 87 방향 3-④: 작업시작 기준선 SHA 가 실제 커밋이 아님(위조·오타·다른 레포) — 무효 처리(거짓 stale 방지).
    invalidBaseSha: (sha: string) =>
      `작업시작 기준선 SHA(${sha})가 이 레포의 커밋이 아닙니다 — 무효 처리(stale 판정 제외). vhk receipt --mark-start 로 다시 고정하세요.`,
  },
  worktree: {
    checkTitle: '🌳 Worktree env 점검',
    addTitle: (b: string) => `🌳 Worktree 생성: ${b}`,
    ready: '✅ ready',
    needBranch: '브랜치명이 필요합니다 — 예: vhk worktree add feat/login',
    abortedExists: (p: string) => `🛑 이미 존재 — 중단(덮어쓰기 안 함): ${p}`,
    gitFailed: (d: string) => `❌ git worktree add 실패: ${d}`,
    installSkipped: 'node_modules 없음 → pnpm install (또는 --install 로 자동)',
  },
  nlp: {
    matched: '이게 맞나요?',
    notMatched: '무슨 뜻인지 모르겠어요. vhk를 입력하면 메뉴에서 선택할 수 있습니다.',
    menuHint: 'vhk를 입력하면 메뉴에서 선택할 수 있습니다.',
    evolveExplanation: '현재 진화 후보 확인 (vhk evolve list) — 반영·되돌리기는 직접 실행',
  },
  // RFC 0066 §8 — vhk policy. 세 서브커맨드 전부 읽기 전용이고 원장에 기록하지 않는다.
  policy: {
    levelTitle: '🔐 자율 실행 권한 단계',
    riskTitle: '⚖️  변경 위험도',
    showTitle: '🔐 권한 정책',
    currentLevel: (level: string, reason: string): string =>
      `현재 단계: ${level}  (사유: ${reason})`,
    previousLine: (to: string | null, judged: number | null): string =>
      to === null
        ? '직전 전이: 없음 — 원장이 비어 시작 단계로 계산했습니다'
        : `직전 전이: ${to} (표본 ${judged ?? 0}회 시점)`,
    // 조회로는 승급하지 않으므로 무엇을 기다려야 하는지 보여준다.
    nextPromotion: (
      judged: number,
      lastJudged: number,
      failures: number | null,
      maxFailures: number,
    ): string =>
      judged <= lastJudged
        ? `다음 승급 조건: 판정 대상 런이 더 필요합니다 (현재 ${judged}회 — 직전 전이와 같음)`
        : failures === null
          ? `다음 승급 조건: 표본 부족 (현재 ${judged}회). 창이 찰 때까지 단계는 유지됩니다`
          : `다음 승급 조건: 최근 창 실패 ${failures}회 / 허용 ${maxFailures}회 이하`,
    riskLine: (risk: string, kind: string): string =>
      risk === 'human'
        ? `판정: 사람 확인 필요 (유형 ${kind})`
        : `판정: 자동 허용 범위 (유형 ${kind})`,
    riskBreakdown: (total: number, unclassified: number): string =>
      `검사 경로 ${total}개 · 미분류 ${unclassified}개`,
    unclassifiedHint:
      '⚠️  미분류 경로가 있어 사람 확인이 필요합니다 — 규칙을 넓히기 전에 왜 빠졌는지 먼저 보세요',
    flags: (record: boolean, enforce: boolean): string =>
      `기록: ${record ? '켜짐' : '꺼짐'} · 집행: ${enforce ? '켜짐' : '꺼짐'}`,
    maxLevelLine: (maxLevel: string | null): string =>
      maxLevel === null ? '사람이 지정한 상한: 없음' : `사람이 지정한 상한: ${maxLevel}`,
    configFailClosed: (reason: string): string =>
      `정책 설정을 신뢰할 수 없습니다 (${reason}) — 자율 레인은 전부 거부됩니다. 사람이 실행하는 명령은 영향 없습니다.`,
    baselineMutated:
      '정책 설정이 고정해둔 내용과 다릅니다 — 자율 레인은 전부 거부됩니다. 의도한 변경이면 베이스라인을 다시 고정하세요.',
    nextStepLevel: '설정과 위험도까지 한 번에 보려면:',
    nextStepRisk: '권한 단계와 설정까지 한 번에 보려면:',
  },

  secure: {
    title: '🔒 비밀번호·키 유출 검사',
    noGitignore: '⚠️ .gitignore 파일이 없어요!',
    noEnvInGitignore: '⚠️ .gitignore에 .env가 없어요!',
    scanning: '🔍 파일을 살펴보는 중...',
    clean: '🎉 비밀번호·키가 코드에 보이지 않아요!',
    summary: '📊 검사 요약:',
    draftTitle: '🔒 발행물 초안 보안 검사 (게시 전 게이트 · #457)',
    draftClean: '🎉 초안에 비밀번호·키가 보이지 않아요 — 게시해도 좋은 신호입니다.',
    draftSevere: '🚨 초안에 유출 위험이 있어요 — 아래 항목을 지우거나 가린 뒤 다시 스캔하세요. 통과 전에는 게시 금지.',
    draftIncomplete: '⚠️ 스캔이 안 됐거나 불완전해요(파일 없음·미검사 구간) — 통과가 아닙니다. 경로를 확인하고 다시 스캔하세요.',
  },
  sync: {
    title: '🔄 규칙 파일 맞추기',
    coreRulesFallback:
      '⚠️  지정한 규칙 원본 대신 VHK 내장 기본 규칙으로 동기화했습니다 — 지정한 규칙은 반영되지 않았어요. '
      + '경로를 고치고 다시 실행하려면 vhk config set-rules-file <경로> 를 쓰세요.',
    noRules: '⚠️ RULES.md 파일이 없어요.',
    // Goal 63 — sync --check (검사 전용)
    checkNoRules: '⚠️ RULES.md 없음 — 검사 비적용 통과',
    checkDrift: (p: string) => `↯ ${p} — 생성본과 다름 (직접 수정 또는 sync 미실행)`,
    checkMissing: (p: string) => `∅ ${p} — 파일 없음 (sync 가 생성할 타겟)`,
    checkSectionMissing: (target: string, section: string) =>
      `∅ ${target} — 필수 섹션 「${section}」 누락`,
    checkDriftSummary: (n: number) =>
      n === 0 ? '✅ 재생성 결과 불일치 0건' : `❌ 재생성 결과 불일치 ${n}건`,
    checkFileMissingSummary: (n: number) =>
      n === 0 ? '✅ 타겟 파일 누락 0건' : `❌ 타겟 파일 누락 ${n}건`,
    checkSectionMissingSummary: (n: number) =>
      n === 0 ? '✅ 필수 섹션 누락 0건' : `❌ 필수 섹션 누락 ${n}건`,
    checkFail: (n: number) => `❌ 동기화 문제 ${n}건 — \`vhk sync\` 로 재전파하세요 (직접 편집 금지)`,
    // 미연결 섹션은 차단 대상이 아니지만 조용하면 안 된다 — AGENTS.md의 기타 규칙 외에는 빠진다.
    checkUnmappedClean: '🧩 미연결 섹션 0건 — 모든 RULES.md 섹션에 자동 연결 기준이 있음',
    checkUnmapped: (titles: string[], standardTitles: string[]) =>
      `🧩 미연결 섹션 ${titles.length}건 — RULES.md와 AGENTS.md 「기타 규칙」에는 남지만 전용 규칙 파일에는 자동 연결되지 않습니다: ${titles.join(', ')}` +
      `\n     인식하는 표준 제목(제목에 아래 말 중 하나 포함): ${standardTitles.join(' · ')}` +
      `\n     해결: 제목에 맞는 표준 말을 넣거나, 모든 규칙 파일에 보내려면 제목 뒤에 <!-- vhk:sync=all -->을 붙이세요.`,
    driftDocsTitle: (n: number) => `📡 문서-실측 불일치(drift) ${n}건 (warn — RFC 0062)`,
    driftDocsClean: '📡 문서-실측 불일치(drift) 없음 (RFC 0062 warn 검사)',
    driftDocsWarnNote: 'warn 모드 — 차단하지 않습니다. 문서를 실측에 맞게 고치거나, 오탐이면 그대로 두세요(오탐률 계측 중).',
    driftDocsError: (msg: string) => `(문서 불일치(drift) 검사 내부 오류 — 건너뜀: ${msg})`,
    cursorrulesDone: '✅ .cursorrules 맞춤 완료',
    claudeDone: '✅ CLAUDE.md 맞춤 완료',
    windsurfDone: '✅ .windsurfrules 맞춤 완료',
    copilotDone: '✅ .github/copilot-instructions.md 맞춤 완료',
    antigravityDone: '✅ .agents/rules/vhk-rules.md 맞춤 완료',
    agentsDone: '✅ AGENTS.md 맞춤 완료',
    geminiDone: '✅ GEMINI.md 맞춤 완료',
    clineDone: '✅ .clinerules/vhk-rules.md 맞춤 완료',
    antigravityTruncated: 'Antigravity 12,000자 제한으로 일부 절삭됨 — 전체는 RULES.md 참조',
    done: '🔄 맞추기 완료!',
    // 안전 가드 (배치 0) — 덮어쓰기 전 백업·불일치(drift) 확인·미리보기
    backupSaved: (n: number, id: string) =>
      `🛟 덮어쓰기 전 ${n}개 파일 백업함 → .vhk/backups/${id} (복원: vhk restore)`,
    firstSync: '🛟 첫 sync — 기존 파일을 백업한 뒤 생성합니다.',
    driftWarn: (p: string) =>
      `⚠️ ${p} 가 RULES.md 생성본과 다릅니다 (직접 수정했을 수 있어요).`,
    driftConfirm: (n: number) =>
      `위 ${n}개 파일의 기존 내용을 덮어쓸까요? (백업은 이미 저장됨)`,
    skipped: (p: string) => `⏭️  건너뜀: ${p} (덮어쓰기 거부 — 백업만 보관)`,
    dryRunHeader: '🔎 미리보기 (--dry-run) — 실제 파일 변경 없음',
    itemState: (p: string, state: 'created' | 'updated' | 'unchanged') => {
      const label = state === 'created' ? '✚  생성됨' : state === 'updated' ? '✏️  변경됨' : '·  동일'
      return `  ${label} : ${p}`
    },
    nonTtyAuto: (n: number, id: string) =>
      `🤖 비대화형(CI/에이전트) — ${n}개 백업 후 진행. 복원: vhk restore ${id}`,
    // 배치1 — CLAUDE.md 를 vhk 마커(<!-- vhk:rules:start/end -->) 형식으로 1회 정리할 때의 안내.
    // 사용자 섹션은 보존, RULES.md 기준 옛 자동생성 섹션만 재생성 교체(조용한 드롭 방지).
    claudeMigrated: (preserved: string[], removed: string[]) =>
      `ℹ️  CLAUDE.md 를 vhk 마커 형식으로 정리했어요 — 마커 밖 사용자 섹션은 보존됩니다.` +
      (preserved.length
        ? `\n     보존된 사용자 섹션 ${preserved.length}개: ${preserved.join(', ')}`
        : '') +
      (removed.length
        ? `\n     RULES.md 기준으로 재생성·교체된 옛 자동생성 섹션 ${removed.length}개: ${removed.join(', ')} (필요 시 .vhk/backups 에서 복구)`
        : ''),
  },
  restore: {
    title: '🛟 백업 복원',
    notGitNote: '백업은 .vhk/backups/ 의 로컬 복사본에서 복원됩니다 (git 무관).',
    noBackups: '복원할 백업이 없습니다. (vhk sync 가 덮어쓰기 전 자동 생성)',
    selectPrompt: '복원할 백업을 선택하세요:',
    listHeader: '📋 사용 가능한 백업 (최신순):',
    restored: (n: number, id: string) => `✅ ${n}개 파일 복원 완료 (백업 ${id})`,
    notFound: (id: string) => `❌ 백업을 찾을 수 없습니다: ${id}`,
    nonTtyHint: '비대화형 모드 — 복원할 백업 id 를 인자로 지정하세요: vhk restore <id>',
    cancelled: '복원 취소됨',
  },
  cloud: {
    pushTitle: '☁️ .vhk 클라우드 백업 (gist 올리기)',
    pullTitle: '☁️ .vhk 클라우드 복원 (gist 내리기)',
    noGh: 'gh CLI 가 설치되어 있지 않습니다.',
    noAuth: 'gh 인증이 필요합니다 (gist 권한).',
    noVhkDir: '.vhk/ 폴더가 없습니다. vhk init 또는 vhk context 를 먼저 실행하세요.',
    nothingToSync: '백업할 파일이 없습니다 (.vhkignore 로 모두 제외됨).',
    noGistId: '복원할 gist id 가 없습니다.',
    pushDone: '✅ 클라우드 백업 완료',
    pullDone: '✅ 클라우드 복원 완료',
    pushFail: '❌ 백업 실패',
    pullFail: '❌ 복원 실패',
    flatOnlyWarn: (dirs: string) =>
      `⚠️  평면 파일만 백업됩니다 — 하위 폴더(${dirs})는 제외 (spec v1). 그 안의 파일(예: evolve/queue.json)은 로컬에만 남습니다.`,
  },
  ship: {
    title: '🚀 배포 체크리스트',
    checklist: '📋 배포 전 체크리스트',
    retro: '🔍 배포 회고',
    buildLogCreated: '✅ 빌드 로그 생성 완료',
    buildLogDone: (rel: string) => `✅ 빌드 로그 생성 완료: ${rel}`,
    questionWell: '잘된 점은?',
    questionWrong: '어려웠던 점은?',
    questionLearned: '배운 점은?',
    questionNext: '다음 버전에서 할 것은?',
    checkboxPrompt: '완료한 항목을 선택하세요:',
    incompleteHeader: '⚠️ 아직 완료하지 않은 항목:',
    proceedConfirm: '그래도 계속 진행할까요?',
    allPassed: '✅ 모든 체크리스트 통과!',
    retryMessage: '체크리스트를 마친 뒤 다시 실행해 보세요.',
    retryCursorHint: '빌드하고 테스트 돌려줘',
    versionPrompt: '배포 버전은?',
    versionHint: '예: 0.4.0',
    emptySection: '(미작성)',
    emptyNext: '(미정)',
    deployMessage: '빌드 로그를 저장했어요! 이제 실제 배포를 진행하세요.',
    deployCursorHint: '배포해줘',
    checkBuild: '빌드가 성공했나요?',
    hintBuild: 'pnpm build',
    checkTest: '모든 테스트가 통과했나요?',
    hintTest: 'pnpm test --run',
    checkVersion: 'package.json 버전을 올렸나요?',
    hintVersion: 'version 필드 확인',
    checkChangelog: '변경 내용을 기록했나요?',
    hintChangelog: 'README 또는 CHANGELOG',
    checkSecurity: '보안 스캔을 돌렸나요?',
    hintSecurity: 'vhk 보안 scan',
    checkCommit: '모든 변경이 커밋되었나요?',
    hintCommit: 'git status 확인',
    changelogUpdated: (version: string) =>
      `CHANGELOG.md 갱신됨 — [Unreleased] → [${version}] 섹션으로 이동`,
    changelogNoUnreleased:
      'CHANGELOG.md에 [Unreleased] 섹션이 없어 자동 갱신을 스킵했어요',
    changelogMissing:
      'CHANGELOG.md가 없어요. 만들면 ship이 자동으로 [Unreleased] → 버전 섹션으로 옮겨줍니다.',
  },
  design: {
    title: '디자인 토큰 생성',
    selectPalette: '컬러 팔레트를 선택하세요:',
  },
  theme: {
    title: '테마 설정 (다크/라이트 모드)',
  },
  ref: {
    addTitle: '레퍼런스 추가',
    listTitle: '레퍼런스 목록',
  },
  memory: {
    addTitle: '기억 추가',
    listTitle: '기억 목록',
    // #488: eval --init — recall 후보 0 쿼리도 라벨링 가능(자동 skip = 미스가 평가셋에서 구조적 제외 → 상향 편향).
    evalInit: {
      noCandidates: '(recall 후보 0 — 전체 기억에서 정답을 고르면 miss 라벨로 기록됩니다)',
      selectPrompt: '정답 기억 번호 (쉼표 구분 · m=전체 목록에서 선택 · 엔터=skip):',
      pickerEmpty: '(기억이 비어 있어 정답을 고를 수 없습니다 — skip)',
      pickerFilterPrompt: '키워드 필터 (엔터=전체 목록):',
      pickerNoMatch: (kw: string) => `"${kw}" 매칭 0건 — 다른 키워드를 입력하세요.`,
      pickerMore: (n: number) => `…외 ${n}개 — 키워드로 좁히세요 (f=필터 다시).`,
      pickerSelectPrompt: '정답 기억 번호 (쉼표 구분 · f=필터 다시 · 엔터=정답 없음 skip):',
      pickerInvalidSkip: '(유효한 번호 없음 — 정답 없음으로 skip)',
    },
  },
  mcp: {
    initTitle: 'Cursor MCP 연동 설정',
    serverStarted: 'VHK MCP 서버 시작됨',
    nextMessage: 'Cursor / Claude Desktop 을 재시작한 뒤 채팅에서 vhk 도구를 호출하세요.',
    nextCursor: '프로젝트 상태 알려줘',
  },
  deploy: {
    title: '배포하기',
    selectPlatform: '어떤 플랫폼에 배포할까요?',
    deploying: '배포 중...',
    success: '배포 성공!',
    failed: '배포 실패',
  },
  env: {
    title: '환경변수 관리',
    checkTitle: '환경변수 점검',
  },
  publish: {
    title: 'npm 배포',
    selectBump: '버전을 어떻게 올릴까요?',
    building: '빌드 중...',
    buildSuccess: '빌드 성공',
    buildFailed: '빌드 실패',
    testing: '테스트 중...',
    testSuccess: '테스트 통과',
    testFailed: '테스트 실패',
    publishing: 'npm 배포 중...',
    publishSuccess: 'npm 배포 성공!',
    publishFailed: 'npm 배포 실패',
    // 발행 전 안전 가드 — feature 브랜치/미커밋 발행로 픽스 누락본이 latest 로 나가는 사고 방지(v2.3.1 사례)
    preflightWrongBranch: (branch: string, def: string) =>
      `발행 중단 — 현재 '${branch}' 브랜치입니다. 발행은 '${def}' 에서만 하세요 (feature 브랜치 발행 → 픽스 누락본이 npm latest 로 나가는 사고 방지). git checkout ${def} && git pull 후 재시도.`,
    preflightDirty:
      '발행 중단 — 커밋 안 된 변경이 있습니다. 발행 전 커밋/정리하세요 (발행에 영향 없는 untracked 파일은 무시).',
    preflightStatusFailed:
      '발행 중단 — git 상태 확인에 실패했습니다 (clean 으로 단정하지 않음). git 저장소 상태를 확인 후 재시도하세요.',
    preflightUntrackedSrc: (files: string) =>
      `발행 중단 — 커밋 안 된 신규 소스 파일이 있습니다: ${files}. untracked .ts 도 빌드(dist)에 포함돼 발행되므로 커밋 또는 제거 후 재시도하세요.`,
  },
  harness: {
    title: '통합 품질 점검',
  },
  audit: {
    title: '보안 감사',
  },
  migrate: {
    title: '패키지 매니저 전환',
    selectTarget: '어떤 패키지 매니저로 전환할까요?',
  },
  update: {
    title: 'VHK CLI 업데이트',
    nextOkMessage: '업데이트 완료! 새 버전 확인하세요.',
    nextOkCursor: 'vhk 버전 알려줘',
    nextFailMessage: '업데이트 실패. 환경 점검부터 해보세요.',
    nextFailCursor: 'vhk doctor 실행해줘',
  },
  context: {
    jsonOption: '읽기 전용 WorkContextV1 JSON 출력 (--compact과 함께 사용할 수 없음)',
    title: '프로젝트 컨텍스트 생성',
    showTitle: '컨텍스트 파일',
    resumeMissing: '🧭 AI 세션 복원 컨텍스트 없음 → 생성: vhk context',
    resumeExists: '🧭 새 세션이면 AI 컨텍스트 복원: vhk context-show (갱신: vhk context)',
    resumeStale: '🧭 컨텍스트가 오래됨(코드 변경 이후) → 갱신: vhk context',
  },
  brief: {
    title: '프로젝트 브리핑',
  },
  loopBrief: {
    title: '루프 브리핑 (1틱 앵커)',
  },
  remind: {
    title: '치명 규칙 재주입 (리마인더)',
  },
  content: {
    title: '콘텐츠 초안 프롬프트 (풀사이클 뒷단 — 콘텐츠/마케팅)',
  },
  launch: {
    title: '런칭 게시물 프롬프트 (풀사이클 뒷단 — 런칭)',
  },
  ops: {
    title: '운영 회고 프롬프트 (풀사이클 뒷단 — 운영)',
  },
  sell: {
    title: '판매 카피 프롬프트 (풀사이클 뒷단 — 판매)',
  },
  goal: {
    listTitle: '🎯 Goal 목록',
    nextTitle: '➡️  다음 Goal',
    peekTitle: '👀 다음 Goal 미리보기 (읽기 전용)',
    initTitle: '🏗️  goals/ 구조 스캐폴딩',
    checkTitle: '✅ Goal 게이트 검증',
    doneTitle: '🏁 Goal 완료 처리',
    syncTitle: '🔄 Goal 게이트 스크립트 동기화',
    migrateTitle: '🔧 Goal frontmatter migrate',
    duplicateId: (ids: string) =>
      `⚠ 중복된 goal id: ${ids} — 같은 id 파일이 여러 개면 첫 매치만 사용됩니다. id 를 유일하게 고치세요.`,
    skippedFiles: (n: number) =>
      `⚠ 스키마 불일치로 무시된 파일 ${n}개 (goal 로 안 잡힘 — silent skip):`,
    notFound: (id: number) => `goal id ${id} 없음 — vhk goal list 로 확인하세요.`,
    invalidId: (raw: string) =>
      `유효하지 않은 goal 번호: '${raw}' — 양의 정수만 됩니다 (예: --id 3). vhk goal list 로 확인하세요.`,
    dependencyWaiting: (ids: string) => `선행 작업 대기: ${ids}`,
    dependencyIssueHeader: (n: number) => `Goal 선행 조건 설정 오류 ${n}건`,
    dependencyInvalid: (id: number, tokens: string) =>
      `Goal ${id}의 depends_on 값이 숫자 목록이 아닙니다: ${tokens}`,
    dependencyMissing: (id: number, dependencyId: number) =>
      `Goal ${id}가 존재하지 않는 Goal ${dependencyId}를 기다립니다.`,
    dependencySelf: (id: number) => `Goal ${id}가 자기 자신을 선행 작업으로 가리킵니다.`,
    dependencyCycle: (cycle: string) => `Goal 선행 조건이 순환합니다: ${cycle}`,
    dependencyFixHint: 'goals/*.md의 depends_on을 고친 뒤 vhk goal list로 다시 확인하세요.',
    dependencyInvalidInProgress: (id: number, waiting: string) =>
      `Goal ${id}가 시작됐지만 선행 작업 ${waiting}이 완료되지 않았습니다. 상태와 로드맵을 먼저 맞추세요.`,
    dependencyDoneBlocked: (id: number, waiting: string) =>
      `Goal ${id} 완료 처리 거부 — 먼저 끝내야 할 Goal: ${waiting}`,
    // 여기의 "불일치(drift)"는 설정이 아니라 goal 상태 ↔ 코드 현실의 어긋남이다 (ADR-011 대응표 적용 시 의미 보존).
    driftTitle: '🔍 Goal 상태↔코드 불일치(drift) 점검',
    driftClean: 'goal 상태 불일치(drift) 없음 (구현 흔적 있는데 NOT_STARTED 인 goal 0건)',
    driftFound: (n: number) =>
      `상태 불일치(drift) 의심 ${n}건 — check-goal 게이트에 goal 고유 검증이 있는데 status: NOT_STARTED:`,
    stateDirAbsent: (dir: string) =>
      `${dir}/ 가 없어 상태 문서를 쓰지 않고 조회만 했습니다 — 이 프로젝트는 작업 상태를 다른 곳에서 관리합니다.`,
    stateDirAbsentHint: (dir: string) =>
      `${dir}/ 를 쓰려면 vhk goal init 으로 먼저 만드세요 (next 는 없는 디렉터리를 새로 만들지 않습니다).`,
  },
  watch: {
    title: '👁️  무인 세션 정지 감시',
  },
  agent: {
    blockerTitle: '🛑 Blocker 기록',
    learnTitle: '🧠 Learning 기록',
    winTitle: '🏆 성공 기록',
    resumeTitle: '▶️  HARD_STOP 해제',
    autonomyLogTitle: '🤖 자율 루프 런 기록',
    failureKindOption:
      '실패 성격 infra|product — infra(네트워크·할당량)는 완주율 분모에서 제외됩니다. 종결 실패에서만 유효',
  },
  work: {
    workTitle: '🚀 vhk work — 작업 시작/이어하기',
    handoffTitle: '⏸️  vhk work handoff — 중단 정리',
    missionUnset: '⚠️  작업 계약(mission)이 없습니다 — vhk mission set 으로 목표·범위를 선언하면 변경이 계약 안인지 검증됩니다 (선택).',
  },
  pattern: {
    detectTitle: '패턴 감지',
    listTitle: '패턴 목록',
    dismissTitle: '패턴 dismiss',
  },
  evolve: {
    suggestTitle: '진화 제안 생성',
    negativesTitle: '부정 예시 수집 (❌ 후보)',
    seedPreviewTitle: 'cold-start 역채굴 — 미리보기 (dry-run)',
    seedWriteTitle: 'cold-start 역채굴 — memory.patterns 반영',
    listTitle: '진화 후보 목록',
    applyTitle: '룰 반영',
    rejectTitle: '후보 기각',
    undoTitle: '최근 반영 되돌리기',
    noRules: 'RULES.md 가 없습니다. vhk init으로 생성 후 다시 시도하세요.',
    noPatterns: 'patterns[]가 비어있거나 active avoid 패턴이 없습니다. vhk pattern detect 로 먼저 감지하세요.',
    noQueue: '판정할 후보나 결정 기록이 없습니다.',
    notFound: (id: string) => `후보 '${id}' 를 찾을 수 없습니다. vhk evolve list 로 확인하세요.`,
    alreadyApplied: '이미 반영된 후보입니다.',
    dismissed: '소스 패턴이 dismiss됨 — apply 거부 (dismiss된 패턴 기반 룰은 반영 안 됨)',
    alreadyAppliedPattern: '소스 패턴이 이미 반영됨 — apply 거부',
    duplicateRule: (draft: string) => `중복 룰 감지 — RULES.md에 이미 유사한 룰이 있습니다:\n  ${draft}`,
    pendingApplyExists: '미해소 apply가 있습니다. vhk evolve undo 후 재시도하거나 그대로 유지하세요.',
    noAppliedToUndo: 'undo할 반영 항목이 없습니다.',
    noBackup: '.bak 파일이 없어 undo 불가합니다. RULES.md를 수동 복원하세요.',
    allSuggested: (days: number) => `판정할 후보가 없습니다. 기존 후보는 이미 결정됐거나 ${days}일이 지났습니다.`,
    newCandidates: (n: number) => `현재 후보: ${n}개`,
    suggestHint: 'vhk evolve suggest 로 현재 후보를 확인하세요.',
    digestTitle: 'evolve digest — 현재 룰 후보 묶음 (읽기 전용·자동 반영 0)',
    digestEmpty: '현재 판정할 후보가 없습니다.',
    digestNext: (n: number) => `후보 ${n}개 — 신뢰도 높은 것부터 사람이 검토·반영(자동 반영 없음).`,
  },
  seo: {
    init: {
      title: '🔍 vhk seo init — SEO·수익 대시보드 초기화',
      registered: (domain: string) => `사이트 등록 완료: ${domain}`,
      domainRequired: '도메인이 필요합니다. --domain <도메인> 으로 지정하세요 (비대화형).',
      domainHint: '예: vhk seo init --domain example.com --yes',
      domainPrompt: '관리할 사이트 도메인 (예: example.com):',
      invalidDomain: '유효한 도메인이 아닙니다. 예: example.com',
      cancelled: '취소되었습니다.',
      secretGuideHeader: '자격증명 보관 — 값은 .env 에, config 엔 참조 이름($NAME)만:',
      secretPresent: (name: string) => `${name} — 설정됨 ✓`,
      secretMissing: (name: string) => `${name} — 미설정 (필요 시 .env 에 추가)`,
      secretWarn: '⚠️  실제 키 값은 절대 config.json·커밋·로그에 넣지 마세요 (.env + .gitignore).',
      nextStep: '다음: vhk seo submit 으로 사이트맵·IndexNow 제출',
    },
    submit: {
      title: '🚀 vhk seo submit — 사이트맵 + IndexNow 제출',
      keyReady: (path: string) => `IndexNow 키 준비: ${path}`,
      noCredentials: '실 제출(GSC·Bing·IndexNow)은 자격증명이 필요합니다 — 현재 미설정.',
    },
    check: {
      title: '📈 vhk seo check — 색인·트래픽·수익 수집',
      noCredentials: '실 수집은 자격증명이 필요합니다 — 현재 미설정.',
    },
    report: {
      title: '🖥️ vhk seo report — 무빌드 HTML 대시보드',
      noLatest: 'latest.json 이 없습니다. 먼저 vhk seo check 로 수집하세요.',
      generated: (path: string) => `리포트 생성: ${path}`,
    },
    automate: {
      title: '⚙️ vhk seo automate — Notion 적재 + 스케줄러 + 확장 슬롯',
      notionBlocked: 'Notion 실 적재는 자격증명·연동이 필요합니다 — 운영 단계.',
    },
  },
  config: {
    setRulesFileTitle: '🧭 vhk config set-rules-file',
    saved: (path: string) => `~/.vhk/config.json 에 저장: ${path}`,
    liveConfirmed: (version: string) => `확인: 헌법(core-rules) 라이브 반영 성공 (v${version})`,
    liveNote: '재시작 없이 지금부터 모든 vhk 명령에 즉시 적용됩니다.',
    rulesFileInvalid: (path: string) => `${path}에서 유효한 규칙 YAML을 읽지 못했습니다. 설정은 변경하지 않았습니다.`,
    rulesFileEnvOverride: (path: string) => `VHK_RULES_FILE(${path})이 우선 적용 중이라 저장한 rulesFile은 아직 사용되지 않습니다.`,
    nextHint: '헌법 소스를 다시 확인하려면:',
  },
} as const

type KoValue = string | ((...args: never[]) => string)

function lookup(path: string): KoValue | undefined {
  const parts = path.split('.')
  let cur: unknown = ko
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur as KoValue | undefined
}

/** i18n 키 조회 — 예: t('save.title') */
export function t(key: string, ...args: unknown[]): string {
  const value = lookup(key)
  if (typeof value === 'function') {
    return (value as (...a: unknown[]) => string)(...args)
  }
  if (typeof value === 'string') return value
  return key
}
