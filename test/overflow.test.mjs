import ctx from './harness.mjs';
const g = n => ctx.__get(n);
const run = f => ctx.__run(f);

let pass=0, fail=0;
const ok=(label,cond,extra='')=>{ cond?pass++:fail++; console.log(`${cond?'PASS':'FAIL'}  ${label}${extra?'  → '+extra:''}`); };
const finite=v=>Number.isFinite(v);

// 극단 상태: 모든 성장 요소를 한계까지 올린 세이브
const S=g('S');
S.gold=Infinity; S.gems=Infinity;
S.stage=S.maxStage=S.frontier=S.bestStage=500;
for(const k in S.upg) S.upg[k]=100000;
for(const k in S.gem) S.gem[k]=100000;
g('HEROES').forEach(h=>S.heroes[h.id]=1e12);
g('RELICS').forEach(r=>S.relics[r.id]=100000);
g('EQUIP_SLOTS').forEach(sl=>S.equip[sl.id]={lv:100000,rar:4});
g('RESEARCH').forEach(r=>S.research.done[r.id]=true);

const fmt=g('fmt');
// ① 핵심 수치
ok('totalDps() 유한', finite(g('totalDps')()), fmt(g('totalDps')()));
ok('clickPower() 유한', finite(g('clickPower')()), fmt(g('clickPower')()));
ok('goldMult() 유한', finite(g('goldMult')()), fmt(g('goldMult')()));
ok('goldReward() 유한', finite(g('goldReward')(500,true)), fmt(g('goldReward')(500,true)));
ok('mobMaxHp() 유한', finite(g('mobMaxHp')(500,true)), fmt(g('mobMaxHp')(500,true)));

// ② 화면 표시에 ∞ 가 없는가
const shown=[g('totalDps')(),g('clickPower')(),g('goldReward')(500,true)].map(fmt);
ok('표시 문자열에 ∞ 없음', !shown.some(s=>s.includes('∞')), shown.join(' / '));

// ③ 틱이 보유 재화를 되돌리는가
run('gameReady=true'); run('lastTick=Date.now()-100');
g('tick')();
ok('tick 후 gold 유한', finite(S.gold), fmt(S.gold));
ok('tick 후 gems 유한', finite(S.gems), fmt(S.gems));

// ④ 구매 계산이 멈추는가
const t0=Date.now();
const r=g('maxAfford')(10,1.15,100000,S.gold);
ok('maxAfford 즉시 종료', Date.now()-t0<500 && finite(r.sum), `n=${r.n}, ${Date.now()-t0}ms`);
ok('costFor 유한', finite(g('costFor')(10,1.15,100000,10)));

// ⑤ ∞ 피해
g('spawnMob')();
g('dealDamage')(Infinity,false,false);
const hp=g('mob').hp;
ok('∞ 피해 후 체력 정상', finite(hp), String(hp));

// ⑥ 저장에 ∞ 가 null 로 남지 않는가
S.gold=Infinity; S.gems=Infinity;
g('save')();
const parsed=JSON.parse(ctx.localStorage.getItem(g('SAVE_KEY')));
ok('저장된 gold 가 유한값', finite(parsed.gold), String(parsed.gold));

// ⑦ 이미 깨진 예전 세이브 복구
ctx.localStorage.setItem(g('SAVE_KEY'), JSON.stringify({gold:null,gems:null,stage:3,maxStage:3}));
g('load')();
const S2=g('S');
ok('null 세이브 복구', finite(S2.gold)&&finite(S2.gems), `gold=${S2.gold}, gems=${S2.gems}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
