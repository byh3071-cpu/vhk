# Morning Autonomy Merge Checklist

Use before merging any overnight / Wave A PR. **Human merge only.**

## PR under review

- URL:
- Branch:
- Base: main

## Three questions (required)

1. **뭐가 바뀌나?**  
   (files / behavior / docs — one short paragraph)

2. **깨지면 어디가 아픈가?**  
   (verify, goal next, overnight conductor, stats, skill sync, …)

3. **롤백은?**  
   (revert commit / close PR / restore skill copy / …)

## Gates

- [ ] CI / local `vhk verify` (or typecheck+test+build) green
- [ ] No secrets in diff
- [ ] autonomy-log / morning report honest if claimed
- [ ] Goal cards status match reality (no DONE stub)

## Decision

- [ ] Merge
- [ ] Request changes
- [ ] Close without merge

Owner sign-off: ________  date: ________
