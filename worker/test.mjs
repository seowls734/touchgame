// 로컬 검증 테스트 — D1을 흉내 낸 스텁으로 라우팅과 이상치 필터를 확인한다.
// 실행: node worker/test.mjs
import worker from './src/worker.js';

const rows = new Map();
const DB = {
  prepare(sql) {
    return {
      bind(...a) {
        return {
          async first() { return rows.get(a[0]) || null; },
          async all() {
            const list = [...rows.values()].sort((x, y) => y.rp - x.rp).slice(0, a[0]);
            return { results: list.map(({ secret, ...r }) => r) };
          },
          async run() {
            if (sql.includes('INSERT')) {
              const [id, secret, name, stage, prestiges, dps, gold, kills, rp, at] = a;
              rows.set(id, { id, secret, name, stage, prestiges, dps, gold, kills, rp, at });
            }
            return { success: true };
          },
        };
      },
    };
  },
};

const post = (body) => worker.fetch(
  new Request('https://x/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  { DB });
const board = () => worker.fetch(new Request('https://x/board'), { DB });

const ID = 'a'.repeat(16), SEC = 'b'.repeat(32), OTHER = 'c'.repeat(32);
let pass = 0, fail = 0;
async function t(label, res, want) {
  const got = res.status;
  const body = await res.clone().json().catch(() => ({}));
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  → ${got}${ok ? '' : ` (기대 ${want})`}  ${body.error || ''}`);
}

// 정상 기록
await t('정상 기록 등록', await post({ id: ID, secret: SEC, name: '테스터', stage: 40, prestiges: 2, dps: 5e3, gold: 2e5, kills: 900 }), 200);

// 이상치 — 각각 거부돼야 한다
await t('스테이지 초과',   await post({ id: 'd'.repeat(16), secret: SEC, name: '치터A', stage: 9999, prestiges: 0, dps: 1, gold: 0, kills: 99999 }), 422);
await t('처치 수 부족',    await post({ id: 'e'.repeat(16), secret: SEC, name: '치터B', stage: 300, prestiges: 0, dps: 1, gold: 0, kills: 5 }), 422);
await t('환생 조건 미달',  await post({ id: 'f'.repeat(16), secret: SEC, name: '치터C', stage: 10, prestiges: 50, dps: 1, gold: 0, kills: 500 }), 422);
await t('DPS 과다',        await post({ id: '1'.repeat(16), secret: SEC, name: '치터D', stage: 20, prestiges: 0, dps: 1e30, gold: 0, kills: 500 }), 422);
await t('골드 과다',       await post({ id: '2'.repeat(16), secret: SEC, name: '치터E', stage: 20, prestiges: 0, dps: 1, gold: 1e300, kills: 500 }), 422);
await t('음수 값',         await post({ id: '3'.repeat(16), secret: SEC, name: '치터F', stage: -5, prestiges: 0, dps: 1, gold: 0, kills: 500 }), 400);
await t('이름 너무 짧음',  await post({ id: '4'.repeat(16), secret: SEC, name: 'x', stage: 20, prestiges: 0, dps: 1, gold: 0, kills: 500 }), 400);
await t('식별자 형식 오류', await post({ id: 'ZZZ', secret: SEC, name: '테스터', stage: 20, prestiges: 0, dps: 1, gold: 0, kills: 500 }), 400);

// 소유권 — 남의 기록 덮어쓰기 시도
await t('남의 기록 덮어쓰기', await post({ id: ID, secret: OTHER, name: '도둑', stage: 400, prestiges: 90, dps: 1e20, gold: 1e30, kills: 1e6 }), 403);

// 빈도 제한 — 방금 썼으므로 거부
await t('연속 갱신 제한', await post({ id: ID, secret: SEC, name: '테스터', stage: 41, prestiges: 2, dps: 6e3, gold: 3e5, kills: 950 }), 429);

// 점수는 서버가 계산한다 — 부풀린 rp를 보내도 무시
rows.get(ID).at = Date.now() - 60000;
const r = await post({ id: ID, secret: SEC, name: '테스터', stage: 45, prestiges: 2, dps: 7e3, gold: 4e5, kills: 1000, rp: 99999999 });
const j = await r.json();
const serverRp = rows.get(ID).rp;
const ok = j.rp === serverRp && serverRp < 10000;
ok ? pass++ : fail++;
console.log(`${ok ? 'PASS' : 'FAIL'}  클라이언트가 보낸 rp 무시  → 서버 계산값 ${serverRp}`);

// 보드 조회
const b = await (await board()).json();
const hasSecret = JSON.stringify(b).includes('secret');
hasSecret ? fail++ : pass++;
console.log(`${hasSecret ? 'FAIL' : 'PASS'}  보드 응답에 secret 미포함  → ${b.board.length}건`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
