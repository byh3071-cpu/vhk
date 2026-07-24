# Autonomy overnight report template

Copy or generate via:

```
node scripts/gen-autonomy-morning-report.mjs --date YYYY-MM-DD --pr <url>
```

Filled fields (required):

- PR URL
- runId(s)
- complete / hardstop / blocked counts (from `.vhk/events/autonomy-run.jsonl`)

See `docs/runbooks/MORNING_AUTONOMY_MERGE.md`.
