# 테스트

브라우저 없이 `index.html` 의 게임 로직을 검사한다.
`harness.mjs` 가 최소한의 DOM 스텁 위에서 `<script>` 를 그대로 실행하고,
테스트는 실제 게임 함수를 호출한다.

```bash
node test/overflow.test.mjs   # 수치 오버플로(∞) 방지 검사
node worker/test.mjs          # 랭킹 서버 검증 로직 검사
```

`overflow.test.mjs` 는 모든 성장 요소를 한계까지 올린 극단 상태를 만든 뒤
DPS·클릭·골드·체력이 유한한지, 화면에 ∞ 가 뜨지 않는지, 구매 계산이 멈추는지,
저장/불러오기에서 수치가 깨지지 않는지를 확인한다.
