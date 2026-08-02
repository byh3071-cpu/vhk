import { formatStackStatusNote, type StackStatus } from '../lib/stack-state.js'

// RFC 0060 T1: 빈 칸을 계약서식 관행 마커 [여기에 작성: 질문] 으로. 상단 가드로 AI 추측 채움 금지.
const ask = (question: string): string => `[여기에 작성: ${question}]`

export function ARCHITECTURE_TEMPLATE(
  name: string,
  stack: string,
  stackStatus: StackStatus = 'confirmed',
): string {
  return [
    '# Architecture — ' + name,
    '',
    '> ⚠️ [여기에 작성: …] 칸은 사용자와 대화로 채웁니다 — AI가 추측으로 채우지 않기.',
    '',
    '## 기술 스택',
    formatStackStatusNote(stackStatus),
    '',
    stack,
    '',
    '## 폴더 구조',
    ask('프로젝트 폴더 구조 (주요 디렉토리)'),
    '',
    '## 데이터 모델',
    '| 테이블 | 핵심 컬럼 | 설명 |',
    '|--------|----------|------|',
    `| ${ask('테이블 이름')} | | |`,
    '',
    '## 외부 서비스',
    '| 서비스 | 용도 |',
    '|--------|------|',
    `| ${ask('서비스 이름 (예: DB, 결제, 인증)')} | |`,
  ].join('\n')
}
