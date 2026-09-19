// 터치게임 온라인 랭킹 서버 (Cloudflare Workers + D1)
//
// 설계 원칙: 클라이언트가 보낸 점수를 그대로 믿지 않는다.
//  - RP(순위 점수)는 서버가 직접 계산한다. 클라이언트가 보낸 rp는 아예 받지 않는다.
//  - 게임 규칙상 불가능한 조합은 거부한다(index.html 의 rankFlags 와 같은 기준).
//  - 기록은 (id, secret) 쌍으로만 수정할 수 있어, 남의 기록을 덮어쓸 수 없다.

const BOARD_MAX = 200;      // 한 번에 내려줄 수 있는 최대 인원
const MIN_INTERVAL = 30000; // 같은 기록의 갱신 최소 간격(ms)
const FINAL_STAGE = 500;    // 게임의 최종 스테이지
const DPS_LEAD = 25;        // 최고 스테이지보다 이만큼 앞선 보스를 즉사시키면 비정상

// ── 게임 공식 (index.html 과 동일해야 한다) ──

function mobMaxHp(stage, boss) {
  let hp = 10 * Math.pow(1.55, stage - 1);
  if (boss) hp *= 10;
  return hp;
}

// 순위 점수. 한쪽 지표만 밀어도 최고가 되지 않도록 로그 스케일로 합산한다.
function rankScore(e) {
  return Math.max(1, e.stage) * 10
       + e.prestiges * 250
       + Math.log10(e.dps + 1) * 120
       + Math.log10(e.gold + 1) * 25
       + Math.log10(e.kills + 1) * 30;
}

// 게임 규칙상 불가능한 조합을 걸러낸다.
function checkRecord(e) {
  const st = e.stage, pr = e.prestiges;
  if (st > FINAL_STAGE) return '최종 스테이지를 넘음';
  if (pr > 200) return '환생 횟수가 비정상';
  if (e.kills < st - 1) return '처치 수가 스테이지보다 적음';
  if (pr > 0 && st < 12 + 4 * (pr - 1)) return '환생 횟수에 필요한 스테이지에 못 미침';
  if (e.dps > mobMaxHp(Math.min(FINAL_STAGE, st + DPS_LEAD), true)) return 'DPS가 최고 스테이지와 맞지 않음';
  if (e.gold > 6 * Math.pow(1.24, st - 1) * 35 * 1e12) return '보유 골드가 스테이지 대비 과도함';
  return null;
}

// ── 입력 정리 ──

const int = (v, max) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : NaN;
};
const num = (v, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : NaN;
};

// 이름: 제어문자와 꺾쇠를 없애고 길이를 자른다(클라이언트에서도 이스케이프하지만 이중으로 막는다)
const TAG_CHARS = ['<', '>', '&', '"', String.fromCharCode(39)];

function cleanName(v) {
  let out = '';
  for (const ch of String(v == null ? '' : v)) {
    const c = ch.codePointAt(0);
    if (c < 32 || c === 127) continue;        // 제어문자
    if (TAG_CHARS.indexOf(ch) >= 0) continue; // 태그로 해석될 수 있는 문자
    out += ch;
  }
  out = out.trim();
  return out.length >= 2 && out.length <= 16 ? out : null;
}



const hex = /^[0-9a-f]{8,64}$/;

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// 타이밍 공격을 피하기 위해 길이·내용을 상수 시간에 가깝게 비교한다
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── 응답 헬퍼 ──

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });

// ── 라우팅 ──

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // GET /board?limit=100 — 상위 기록
    if (request.method === 'GET' && url.pathname === '/board') {
      const limit = Math.min(BOARD_MAX, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 100));
      const { results } = await env.DB.prepare(
        'SELECT id, name, stage, prestiges, dps, gold, kills, rp, at FROM ranks ORDER BY rp DESC LIMIT ?1'
      ).bind(limit).all();
      return json({ board: results || [] });
    }

    // POST /submit — 기록 등록/갱신
    if (request.method === 'POST' && url.pathname === '/submit') {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: '잘못된 요청 형식' }, 400); }

      const id = String(body.id || '');
      const secret = String(body.secret || '');
      if (!hex.test(id) || !hex.test(secret)) return json({ error: '잘못된 식별자' }, 400);

      const name = cleanName(body.name);
      if (!name) return json({ error: '이름은 2~16자여야 합니다' }, 400);

      const rec = {
        stage:     int(body.stage, 1e6),
        prestiges: int(body.prestiges, 1e6),
        kills:     int(body.kills, 1e15),
        dps:       num(body.dps, 1e300),
        gold:      num(body.gold, 1e300),
      };
      if (Object.values(rec).some(Number.isNaN)) return json({ error: '잘못된 수치' }, 400);
      rec.stage = Math.max(1, rec.stage);

      const bad = checkRecord(rec);
      if (bad) return json({ error: bad }, 422);

      const now = Date.now();
      const hash = await sha256(secret);

      const prev = await env.DB.prepare(
        'SELECT secret, at, rp FROM ranks WHERE id = ?1'
      ).bind(id).first();

      if (prev) {
        // 기록의 주인만 갱신할 수 있다
        if (!safeEqual(prev.secret, hash)) return json({ error: '권한이 없습니다' }, 403);
        if (now - prev.at < MIN_INTERVAL) return json({ error: '너무 잦은 갱신' }, 429);
      }

      // 점수는 서버가 계산한다 — 클라이언트가 보낸 rp는 쓰지 않는다
      const rp = Math.round(rankScore(rec));

      await env.DB.prepare(
        `INSERT INTO ranks (id, secret, name, stage, prestiges, dps, gold, kills, rp, at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, stage=excluded.stage, prestiges=excluded.prestiges,
           dps=excluded.dps, gold=excluded.gold, kills=excluded.kills,
           rp=excluded.rp, at=excluded.at`
      ).bind(id, hash, name, rec.stage, rec.prestiges, rec.dps, rec.gold, rec.kills, rp, now).run();

      return json({ ok: true, rp });
    }

    return json({ error: 'not found' }, 404);
  },
};
