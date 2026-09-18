function stubCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'measureText') return () => ({ width: 10 });
      return (...a) => calls.push(String(k));
    },
    set() { return true; }
  });
}
const calls = [];
const els = {};
function makeEl(id) {
  return {
    id, style: {}, classList: { add() {}, remove() {}, toggle() {} },
    textContent: '', innerHTML: '',
    addEventListener() {},
    getContext: () => stubCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }),
    width: 800, height: 500,
  };
}
global.document = {
  getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
  body: { classList: { add() {}, remove() {}, toggle() {} } },
};
global.window = { addEventListener() {} };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let frame = 0;
global.requestAnimationFrame = (fn) => { if (frame < 12) { frame++; fn(performance.now() + frame * 16); } };

eval(require('fs').readFileSync('./miao.js', 'utf8'));

// 冒烟：投喂 → 鱼落下开吃 → 再投喂（应提示冷却）→ 渲染
feed();
for (let i = 0; i < 400; i++) updateFish(1 / 60);
console.log('fish state after feed+sim:', fish.state, '| timer:', fish.timer.toFixed(2));
feed();
console.log('msg during cooldown:', messageEl.textContent);
state.asleep = true; renderCat(performance.now(), 0); state.asleep = false;
state.catState = 'annoyed'; renderCat(performance.now(), 0); state.catState = 'relaxed';
state.eyeLookX = 1; state.eyeLookY = 1; renderCat(performance.now(), 0);
drawFish();
draw(performance.now());
console.log('SMOKE OK, ctx calls:', calls.length, ', frames:', frame);
