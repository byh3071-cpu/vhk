const literal = (...parts) => parts.join('')
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
const exactPattern = (name, ...parts) => ({
  name,
  pattern: new RegExp(escapeRegex(literal(...parts)), 'iu'),
})

export const PRIVATE_TEXT_PATTERNS = [
  exactPattern('개인 규칙 저장소명', 'yohan', '-', 'brain'),
  exactPattern('개인 스킬 저장소명', 'yohan', '-', 'cc', '-', 'skills'),
  exactPattern('개인 에이전트 묶음명', 'yohan', '-', 'core'),
  exactPattern('개인 런타임명', 'yohan', '-', 'os'),
  exactPattern('개인 MCP명', 'yohan', '-', 'mcp'),
  exactPattern('개인 작업공간명', 'yohan', '-', 'ecosystem'),
  exactPattern('개인명 기반 환경변수', 'YOHAN', '_', 'BRAIN', '_', 'ROOT'),
  exactPattern('폐기된 홈 설정 키', 'brain', 'Root'),
  exactPattern('폐기된 CLI 명령', 'set', '-', 'brain', '-', 'root'),
  exactPattern('실명', '백', '요', '한'),
  exactPattern('개인 에이전트명', '노', '뚝이'),
  exactPattern('개인 Gmail', 'byh3071', '@', 'gmail.com'),
  exactPattern('개인 npm 메일', 'byh3071', '@', 'naver.com'),
  { name: 'Windows 사용자 절대경로', pattern: /[a-z]:\\users\\(?:public|user|[^\\\s"']+)[\\/]/iu },
]

const PLACEHOLDER_PAYLOAD = String.raw`(?:sample|example|placeholder|fake|dummy|redacted|test)(?:[-_]?\d+)?`

export const EXTERNAL_OBJECT_ID_PATTERNS = [
  {
    name: '외부 워크플로 식별자',
    pattern: new RegExp(String.raw`\bwf_(?!${PLACEHOLDER_PAYLOAD}\b)[a-z0-9-]{6,}\b`, 'iu'),
  },
  {
    name: '외부 고객 객체 식별자',
    pattern: new RegExp(String.raw`\bcus_(?!${PLACEHOLDER_PAYLOAD}\b)[a-z0-9]{10,}\b`, 'iu'),
  },
  {
    name: '외부 채널 객체 식별자',
    pattern: /\bC(?!0{10,}\b)[0-9]{10,}\b/u,
  },
]

export const UUID_PATTERN = /(?<![0-9a-f])[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}(?![0-9a-f])/giu
export const ZERO_UUID = /^0{32}$/u
