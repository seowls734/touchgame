# 온라인 랭킹 서버 (Cloudflare Workers + D1)

`index.html` 의 `API_URL` 을 채우면 온라인 랭킹이 켜지고, 비워 두면 예전처럼
로컬(이 브라우저) 전용으로 동작합니다. 게임 자체는 설정 없이도 그대로 돌아갑니다.

## 왜 이 구조인가

**기록 검증(이상치 필터)은 두지 않습니다.** 보내온 수치를 그대로 기록합니다.

- 순위 점수(`rp`)만 서버가 계산합니다. 정렬 기준을 한 곳에 두기 위해서입니다.
- 기록은 `(id, secret)` 쌍을 아는 기기만 수정할 수 있어, 남의 기록을 덮어쓸 수 없습니다.
  `secret` 은 SHA-256 해시로만 저장되어 평문이 서버에 남지 않습니다.
- 타입·범위 정리와 이름 정제는 남아 있지만, 이는 DB 와 화면이 깨지지 않게 하려는
  최소한의 처리이지 부정 기록을 거르는 장치가 아닙니다.

## 설치

Node.js 가 설치돼 있어야 합니다.

```bash
cd worker
npx wrangler login              # 브라우저가 열리면 Cloudflare 계정 승인
npx wrangler d1 create touchgame-rank
```

마지막 명령이 출력하는 `database_id` 를 `wrangler.toml` 의
`database_id = "여기에-..."` 자리에 붙여넣습니다.

```bash
npx wrangler d1 execute touchgame-rank --remote --file=./schema.sql   # 테이블 생성
npx wrangler deploy                                                   # 배포
```

배포가 끝나면 `https://touchgame-rank.<계정>.workers.dev` 주소가 출력됩니다.

## 게임에 연결

`index.html` 에서 `const API_URL='';` 를 찾아 위 주소를 넣습니다.

```js
const API_URL='https://touchgame-rank.내계정.workers.dev';
```

이제 게임을 열면 랭킹 탭 상단이 `🌐 온라인 랭킹 연결됨` 으로 바뀝니다.

## 테스트

D1 을 흉내 낸 스텁으로 서버 동작을 확인합니다. 배포 없이 돌아갑니다.

```bash
node worker/test.mjs
```

소유권 확인, 빈도 제한, 입력 형식 처리, 서버 측 점수 계산까지 11개 항목을 검사합니다.

로컬에서 실제 서버를 띄워 보려면:

```bash
cd worker
npx wrangler d1 execute touchgame-rank --local --file=./schema.sql
npx wrangler dev
```

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/board?limit=100` | 상위 기록 (rp 내림차순, 최대 200) |
| `POST` | `/submit` | 기록 등록·갱신 |

`POST /submit` 본문:

```json
{ "id": "16자리hex", "secret": "32자리hex", "name": "이름",
  "stage": 40, "prestiges": 2, "dps": 5000, "gold": 200000, "kills": 900 }
```

응답 코드: `200` 성공 · `400` 형식 오류 · `403` 소유권 없음 · `429` 너무 잦은 갱신

## 비용

무료 플랜 기준 하루 요청 10만 건, D1 읽기 500만 행 / 쓰기 10만 행입니다.
클라이언트는 60초에 한 번(기록이 갱신됐을 때만) 쓰고, 랭킹 탭을 보고 있을 때만
30초마다 읽습니다. 이 게임 규모에서는 무료 한도에 한참 못 미칩니다.

## 남는 한계

기록을 검증하지 않으므로, **조작된 점수도 그대로 순위에 오릅니다.** 자기 기록만
수정할 수 있고 갱신 빈도가 제한될 뿐, 값 자체는 신뢰하지 않습니다. 순위표를
"참고용 기록판"으로 보시면 됩니다. 나중에 막고 싶어지면 `worker/src/worker.js` 의
`/submit` 처리에 검사 함수를 하나 추가하는 것으로 되돌릴 수 있습니다.

또 하나, 브라우저 데이터를 지우면 `id`/`secret` 이 사라져 기존 서버 기록을 더 이상
수정하지 못하고 새 기록이 생깁니다.
