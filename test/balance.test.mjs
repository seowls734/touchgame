// 성장 곡선 회귀 테스트.
// 수치가 ∞ 가 되는 근본 원인은 두 가지다.
//   ① 효과 배율 ≥ 비용 배율  → 레벨을 올릴수록 이득이 커져 끝없이 불어난다
//   ② 곱연산이 무한히 이어짐 → 최종 스테이지를 깬 뒤 방치하면 결국 한계를 넘는다
// 두 조건을 코드에서 직접 검사해, 밸런스를 만질 때 같은 실수가 다시 들어오지 않게 한다.
import ctx from './harness.mjs';
const g=n=>ctx.__get(n);

let pass=0, fail=0;
const ok=(label,cond,extra='')=>{ cond?pass++:fail++; console.log(`${cond?'PASS':'FAIL'}  ${label}${extra?'  → '+extra:''}`); };

const UPGRADES=g('UPGRADES'), upgEffAt=g('upgEffAt'), upgCostAt=g('upgCostAt');

for(const u of UPGRADES){
  if(!u.eff) continue;                     // 합연산(+n%p) 강화는 폭주하지 않는다

  // ① 비용이 효과보다 빨리 올라야 한다
  ok(`[${u.id}] 비용 배율 > 효과 배율`, u.mult>u.eff, `비용 ×${u.mult} vs 효과 ×${u.eff}`);

  // ② 곱연산 구간에 끝이 있어야 한다(소프트 캡)
  ok(`[${u.id}] 소프트 캡 존재`, Number.isFinite(u.soft) && u.postAdd>0,
     `soft=${u.soft}, 이후 +${(u.postAdd||0)*100}%p/lv`);

  // ③ 소프트 캡 시점의 효과가 안전 범위
  const atSoft=upgEffAt(u,u.soft);
  ok(`[${u.id}] 소프트 캡 효과가 안전 범위`, atSoft<1e80, `1e${Math.round(Math.log10(atSoft))}`);

  // ④ 소프트 캡 이후에는 곱연산이 아니라 덧셈이어야 한다
  const far=upgEffAt(u,u.soft+10000);
  const linear=atSoft*(1+u.postAdd*10000);
  ok(`[${u.id}] 소프트 캡 이후 선형 증가`, Math.abs(far/linear-1)<1e-6,
     `+10000레벨에서 ×${(far/atSoft).toFixed(0)}`);

  // ⑤ 소프트 캡 이후 비용이 효과보다 빨리 올라야 한다(수렴 보장)
  const effRatio=upgEffAt(u,u.soft+2000)/upgEffAt(u,u.soft+200);
  const costRatio=upgCostAt(u,u.soft+2000)/upgCostAt(u,u.soft+200);
  ok(`[${u.id}] 소프트 캡 이후 비용 증가 > 효과 증가`, costRatio>effRatio,
     `비용 ×${costRatio.toFixed(1)} vs 효과 ×${effRatio.toFixed(1)}`);

  // ⑥ 그래도 살 수는 있어야 한다 — 비용이 지수로 튀면 "살 이유가 없는 레벨"이 된다
  ok(`[${u.id}] 소프트 캡 이후 비용이 지수가 아님`,
     upgCostAt(u,u.soft+2000)/upgCostAt(u,u.soft) < 1e8,
     `+2000레벨 비용 ×${(upgCostAt(u,u.soft+2000)/upgCostAt(u,u.soft)).toExponential(1)}`);
}

// 곱연산으로 쌓이는 정수 상점 항목에는 상한이 필요하다
for(const gs of g('GEMSHOP'))
  if(gs.key==='gGold')
    ok(`[정수:${gs.id}] 최대 레벨 존재`, Number.isFinite(gs.max||Infinity), `max=${gs.max}`);

// 동료 특성은 보유 수가 늘어도 무한히 쌓이면 안 된다
const steps=g('perkSteps');
ok('동료 특성 단계 상한', steps(1e9,10)<=g('PERK_MAX_STEPS'), `1e9마리 보유 시 ${steps(1e9,10)}단계`);

// 스테이지에는 끝이 없다 — 아주 깊은 곳까지 가도 체력·보상이 한계를 넘으면 안 된다
const mobMaxHp=g('mobMaxHp'), goldReward=g('goldReward'), SOFT=g('STAGE_SOFT');
ok('스테이지 소프트 캡 지점의 체력이 안전 범위', mobMaxHp(SOFT,true)<1e120,
   `St.${SOFT} → 1e${Math.round(Math.log10(mobMaxHp(SOFT,true)))}`);
for(const st of [SOFT*10, SOFT*1000, 1e6, 1e9]){
  const hp=mobMaxHp(st,true), gold=goldReward(st,true);
  ok(`St.${st.toExponential?st.toExponential(0):st} 체력이 유한하고 한계 이하`,
     Number.isFinite(hp)&&hp<1e300, `1e${Math.round(Math.log10(hp))}`);
  ok(`St.${st.toExponential?st.toExponential(0):st} 골드가 유한하고 한계 이하`,
     Number.isFinite(gold)&&gold<1e300, `1e${Math.round(Math.log10(gold))}`);
}
// 소프트 캡 이후에도 난이도는 계속 올라야 한다(정체되면 진행의 의미가 없다)
ok('소프트 캡 이후 난이도 상승 지속', mobMaxHp(SOFT+1000,true)>mobMaxHp(SOFT+100,true),
   `+100 대비 +1000에서 ×${(mobMaxHp(SOFT+1000,true)/mobMaxHp(SOFT+100,true)).toFixed(1)}`);
// 체력 대비 보상 비율이 유지돼야 진행이 막히지 않는다
const r1=goldReward(SOFT,false)/mobMaxHp(SOFT,false), r2=goldReward(SOFT+5000,false)/mobMaxHp(SOFT+5000,false);
ok('소프트 캡 이후 보상/난이도 비율 유지', Math.abs(r2/r1-1)<0.01,
   `비율 변화 ${((r2/r1-1)*100).toFixed(2)}%`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
