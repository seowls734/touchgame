// 성장 곡선 회귀 테스트.
// 수치가 ∞ 가 되는 근본 원인은 "효과 배율 ≥ 비용 배율" 이거나 상한이 없는 곱연산이다.
// 두 조건을 코드에서 직접 검사해, 밸런스를 만질 때 같은 실수가 다시 들어오지 않게 한다.
import ctx from './harness.mjs';
const g=n=>ctx.__get(n);

let pass=0, fail=0;
const ok=(label,cond,extra='')=>{ cond?pass++:fail++; console.log(`${cond?'PASS':'FAIL'}  ${label}${extra?'  → '+extra:''}`); };

// 강화 카드의 sub 문구에서 효과 배율(×1.75 같은 값)을 읽어 온다
const effOf = u => { const m=/×([0-9.]+)/.exec(u.sub); return m?parseFloat(m[1]):null; };

for(const u of g('UPGRADES')){
  const eff=effOf(u);
  if(eff===null) continue;                      // 합연산(+n%p) 강화는 폭주하지 않는다
  ok(`[${u.id}] 비용 배율 > 효과 배율`, u.mult>eff, `비용 ×${u.mult} vs 효과 ×${eff}`);
  ok(`[${u.id}] 최대 레벨 존재`, Number.isFinite(u.max||Infinity), `max=${u.max}`);
  if(u.max) ok(`[${u.id}] 최대 효과가 안전 범위`, Math.pow(eff,u.max)<1e80,
               `${eff}^${u.max} = 1e${Math.round(u.max*Math.log10(eff))}`);
}
for(const gs of g('GEMSHOP')){
  const m=/\+([0-9]+)% \/ 레벨/.exec(gs.sub);
  if(!m) continue;
  const isMul = gs.key==='gGold';               // 곱연산인 항목만 상한이 필요하다
  if(isMul) ok(`[정수:${gs.id}] 최대 레벨 존재`, Number.isFinite(gs.max||Infinity), `max=${gs.max}`);
}
// 동료 특성은 보유 수가 늘어도 무한히 쌓이면 안 된다
const steps=g('perkSteps');
ok('동료 특성 단계 상한', steps(1e9,10)<=g('PERK_MAX_STEPS'), `1e9마리 보유 시 ${steps(1e9,10)}단계`);

// 최종 보스를 잡을 여력은 남아 있어야 한다(상한이 너무 빡빡하면 게임을 못 깬다)
const need=g('mobMaxHp')(g('FINAL_STAGE'),true);
ok('최종 보스 체력이 안전 범위', need<1e120, `1e${Math.round(Math.log10(need))}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
