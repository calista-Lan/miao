// 在 Node 里用假 DOM 真实执行 miao.js，录下 canvas 绘制指令并还原成 PNG
const fs = require('fs');
const vm = require('vm');
const zlib = require('zlib');

const W = 800, H = 500;
const DIR = __dirname + '/';

// ---------- 录制器 ----------
function makeRecorder() {
  const calls = [];
  let path = { arcs: [], ellipses: [] };
  const ctx = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: 'left', lineCap: 'butt',
    _stack: [],
    fillRect(x, y, w, h) { calls.push({ t: 'r', x, y, w, h, c: this.fillStyle, a: this.globalAlpha }); },
    clearRect(x, y, w, h) { calls.push({ t: 'r', x, y, w, h, c: '#ffffff', a: this.globalAlpha }); },
    beginPath() { path = { arcs: [], ellipses: [] }; },
    arc(x, y, r) { path.arcs.push([x, y, r]); },
    ellipse(x, y, rx, ry) { path.ellipses.push([x, y, rx, ry]); },
    fill() {
      for (const [x, y, r] of path.arcs) calls.push({ t: 'c', x, y, r, c: this.fillStyle, a: this.globalAlpha });
      for (const [x, y, rx, ry] of path.ellipses) calls.push({ t: 'e', x, y, rx, ry, c: this.fillStyle, a: this.globalAlpha });
      path = { arcs: [], ellipses: [] };
    },
    stroke() {},
    moveTo() {}, lineTo() {}, closePath() {},
    save() { this._stack.push([this.fillStyle, this.strokeStyle, this.globalAlpha, this.lineWidth, this.font, this.textAlign]); },
    restore() {
      const s = this._stack.pop();
      if (!s) return;
      [this.fillStyle, this.strokeStyle, this.globalAlpha, this.lineWidth, this.font, this.textAlign] = s;
    },
    translate() {}, rotate() {},
    fillText() {},
    measureText() { return { width: 0 }; },
  };
  return { ctx, calls };
}

// ---------- 光栅化 ----------
function parseColor(s) {
  if (typeof s !== 'string') return [0, 0, 0, 1];
  s = s.trim();
  if (s[0] === '#') {
    if (s.length === 4) {
      return [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16), 1];
    }
    return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((v) => parseFloat(v));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  return [0, 0, 0, 1];
}

function raster(calls) {
  const buf = Buffer.alloc(W * H * 4);
  const put = (x, y, c, a) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const [r, g, b, ca] = parseColor(c);
    const al = (ca === undefined ? 1 : ca) * (a === undefined ? 1 : a);
    if (al <= 0.002) return;
    const o = (y * W + x) * 4;
    buf[o] = Math.round(buf[o] * (1 - al) + r * al);
    buf[o + 1] = Math.round(buf[o + 1] * (1 - al) + g * al);
    buf[o + 2] = Math.round(buf[o + 2] * (1 - al) + b * al);
    buf[o + 3] = 255;
  };
  for (const k of calls) {
    if (k.t === 'r') {
      const x0 = Math.round(k.x), y0 = Math.round(k.y);
      const x1 = Math.round(k.x + k.w), y1 = Math.round(k.y + k.h);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, k.c, k.a);
    } else if (k.t === 'c') {
      const r = k.r;
      for (let y = Math.floor(k.y - r); y <= Math.ceil(k.y + r); y++) {
        for (let x = Math.floor(k.x - r); x <= Math.ceil(k.x + r); x++) {
          if ((x - k.x) ** 2 + (y - k.y) ** 2 <= r * r) put(x, y, k.c, k.a);
        }
      }
    } else if (k.t === 'e') {
      for (let y = Math.floor(k.y - k.ry); y <= Math.ceil(k.y + k.ry); y++) {
        for (let x = Math.floor(k.x - k.rx); x <= Math.ceil(k.x + k.rx); x++) {
          const dx = (x - k.x) / k.rx, dy = (y - k.y) / k.ry;
          if (dx * dx + dy * dy <= 1) put(x, y, k.c, k.a);
        }
      }
    }
  }
  return buf;
}

