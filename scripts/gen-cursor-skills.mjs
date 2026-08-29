process.stderr.write(
  'gen-cursor-skills.mjs는 gen-agent-skills.mjs로 대체되었습니다. 공통 Agent Skill 번들을 생성합니다.\n',
)
await import('./gen-agent-skills.mjs')
