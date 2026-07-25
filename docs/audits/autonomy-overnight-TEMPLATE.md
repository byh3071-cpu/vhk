# 자율 overnight 아침 리포트 템플릿

생성:

```sh
node scripts/gen-autonomy-morning-report.mjs --date YYYY-MM-DD --pr <url>
```

채울 필드(필수):

- PR URL
- runId 목록
- complete / hardstop / blocked 횟수(해당 날짜의 `.vhk/events/autonomy-run.jsonl`만)

다음: `docs/runbooks/MORNING_AUTONOMY_MERGE.md`
