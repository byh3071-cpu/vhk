# 아침 자율 PR 머지 체크리스트

overnight / Wave A PR을 머지하기 **전**에 쓴다. **머지는 사람만.**

## 검토 중인 PR

- URL:
- Branch:
- Base: main

## 세 문답 (필수)

1. **뭐가 바뀌나?**  
   (파일 / 동작 / 문서 — 짧게 한 단락)

2. **깨지면 어디가 아픈가?**  
   (verify, goal next, overnight conductor, stats, 스킬 동기화 등)

3. **롤백은?**  
   (커밋 revert / PR 닫기 / 스킬 복제본 복구 등)

## 게이트

- [ ] CI / 로컬 `vhk verify`(또는 typecheck+test+build) green
- [ ] diff에 시크릿 없음
- [ ] autonomy-log / 아침 리포트를 주장했다면 정직하게 맞음
- [ ] Goal 카드 status가 현실과 일치(DONE인데 빈 체크리스트 금지)

## 결정

- [ ] 머지
- [ ] 수정 요청
- [ ] 머지 없이 닫기

오너 확인: ________  날짜: ________
