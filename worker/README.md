# 온라인 랭킹 서버 (Cloudflare Workers + D1)

`index.html` 의 `API_URL` 을 채우면 온라인 랭킹이 켜지고, 비워 두면 예전처럼
로컬(이 브라우저) 전용으로 동작합니다. 게임 자체는 설정 없이도 그대로 돌아갑니다.

## 왜 이 구조인가

점수 계산과 검증을 **전부 서버가** 합니다.

- 클라이언트가 보낸 `rp`(순위 점수)는 **받지도 않습니다.** 서버가 직접 계산합니다.
- 게임 규칙상 불가능한 조합은 거부합니다 (`checkRecord`).
- 기록은 `(id, secret)` 쌍을 아는 기기만 수정할 수 있어, 남의 기록을 덮어쓸 수 없습니다.
  `secret` 은 SHA-256 해시로만 저장되어 평문이 서버에 남지 않습니다.

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

D1 을 흉내 낸 스텁으로 검증 로직을 확인합니다. 배포 없이 돌아갑니다.

```bash
node worker/test.mjs
```

이상치 거부, 소유권 확인, 빈도 제한, 서버 측 점수 계산까지 13개 항목을 검사합니다.

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

응답 코드: `200` 성공 · `400` 형식 오류 · `403` 소유권 없음 ·
`422` 규칙상 불가능한 기록 · `429` 너무 잦은 갱신

## 비용

무료 플랜 기준 하루 요청 10만 건, D1 읽기 500만 행 / 쓰기 10만 행입니다.
클라이언트는 60초에 한 번(기록이 갱신됐을 때만) 쓰고, 랭킹 탭을 보고 있을 때만
30초마다 읽습니다. 이 게임 규모에서는 무료 한도에 한참 못 미칩니다.

## 남는 한계

검증은 **"불가능한 값"** 만 거부합니다. 스테이지·DPS·환생·처치 수를 서로 앞뒤 맞게
조작한 기록은 통과합니다. 완전히 막으려면 플레이 시간과 성장 속도를 서버가 추적해
"이 시간에 이만큼 성장은 불가능하다"까지 판단해야 합니다. 지금은 순위표가 말이 되게
유지하는 수준으로 보시면 됩니다.

또 하나, 브라우저 데이터를 지우면 `id`/`secret` 이 사라져 기존 서버 기록을 더 이상
수정하지 못하고 새 기록이 생깁니다.
