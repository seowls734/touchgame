// index.html 의 <script> 를 최소 DOM 스텁 위에서 실행해 수치 상한을 검증한다.
import fs from 'fs';
import vm from 'vm';

// 저장소 루트의 index.html 을 읽는다(어느 위치에서 실행하든 동일하게)
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const html = fs.readFileSync(ROOT + 'index.html', 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const el = () => new Proxy(function(){}, {
  get(t, k) {
    if (k === 'style') return new Proxy({}, { get: () => '', set: () => true });
    if (k === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){return false} };
    if (k === 'dataset') return {};
    if (k === 'textContent' || k === 'innerHTML' || k === 'value') return '';
    if (k === 'children') return [];
    if (Symbol.toPrimitive === k) return () => '';
    return el();
  },
  set: () => true,
  apply: () => el(),
});

const doc = {
  getElementById: () => el(),
  querySelector: () => el(),
  querySelectorAll: () => [],
  createElement: () => el(),
  addEventListener(){}, removeEventListener(){},
  body: el(), documentElement: el(),
};

const store = new Map();
const ctx = {
  document: doc,
  window: { addEventListener(){}, removeEventListener(){}, matchMedia: () => ({matches:false, addEventListener(){}}) },
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  },
  navigator: { userAgent: 'node' },
  location: { href: 'http://localhost/' },
  crypto: { getRandomValues: a => { for (let i=0;i<a.length;i++) a[i]=i; return a; } },
  fetch: async () => { throw new Error('offline'); },
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
  requestAnimationFrame: () => 0,
  console,
};
ctx.window = Object.assign(ctx.window, ctx);
ctx.globalThis = ctx;
vm.createContext(ctx);
ctx.addEventListener = () => {};
// let/const 최상위 바인딩은 컨텍스트 객체에 올라오지 않으므로 eval 접근자를 붙인다
const NL = String.fromCharCode(10);
const ACCESSOR = NL
  + 'globalThis.__get = function(n){ return eval(n); };' + NL
  + 'globalThis.__run = function(f){ return eval(f); };' + NL;
const withAccess = code + ACCESSOR;
try { vm.runInContext(withAccess, ctx); } catch (e) { console.log('로드 중 예외(무시 가능):', e.message); }
export default ctx;