let CRC_T = null;
function crc32(buf) {
  if (!CRC_T) {
    CRC_T = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_T[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function writePng(path, buf, cx, cy, cw, ch) {
  const x0 = cx === undefined ? 0 : cx, y0 = cy === undefined ? 0 : cy;
  const w = cw === undefined ? W : cw, h = ch === undefined ? H : ch;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    const src = ((y + y0) * W + x0) * 4;
    buf.copy(raw, y * (w * 4 + 1) + 1, src, src + w * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(path, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

function writeSheet(path, buf, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    buf.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(path, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

// 猫＋尾巴所在区域
const CROP = [200, 30, 530, 470];
const keep = {};
function save(name, buf) {
  writePng(DIR + name + '.png', buf);
  writePng(DIR + name + '_c.png', buf, CROP[0], CROP[1], CROP[2], CROP[3]);
  keep[name] = buf;
}
function sheet(out, names, crop) {
  const [cx, cy, cw, ch] = crop;
  const w = cw * names.length;
  const buf = Buffer.alloc(w * ch * 4);
  names.forEach((n, i) => {
    const b = keep[n];
    if (!b) return;
    for (let y = 0; y < ch; y++) {
      const src = ((y + cy) * W + cx) * 4;
      b.copy(buf, (y * w + i * cw) * 4, src, src + cw * 4);
    }
  });
  writeSheet(DIR + out + '.png', buf, w, ch);
}

// ---------- 假 DOM ----------
const { ctx, calls } = makeRecorder();
const elements = {};
const handlers = {};
const canvasEl = {
  width: W, height: H, style: {},
  getContext: () => ctx,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
  addEventListener(type, fn) { (handlers.canvas = handlers.canvas || {})[type] = fn; },
};
function makeEl(id) {
  return {
    id, textContent: '', className: '', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(type, fn) { (handlers[id] = handlers[id] || {})[type] = fn; },
  };
}
const document = {
  getElementById(id) {
    if (id === 'cat-canvas') return canvasEl;
    if (!elements[id]) elements[id] = makeEl(id);
    return elements[id];
  },
  body: { classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
  hidden: false,
  addEventListener() {},
};

let clock = 0;
let pendingFrame = null;
const sandbox = {
  document,
  window: { addEventListener() {}, AudioContext: undefined, webkitAudioContext: undefined },
  performance: { now: () => clock },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  requestAnimationFrame: (cb) => { pendingFrame = cb; },
  setTimeout, clearTimeout, console, Math, Date, JSON, confirm: () => true,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const code = fs.readFileSync(process.argv[2], 'utf8');
vm.runInContext(code, sandbox, { filename: 'miao.js' });

const evalIn = (expr) => { try { return vm.runInContext(expr, sandbox); } catch (e) { return 'ERR: ' + e.message; } };

let t = 1000;
function frame(dtMs) {
  t += (dtMs === undefined ? 16.7 : dtMs);
  clock = t;
  const cb = pendingFrame;
  pendingFrame = null;
  calls.length = 0;
  if (cb) cb(t);
  return calls.slice();
}
function settle(n) { for (let i = 0; i < n; i++) frame(); }

const shots = [];
function shot(name) {
  const c = frame();
  save(name, raster(c));
  shots.push(name);
}

// ---------- 各种姿态 ----------
settle(40);
shot('p_relaxed');

evalIn('state.isPetting = true; state.pettingPart = "head";');
settle(20); shot('p_happy');

evalIn('state.isPetting = false; state.pettingPart = null; state.catState = "alert";');
settle(20); shot('p_alert');

evalIn('state.catState = "relaxed"; state.isPetting = true; state.pettingPart = "tail"; state.tailTouchDuration = 0.3;');
settle(12); shot('p_flick');

evalIn('state.catState = "annoyed"; state.annoyedUntil = performance.now() + 9999;');
settle(30);
// 拍地板：抬起最高 / 拍下瞬间
let bestLift = -1, bestLiftT = t, bestImpact = -1, bestImpactT = t;
for (let i = 0; i < 200; i++) {
  const nt = t + 16.7;
  const sp = (nt / 1000 * 1.05) % 1;
  if (sp > 0.30 && sp < 0.36 && bestLift < 0) { bestLift = sp; bestLiftT = nt; }
  if (sp > 0.48 && sp < 0.54 && bestImpact < 0) { bestImpact = sp; bestImpactT = nt; }
  t = nt;
}
function shotAt(name, targetT) {
  while (t < targetT - 8) frame();
  clock = targetT; t = targetT;
  const cb = pendingFrame; pendingFrame = null; calls.length = 0;
  if (cb) cb(t);
  save(name, raster(calls.slice()));
  shots.push(name);
}
shotAt('p_annoyed_lift', bestLiftT);
shotAt('p_annoyed_slap', bestImpactT);

// 生气：从「烦躁没停手」的升级路径进入
evalIn('state.catState = "annoyed"; state.isPetting = true; state.pettingPart = "tail"; state.annoyedUntil = performance.now() - 1;');
settle(1);
const st1 = evalIn('state.catState');
settle(4); shot('p_angry_pop');
settle(24); shot('p_angry');

// 生气不同甩尾相位
evalIn('state.angryStart = performance.now(); state.angryUntil = performance.now() + 9000;');
for (let i = 0; i < 4; i++) { settle(7); shot('p_angry_lash' + i); }

// 睡觉 / 盯梢 / 扑击
evalIn('state.catState = "relaxed"; state.isPetting = false; state.pettingPart = null; state.asleep = true;');
settle(30); shot('p_asleep');
evalIn('state.asleep = false; toy.active = true;');
settle(30); shot('p_stalk');
evalIn('toy.active = false; state.jumpY = -60; state.jumpV = -40;');
settle(6); shot('p_pounce');
evalIn('state.jumpY = 0; state.jumpV = 0;');

// 生气 + 夜里
evalIn('settings.night = true; document.body.classList.toggle("night", true); state.catState = "angry"; state.angryStart = performance.now(); state.angryUntil = performance.now() + 9000;');
settle(14); shot('p_angry_night');

// 索求姿态：饿的时候尾巴什么形状
evalIn('settings.night = false; state.catState = "relaxed"; state.asleep = false; state.want = "food";');
settle(6); shot('p_needy');

// 整屋预览：昼夜两端各拍一张（直接置昼夜过渡值，避免停在中间态）
evalIn('settings.night = false; dayMix = 0; state.catState = "relaxed"; state.want = null; state.asleep = false; state.isPetting = false; particles.length = 0;');
settle(6); shot('p_room_day');
evalIn('settings.night = true; dayMix = 1;');
settle(6); shot('p_room_night');
const roomDayMixNote = 'roomDayMix=' + evalIn('dayMix');
evalIn('settings.night = false; dayMix = 0;');

// ---------- 自主走动 ----------
const walkLog = [];
// 让猫保持清醒、不被打断的干净状态
const holdAwake = 'state.asleep = false; state.sleepNext = performance.now() + 9999999; toy.active = false; fish.state = "none"; state.isPetting = false; state.pettingPart = null; state.catState = "relaxed"; state.want = null; state.jumpY = 0; state.jumpV = 0; ';

// 迈步中的样子（左 / 右各一张，顺便看前爪交替）
evalIn(holdAwake + 'particles.length = 0; state.cx = 420; state.walkTargetX = CONFIG.roam.minX; state.walkDir = -1; state.walkPhase = 1.5;');
settle(1); shot('p_walk_left');
evalIn(holdAwake + 'state.cx = 420; state.walkTargetX = CONFIG.roam.maxX; state.walkDir = 1; state.walkPhase = 4.7;');
settle(1); shot('p_walk_right');

// 一路往左走到头
evalIn(holdAwake + 'state.cx = 420; state.walkTargetX = CONFIG.roam.minX; state.walkDir = -1;');
let guard = 0;
while (evalIn('state.walkDir') !== 0 && guard++ < 900) frame();
shot('p_far_left');
walkLog.push('walkToLeft: cx=' + evalIn('Math.round(state.cx)') + ' dir=' + evalIn('state.walkDir') + ' frames=' + guard + ' (minX=' + evalIn('CONFIG.roam.minX') + ')');

// 一路往右走到头
evalIn(holdAwake + 'state.cx = 420; state.walkTargetX = CONFIG.roam.maxX; state.walkDir = 1;');
guard = 0;
while (evalIn('state.walkDir') !== 0 && guard++ < 900) frame();
shot('p_in_nest');
walkLog.push('walkToRight: cx=' + evalIn('Math.round(state.cx)') + ' dir=' + evalIn('state.walkDir') + ' frames=' + guard + ' (maxX=' + evalIn('CONFIG.roam.maxX') + ')');

// 越界兜底
evalIn('state.cx = 99999;'); frame();
walkLog.push('clampHigh: cx=' + evalIn('Math.round(state.cx)'));
evalIn('state.cx = -99999;'); frame();
walkLog.push('clampLow: cx=' + evalIn('Math.round(state.cx)'));

// 该安静的时候它不该乱跑
const quiet = [];
const quietCases = [
  ['asleep', 'state.asleep = true; state.sleepUntil = performance.now() + 9999999;'],
  ['annoyed', 'state.sleepNext = performance.now() + 9999999; state.asleep = false; state.catState = "annoyed"; state.annoyedUntil = performance.now() + 99999;'],
  ['eating', 'state.catState = "relaxed"; fish.state = "eating"; fish.timer = 0;'],
  ['petting', 'fish.state = "none"; state.isPetting = true; state.pettingPart = "head";'],
  ['toy', 'state.isPetting = false; state.pettingPart = null; toy.active = true;'],
];
for (const [name, setup] of quietCases) {
  evalIn('state.cx = 400; state.walkDir = 0; state.walkPause = 0; ' + setup);
  settle(110);
  quiet.push(name + '=' + evalIn('state.walkDir') + '@' + evalIn('Math.round(state.cx)'));
}
walkLog.push('quietWhile: ' + quiet.join('  '));
evalIn(holdAwake);

// 平时它确实会自己换地方
evalIn(holdAwake + 'state.cx = 400; state.walkDir = 0; state.walkPause = 0; state.needs.energy = 70;');
let moved = 0, spots = {};
for (let i = 0; i < 3000; i++) {
  frame();
  if (evalIn('state.walkDir') !== 0) moved++;
  const sp = evalIn('state.roamSpot');
  spots[sp] = (spots[sp] || 0) + 1;
}
walkLog.push('roamFrames=' + moved + '/3000 endCx=' + evalIn('Math.round(state.cx)'));
walkLog.push('spots=' + JSON.stringify(spots));

// 困了会往猫窝走（直接问选择逻辑，不靠随机）
walkLog.push('tiredPick=' + evalIn('state.needs.energy = 20; pickSpot().name') + '  freshPick=' + evalIn('state.needs.energy = 70; pickSpot().name'));
// 走动时间占比
const share = Math.round(moved / 3000 * 100);
walkLog.push('walkShare=' + share + '%');

// ---------- 拍地板：灰尘粒子 / 触发次数 ----------
evalIn('state.catState = "annoyed"; state.annoyedUntil = performance.now() + 999999; state.isPetting = true; state.pettingPart = "tail"; state.affection = 50; particles.length = 0;');
settle(10);
let dustMax = 0, joltSeen = 0;
for (let i = 0; i < 200; i++) {
  frame();
  const d = evalIn('particles.filter(function(p){return p.kind === "dust";}).length');
  if (typeof d === 'number' && d > dustMax) dustMax = d;
  if (evalIn('state.tailJolt') > 0.5) joltSeen++;
}
const slapNote = 'dustMax=' + dustMax + ' joltFrames=' + joltSeen + ' tailMode=' + evalIn('state.tailMode');

// ---------- 状态机 / 运行时错误检查 ----------
let errors = [];
process.on('uncaughtException', (e) => errors.push(String(e)));

// 用合成事件跑一遍完整升级链：摸尾巴 → 烦躁 → 生气
const down = handlers.canvas.mousedown, up = handlers.canvas.mouseup, move = handlers.canvas.mousemove;
evalIn('settings.night = false; state.catState = "relaxed"; state.asleep = false; state.affection = 50;');
settle(5);
const log = [];
const tailPt = { clientX: 560, clientY: 420 };
function press(pt) { move({ clientX: pt.clientX, clientY: pt.clientY }); down({ clientX: pt.clientX, clientY: pt.clientY }); }
let seen = {};
for (let i = 0; i < 400; i++) {
  if (i === 0) press(tailPt);
  frame();
  const cs = evalIn('state.catState');
  if (!seen[cs]) { seen[cs] = t; log.push(cs + ' @' + Math.round(t)); }
}
up({});
for (let i = 0; i < 120; i++) frame();
log.push('after release: ' + evalIn('state.catState') + ' / tailMode=' + evalIn('state.tailMode'));

// 摸头 → 开心尾巴
evalIn('state.catState = "relaxed";');
press({ clientX: 400, clientY: 200 });
settle(20);
log.push('head pet: state=' + evalIn('state.catState') + ' tailMode=' + evalIn('state.tailMode'));
up({});
settle(30);
log.push('after head release: state=' + evalIn('state.catState') + ' tailMode=' + evalIn('state.tailMode') + ' msg=' + JSON.stringify(elements['tail-state'].textContent));
log.push('affection=' + evalIn('Math.round(state.affection)') + ' bodyOffset=' + evalIn('Math.round(state.bodyOffset)'));
log.push('tail-state class=' + elements['tail-state'].className);
log.push('angrySeen=' + JSON.stringify(seen));
// ---------- v0.6 需求系统验证 ----------
evalIn('state.needs.satiety = 90; state.needs.energy = 90; state.needs.mood = 90; state.lastSeen = Date.now() - 600 * 1000;');
evalIn('applyOfflineDecay();');
log.push('offline 10min -> sat=' + evalIn('Math.round(state.needs.satiety)') + ' eng=' + evalIn('Math.round(state.needs.energy)') + ' mood=' + evalIn('Math.round(state.needs.mood)'));
log.push('offline msg=' + JSON.stringify(elements['message'].textContent));

evalIn('state.needs.satiety = 95; fish.state = "none"; feedCooldownUntil = 0; toy.active = false; state.catState = "relaxed";');
evalIn('feed();');
log.push('feed@satiety95 -> fish=' + evalIn('fish.state') + ' msg=' + JSON.stringify(elements['message'].textContent));

evalIn('state.needs.satiety = 20; feedCooldownUntil = 0; state.affection = 50; feed();');
const fedStart = evalIn('fish.state');
for (let i = 0; i < 500; i++) frame();
log.push('feed@satiety20 -> started=' + fedStart + ' sat=' + evalIn('Math.round(state.needs.satiety)') + ' aff=' + evalIn('Math.round(state.affection)') + ' stuffed=' + evalIn('Math.round(state.stuffed)'));

evalIn('state.needs.energy = 10; toy.active = true; toy.cooldownUntil = 0;');
evalIn('catchToy(performance.now());');
log.push('toy@energy10 -> eng=' + evalIn('Math.round(state.needs.energy)') + ' msg=' + JSON.stringify(elements['message'].textContent));

evalIn('toy.active = false; state.catState = "relaxed"; state.needs.satiety = 15; state.needs.mood = 80; state.needs.energy = 50; state.want = null; state.wantNext = 0;');
settle(4);
log.push('hungry -> want=' + evalIn('state.want') + ' tailMode=' + evalIn('state.tailMode') + ' tailUI=' + JSON.stringify(elements['tail-state'].textContent));

evalIn('state.needs.satiety = 90; state.needs.mood = 90; state.needs.energy = 50; state.want = null; state.catState = "relaxed";');
settle(4);
log.push('satisfied -> want=' + evalIn('state.want') + ' tailMode=' + evalIn('state.tailMode'));
log.push('needBars=' + evalIn('[needSatietyEl.style.width, needEnergyEl.style.width, needMoodEl.style.width].join("/")'));

log.push('errors=' + JSON.stringify(errors));
log.push(slapNote);
walkLog.forEach(function(l){ log.push(l); });
log.push('modes ok? ' + JSON.stringify(evalIn('Object.keys(TAIL_MODES).filter(function(k){return !TAIL_TEXT[k] || !TAIL_MODES[k].base;})')));
log.push('angerGrid: ' + evalIn('ANGER.length + "x" + ANGER[0].length'));

function sheetGrid(out, names, cols, crop) {
  const [cx, cy, cw, ch] = crop;
  const rows = Math.ceil(names.length / cols);
  const w = cw * Math.min(cols, names.length);
  const h = ch * rows;
  const buf = Buffer.alloc(w * h * 4);
  names.forEach((n, i) => {
    const b = keep[n];
    if (!b) return;
    const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch;
    for (let y = 0; y < ch; y++) {
      const src = ((y + cy) * W + cx) * 4;
      b.copy(buf, ((y + oy) * w + ox) * 4, src, src + cw * 4);
    }
  });
  writeSheet(DIR + out + '.png', buf, w, h);
}

sheetGrid('walk_paws', ['p_walk_left', 'p_walk_right'], 2, [300, 400, 240, 90]);
sheetGrid('preview_tail', ['p_relaxed', 'p_needy', 'p_happy', 'p_flick', 'p_annoyed_lift', 'p_annoyed_slap', 'p_angry', 'p_asleep', 'p_stalk'], 3, [470, 320, 240, 170]);
sheetGrid('preview_face', ['p_angry', 'p_angry_pop', 'p_relaxed'], 3, [265, 195, 270, 175]);
sheetGrid('preview_all', ['p_relaxed', 'p_annoyed_lift', 'p_angry'], 3, [175, 190, 490, 300]);

sheet('tail_a', ['p_relaxed', 'p_happy', 'p_flick', 'p_annoyed_lift'], [480, 320, 230, 170]);
sheet('tail_b', ['p_annoyed_slap', 'p_angry_lash1', 'p_asleep', 'p_stalk'], [480, 320, 230, 170]);
sheet('face_a', ['p_angry', 'p_angry_lash2', 'p_angry_night'], [230, 40, 300, 300]);
sheet('misc', ['p_relaxed', 'p_happy', 'p_alert', 'p_pounce'], [175, 190, 490, 300]);

log.push(roomDayMixNote);

fs.writeFileSync(DIR + 'result.txt', 'shots: ' + shots.join(',') + '\n' + log.join('\n') + '\n', 'utf8');
console.log('done');
