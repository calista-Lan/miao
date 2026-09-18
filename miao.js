// ============================================================
//  读懂猫 v0.8
//  像素风猫咪 / 眼睛跟随鼠标（桌面宠物）/ 投喂小鱼干 /
//  声音开关 / 昼夜 / 逗猫棒 / 换毛色 / 瞌睡眨眼 / 头衔 / 统计 / 快捷键
//  v0.5 新增：生气状态（飞机耳 + 右上角怒气符号）/
//             会说话的尾巴（按猫行为学切换姿态，不耐烦时拍地板）
//  v0.6 新增：需求系统 —— 饱食 / 精力 / 心情随时间衰减（离线也算），
//             猫会主动索要；吃饱了会被拒绝、没力气玩不动、闷了摸头不领情
//  v0.7 新增：居家场景 —— 画面从「天空 + 一块地板」改成一间屋子
//             （墙纸 / 木地板 / 地毯 / 窗户 / 窗帘 / 挂画 / 搁板 / 盆栽 / 猫窝），
//             昼夜改为窗外天光 + 室内灯光，全屋配色随昼夜平滑过渡
//  v0.8 新增：猫变小了（S 14 → 10，几何全由常量推导）
//             自主走动 —— 自己在屋里换地方待着、前爪交替迈步、脚下扬灰、
//             困了往猫窝走（卧进去时下半身被窝口挡住）
//  v0.9 修复：长按猫头可以无限刷好感度（一路飙到挚友）。
//             现在加了「撸猫耐受度」——连续摸的手感会衰减，
//             尾巴抽动预警 → 摸腻了就烦躁，不收手还是会炸毛
// ============================================================

// ---------- 配置 ----------
const CONFIG = {
  affection: {
    start: 50,
    max: 100,
    headRelaxed: 3,      // 撸猫的起始收益（点/秒），会随耐受度衰减
    // 撸猫耐受度：一直被摸，猫会腻。这是防止"长按刷到挚友"的核心
    strokeFill: 6,       // 连续抚摸几秒，耐受度攒满（撸腻）
    strokeCool: 10,      // 收手后耐受度完全消退需要几秒
    strokeAfter: 0.68,   // 撸腻触发后残留的耐受度（马上再摸只有很短的窗口）
    strokeHint: 0.55,    // 超过这个进度，尾巴开始抽动提醒你
    headAlert: -2,
    headAnnoyed: -4,
    headAngry: -7,
    tailRelaxed: 0.5,
    tailAlert: -2,
    tailAnnoyed: -6,
    tailAngry: -8,
    stopInTime: 3,
    stopLate: -5,
    toyCatch: 2,
  },
  // ---------- v0.6 需求系统 ----------
  // 各需求从 100 衰减到 0 所需的秒数
  needs: {
    satietyDur: 1800,       // 饱食：约 30 分钟
    energyDur: 1500,        // 精力：约 25 分钟
    moodDur: 2700,          // 心情：约 45 分钟
    offlineCap: 6 * 3600,   // 离线最多结算 6 小时，再久也不会一路归零
    warn: 32,               // 低于此值，猫开始主动索要
    full: 85,               // 饱食高于此值，猫拒绝进食
    tired: 25,              // 精力低于此值，玩不动逗猫棒
    glum: 30,               // 心情低于此值，摸头收益减半
    eatGain: 34,            // 一条小鱼干补多少饱食
    sleepRegen: 7,          // 睡觉时每秒回复多少精力
  },
  // ---------- v0.8 自主走动 ----------
  // 猫会自己在屋里换地方：去猫窝趴着、去窗边晒太阳、去盆栽旁蹲着
  roam: {
    minX: 214,              // 身体中心能到的最左
    maxX: 648,              // 身体中心能到的最右
    speed: 56,              // 每秒走多少像素
    pauseMin: 3,            // 到地方后至少待几秒
    pauseMax: 8,
    idleChance: 0.3,        // 该决定时有多大比例选择"原地不动"
    spots: [
      { name: 'nest',  x: 646 },   // 猫窝
      { name: 'sun',   x: 300 },   // 窗边那块地毯
      { name: 'plant', x: 250 },   // 盆栽旁
      { name: 'rug',   x: 420 },   // 地毯中央
      { name: 'mid',   x: 520 },   // 屋子中间偏右
    ],
  },
  tailIrritationTime: 1.5,
  annoyedTimeout: 1.5,
  angryTimeout: 3.0,      // 生气持续多久
  angryFromAlert: 0.6,    // 警戒状态下摸尾巴多久会炸
  alertRecoveryTime: 5,
  sleep: { min: 18, max: 40, durMin: 5, durMax: 9 },
  toy: { cooldown: 5 },
  // 好感度头衔（从高到低匹配）
  levels: [
    { min: 80, name: '挚友',   emoji: '💞' },
    { min: 60, name: '好友',   emoji: '🧡' },
    { min: 40, name: '朋友',   emoji: '😊' },
    { min: 20, name: '熟人',   emoji: '👀' },
    { min: 0,  name: '陌生人', emoji: '🙀' },
  ],
};

// 猫毛色方案
const PALETTES = [
  { name: '橘色虎斑', body: '#e8a15a', belly: '#f5c890', stripe: '#d89050', innerEar: '#f5b8b0', line: '#8a6040' },
  { name: '蓝色狸花', body: '#8a8f99', belly: '#c0c6d0', stripe: '#6a6f79', innerEar: '#d8c0c8', line: '#4a4e58' },
  { name: '黑猫',     body: '#45454e', belly: '#65656f', stripe: '#32323a', innerEar: '#8a6a78', line: '#26262c' },
  { name: '白猫',     body: '#f2ede6', belly: '#ffffff', stripe: '#ddd6ca', innerEar: '#f0b0a8', line: '#a89888' },
];

// ---------- 状态 ----------
const state = {
  affection: CONFIG.affection.start,
  catState: 'relaxed',
  isPetting: false,
  pettingPart: null,
  stroke: 0,            // 撸猫耐受度 0-1：越摸越高，收益越低，满了就翻脸
  strokeHinted: false,  // 本次是否已经提醒过"摸久了"
  tailTouchDuration: 0,
  annoyedUntil: 0,
  angryUntil: 0,
  angryStart: 0,
  alertTimer: 0,

  // 尾巴（按猫行为学切换姿态）
  tailMode: 'relaxed',
  tailPrevPhase: 0,
  tailJolt: 0,
  tailTip: { c: 20, r: 21 },

  // 视觉状态
  earAngle: 0,
  headTilt: 0,
  headTurn: 0,
  eyeLookX: 0,
  eyeLookY: 0,
  bodyOffset: 0,
  purrPhase: 0,

  // v0.3 新增
  asleep: false,
  sleepNext: 0,
  sleepUntil: 0,
  zzzTimer: 0,
  blinkNext: 0,
  blinkUntil: 0,
  jumpY: 0,
  jumpV: 0,
  levelName: '',

  // v0.6 需求（0-100）
  needs: { satiety: 76, energy: 74, mood: 72 },
  want: null,          // 当前诉求：'food' | 'attention' | 'play'
  wantNext: 0,
  stuffed: 0,          // 吃撑的剩余秒数
  lastSeen: 0,         // 上次离开时的时间戳（离线结算用）

  // v0.8 自主走动
  cx: 400,             // 猫在屋里的身体中心 x（它自己会走）
  roamSpot: 'rug',     // 当前待的地方
  walkDir: 0,          // 0 停着 / -1 往左 / 1 往右
  walkPhase: 0,        // 步态相位
  walkTargetX: 400,
  walkPause: 0,        // 这次停留到什么时候
  walkDust: 0,         // 已走过的距离（攒够就扬一点灰）
  lean: 0,             // 走动时向行进方向偏的角度
};

const stats = { best: CONFIG.affection.start, petTime: 0, pets: 0 };
const settings = { muted: false, night: false, color: 0 };

// 逗猫棒
const toy = {
  active: false,
  x: 650,
  y: 150,
  baseY: 150,
  vx: 60,
  phase: 0,
  cooldownUntil: 0,
};

// ---------- DOM ----------
const canvas = document.getElementById('cat-canvas');
const ctx = canvas.getContext('2d');
const affectionEl = document.getElementById('affection-value');
const affectionBar = document.getElementById('affection-bar');
const stateEl = document.getElementById('cat-state');
const titleEl = document.getElementById('cat-title');
const messageEl = document.getElementById('message');
const catNameEl = document.getElementById('cat-name');
const statBestEl = document.getElementById('stat-best');
const statPetTimeEl = document.getElementById('stat-pettime');
const statPetsEl = document.getElementById('stat-pets');
const btnSound = document.getElementById('btn-sound');
const btnNight = document.getElementById('btn-night');
const btnToy = document.getElementById('btn-toy');
const btnColor = document.getElementById('btn-color');
const btnReset = document.getElementById('btn-reset');
const btnFeed = document.getElementById('btn-feed');
const tailStateEl = document.getElementById('tail-state');
const needSatietyEl = document.getElementById('need-satiety');
const needEnergyEl = document.getElementById('need-energy');
const needMoodEl = document.getElementById('need-mood');

// ---------- 鼠标 ----------
const mouse = { x: 400, y: 250, inside: false };

// 星星（只在窗户玻璃里）
const STARS = [];
for (let i = 0; i < 34; i++) {
  STARS.push({
    x: 619 + Math.random() * 154,
    y: 71 + Math.random() * 178,
    r: 0.5 + Math.random() * 1.3,
    ph: Math.random() * Math.PI * 2,
  });
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

// 需求衰减速率（每秒）
const NEED_RATE = {
  satiety: 100 / CONFIG.needs.satietyDur,
  energy: 100 / CONFIG.needs.energyDur,
  mood: 100 / CONFIG.needs.moodDur,
};

function clampNeed(v) {
  return Math.max(0, Math.min(100, v));
}

function clampAffection(v) {
  return Math.max(0, Math.min(CONFIG.affection.max, v));
}

// ============================================================
//  音频（Web Audio API，无需素材）
// ============================================================
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function audioReady() {
  if (settings.muted) return null;
  return ensureAudio();
}

function playPurr(duration = 0.6) {
  const ac = audioReady();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const mod = ac.createOscillator();
  const modGain = ac.createGain();
  const gain = ac.createGain();

  osc.type = 'sawtooth';
  osc.frequency.value = 26;
  mod.type = 'sine';
  mod.frequency.value = 24;
  modGain.gain.value = 10;
  mod.connect(modGain);
  modGain.connect(osc.frequency);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.1);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  mod.start();
  osc.stop(now + duration);
  mod.stop(now + duration);
}

function playMeow() {
  const ac = audioReady();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.linearRampToValueAtTime(900, now + 0.08);
  osc.frequency.linearRampToValueAtTime(400, now + 0.35);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.07, now + 0.03);
  gain.gain.linearRampToValueAtTime(0.05, now + 0.2);
  gain.gain.linearRampToValueAtTime(0, now + 0.35);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(now + 0.35);
}

function playHiss() {
  const ac = audioReady();
  if (!ac) return;
  const now = ac.currentTime;
  const size = ac.sampleRate * 0.35;
  const buffer = ac.createBuffer(1, size, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / size, 2);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1800;
  const gain = ac.createGain();
  gain.gain.value = 0.12;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  src.start(now);
}

// 头衔升级的清脆双音
function playChime() {
  const ac = audioReady();
  if (!ac) return;
  const now = ac.currentTime;
  [660, 880].forEach((f, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    const t0 = now + i * 0.12;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.08, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + 0.4);
  });
}

// 扑猫棒的短促音效
function playPounce() {
  const ac = audioReady();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(120, now + 0.15);
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(now + 0.2);
}

// 按钮轻响
function playTick() {
  const ac = audioReady();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = 520;
  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(now + 0.08);
}

// 尾巴拍地板的闷响
function playThud() {
  const ac = audioReady();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(58, now + 0.09);
  gain.gain.setValueAtTime(0.09, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(now + 0.15);
}

// 生气的低吼
function playGrowl(duration = 0.7) {
  const ac = audioReady();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const mod = ac.createOscillator();
  const modGain = ac.createGain();
  const gain = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = 92;
  mod.type = 'square';
  mod.frequency.value = 34;
  modGain.gain.value = 26;
  mod.connect(modGain);
  modGain.connect(osc.frequency);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.075, now + 0.06);
  gain.gain.linearRampToValueAtTime(0.05, now + duration * 0.7);
  gain.gain.linearRampToValueAtTime(0, now + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  mod.start();
  osc.stop(now + duration);
  mod.stop(now + duration);
}

// ============================================================
//  粒子
// ============================================================
const particles = [];

function spawnHeart(x, y) {
  particles.push({
    x, y,
    vy: -40 - Math.random() * 20,
    vx: (Math.random() - 0.5) * 20,
    life: 1.2,
    maxLife: 1.2,
    size: 14 + Math.random() * 6,
    color: '#e87a8a',
    char: '♥',
  });
}

function spawnMark(x, y, char, color) {
  particles.push({
    x, y,
    vy: -50,
    vx: 0,
    life: 1.0,
    maxLife: 1.0,
    size: 22,
    color: color || '#cf5f4a',
    char: char,
  });
}

function spawnZzz(x, y) {
  particles.push({
    x, y,
    vy: -30,
    vx: 12,
    life: 2.0,
    maxLife: 2.0,
    size: 16 + Math.random() * 8,
    color: '#8a9ab8',
    char: 'Z',
  });
}

// 尾巴拍地板激起的灰尘
function spawnDust(x, y, color) {
  for (let i = 0; i < 6; i++) {
    particles.push({
      kind: 'dust',
      x: x + rand(-10, 10),
      y: y + rand(-5, 3),
      vx: rand(-55, 55),
      vy: rand(-70, -18),
      life: rand(0.35, 0.6),
      maxLife: 0.6,
      size: rand(3, 6),
      color: color || '#c4b4a4',
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (p.kind === 'dust') p.vy += 260 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    if (p.kind === 'dust') {
      const s = Math.max(2, p.size * (0.5 + alpha * 0.5));
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    } else {
      ctx.font = `bold ${p.size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(p.char, p.x, p.y);
    }
    ctx.restore();
  }
}

// ============================================================
//  存档
// ============================================================
const SAVE_KEY = 'cat-game-v03';
let messageTimer = null;

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.affection === 'number') {
      state.affection = clampAffection(data.affection);
    }
    if (data.stats) {
      if (typeof data.stats.best === 'number') stats.best = clampAffection(data.stats.best);
      if (typeof data.stats.petTime === 'number') stats.petTime = data.stats.petTime;
      if (typeof data.stats.pets === 'number') stats.pets = data.stats.pets;
    }
    if (data.settings) {
      if (typeof data.settings.muted === 'boolean') settings.muted = data.settings.muted;
      if (typeof data.settings.night === 'boolean') settings.night = data.settings.night;
      if (typeof data.settings.color === 'number' && data.settings.color >= 0 && data.settings.color < PALETTES.length) {
        settings.color = data.settings.color;
      }
    }
    if (data.needs) {
      const n = data.needs;
      if (typeof n.satiety === 'number') state.needs.satiety = clampNeed(n.satiety);
      if (typeof n.energy === 'number') state.needs.energy = clampNeed(n.energy);
      if (typeof n.mood === 'number') state.needs.mood = clampNeed(n.mood);
    }
    if (typeof data.lastSeen === 'number') state.lastSeen = data.lastSeen;
  } catch (e) {}
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      affection: state.affection,
      stats,
      settings,
      needs: state.needs,
      lastSeen: Date.now(),
    }));
  } catch (e) {}
}

// ============================================================
//  功能开关
// ============================================================
function toggleSound() {
  settings.muted = !settings.muted;
  btnSound.textContent = settings.muted ? '🔇' : '🔊';
  btnSound.classList.toggle('active', !settings.muted);
  if (!settings.muted) playTick();
  showMessage(settings.muted ? '声音已关闭' : '声音已开启');
  saveGame();
}

function toggleNight() {
  settings.night = !settings.night;
  document.body.classList.toggle('night', settings.night);
  btnNight.textContent = settings.night ? '☀️' : '🌙';
  btnNight.classList.toggle('active', settings.night);
  playTick();
  showMessage(settings.night ? '夜幕降临了' : '天亮了');
  saveGame();
}

function toggleToy() {
  toy.active = !toy.active;
  if (toy.active) {
    toy.x = rand(120, 680);
    toy.baseY = rand(90, 280);
    toy.vx = (Math.random() < 0.5 ? -1 : 1) * rand(50, 90);
    toy.phase = Math.random() * 10;
    toy.cooldownUntil = 0;
  }
  btnToy.classList.toggle('active', toy.active);
  playTick();
  showMessage(toy.active ? '逗猫棒来啦！点击羽毛让猫扑它' : '收起逗猫棒');
}

function cycleColor() {
  settings.color = (settings.color + 1) % PALETTES.length;
  catNameEl.textContent = PALETTES[settings.color].name + ' · 你的虚拟猫';
  playTick();
  showMessage('换了一只毛色：' + PALETTES[settings.color].name);
  saveGame();
}

function resetGame() {
  if (!confirm('确定要重置全部进度吗？好感度、统计和设置都会清空。')) return;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  state.affection = CONFIG.affection.start;
  state.catState = 'relaxed';
  state.alertTimer = 0;
  state.levelName = '';
  state.annoyedUntil = 0;
  state.angryUntil = 0;
  state.stroke = 0;
  state.strokeHinted = false;
  state.tailTouchDuration = 0;
  state.tailMode = 'relaxed';
  updateTailUI();
  stats.best = CONFIG.affection.start;
  stats.petTime = 0;
  stats.pets = 0;
  state.needs.satiety = 76;
  state.needs.energy = 74;
  state.needs.mood = 72;
  state.want = null;
  state.stuffed = 0;
  state.lastSeen = 0;
  state.cx = 400;
  state.roamSpot = 'rug';
  state.walkDir = 0;
  state.walkPhase = 0;
  state.walkPause = 0;
  state.walkDust = 0;
  state.lean = 0;
  settings.night = false;
  document.body.classList.remove('night');
  btnNight.textContent = '🌙';
  btnNight.classList.remove('active');
  updateUI();
  showMessage('全部重置，和猫重新建立友谊吧！');
  playMeow();
}

btnSound.addEventListener('click', toggleSound);
btnNight.addEventListener('click', toggleNight);
btnToy.addEventListener('click', toggleToy);
btnColor.addEventListener('click', cycleColor);
btnReset.addEventListener('click', resetGame);
btnFeed.addEventListener('click', feed);

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'm') toggleSound();
  else if (k === 'n') toggleNight();
  else if (k === 't') toggleToy();
  else if (k === 'c') cycleColor();
  else if (k === 'f') feed();
});

// ============================================================
//  绘制
// ============================================================

// ============================================================
//  像素猫绘制
// ============================================================

const S = 10; // 每个像素的画布尺寸（猫的大小就由它决定）
const K = S / 14; // 相对初版的比例，所有固定像素偏移都要乘它
const SPRITE = [
  "....o..............o....",
  "....oP............Po....",
  "....oPP..........PPo....",
  "....oPPP........PPPo....",
  "....oPPPPOOOOOOPPPPo....",
  "...OOOOOOOOOOOOOOOOOO...",
  "..OOooOOOOOOOOOOOOooOO..",
  "..OOOIIIIOOOOOOIIIIOOO..",
  "..OOOIIIIOOOOOOIIIIOOO..",
  "..OOOIIIIOOOOOOIIIIOOO..",
  "..OOOIIIIOOOOOOIIIIOOO..",
  "..OOOIIIIOOOOOOIIIIOOO..",
  "...OOoooOOOOOOOOoooOO...",
  "....OOOOOWWWWWWOOOOO....",
  "....OOOOOWWPPWWOOOOO....",
  "....OOOOOWKWWKWOOOOO....",
  "....OOOOOWWKKWWOOOOO....",
  ".....OOOWWWWWWWWOOO.....",
  "....OOOOOWWWWWWOOOOO....",
  "....OOoooWWWWWWoooOO....",
  "....OOOOOWWWWWWOOOOO....",
  "....OWWWWOOOOOOWWWWO....",
  "....OWWWWOOOOOOWWWWO....",
];

const GH = SPRITE.length;
const GW = 24;

// 猫脚底踩在木地板上的高度，以及精灵第一行落在哪
const CAT_FOOT_Y = 452;
const CAT_TOP_Y = CAT_FOOT_Y - GH * S;
const CAT_HALF_W = (GW / 2) * S;

// 猫当前的身体中心（含被摸/被吓退后的位移）
function catX() {
  return state.cx + state.bodyOffset;
}

// 不透明掩码（用于自动描边）
const SOLID = SPRITE.map((row) => row.split('').map((ch) => ch !== '.'));

// ---- 耳朵占用的格子（行 0~4；行 4 中间是头顶不算）——生气时换成「飞机耳」 ----
const EAR_CELLS = new Set();
for (let r = 0; r <= 4; r++) {
  for (let c = 0; c < GW; c++) {
    if (!SOLID[r][c]) continue;
    if (r === 4 && c >= 9 && c <= 14) continue;
    EAR_CELLS.add(r * 100 + c);
  }
}
function isEar(r, c) { return EAR_CELLS.has(r * 100 + c); }

// 去掉耳朵后的实体掩码：身体靠它来判断填充与描边，
// 耳朵本身改成三角形单独绘制（这样就不需要"擦墙重画"了）
const SOLID_NO_EAR = SOLID.map((row, r) => row.map((v, c) => v && !isEar(r, c)));
function solidBodyAt(r, c) {
  if (r < 0 || r >= GH || c < 0 || c >= GW) return false;
  return SOLID_NO_EAR[r][c];
}

// 直立耳（左耳）三角形：耳尖、耳根外、耳根内（连续网格坐标）
const EAR_TRI = [{ c: 4.2, r: 0.2 }, { c: 4.0, r: 5.0 }, { c: 9.0, r: 5.0 }];
const EAR_INNER = [{ c: 5.6, r: 1.5 }, { c: 5.4, r: 4.7 }, { c: 8.6, r: 4.7 }];
const EAR_PIVOT = { c: 6.5, r: 5.0 };
const EAR_FLAT_DEG = -75; // 生气时整只耳朵向外压平（飞机耳）

// ============================================================
//  尾巴：参考真实猫的尾巴语言，按状态切换姿态
//    relaxed 放松  尾根低、自然平放，尾尖缓慢轻摆
//    happy   开心  尾巴高高竖起、尾尖微勾 —— 打招呼的「旗杆尾」
//    flick   警告  尾尖快速抽动 —— 摸尾巴时它在忍着脾气
//    alert   警觉  僵直上扬、小幅快摆（僵硬 = 紧张）
//    annoyed 烦躁  平铺地面、尾尖一下一下拍地板 —— 不耐烦 / 催你住手
//    angry   生气  炸毛变粗、竖起大幅甩动
//    asleep  瞌睡  松软地摊在地上几乎不动，只随呼吸起伏
//    eating  进食  低垂缓慢摆动（注意力在食物上）
//    pounce  扑击  腾空时向后拉平
//    stalk   盯梢  压低、尾尖高频抽动（锁定猎物）
//    needy   索求  尾尖幅度偏大地来回扫动 —— 它有事要找你（饿 / 闷 / 精力过剩）
// ============================================================
const DEG = Math.PI / 180;
const TAIL_N = 7;        // 骨节数
const TAIL_SEG = 1.75;   // 每节长度（格）
const TAIL_ROOT = { c: 19.6, r: 21.0 };

const TAIL_MODES = {
  relaxed: { base: 70, curl: 5, amp: 0.14, freq: 0.50, wave: 1.0, thick: 2, taper: 0.18 },
  walk: { base: 50, curl: -1, amp: 0.24, freq: 1.70, wave: 1.2, thick: 2, taper: 0.18 },
  needy: { base: 66, curl: 4, amp: 0.32, freq: 1.10, wave: 1.4, thick: 2, taper: 0.18, tipOnly: true },
  happy: { base: 52, curl: -3, amp: 0.16, freq: 0.90, wave: 1.1, thick: 2, taper: 0.18 },
  flick: { base: 64, curl: 2, amp: 0.10, freq: 3.40, wave: 2.0, thick: 2, taper: 0.18, tipOnly: true },
  alert: { base: 58, curl: 0, amp: 0.05, freq: 2.20, wave: 1.5, thick: 2, taper: 0.18 },
  annoyed: { base: 84, curl: 2, amp: 0.05, freq: 3.20, wave: 1.8, thick: 2, taper: 0.16, slap: 1.05, lift: 1.25 },
  angry: { base: 46, curl: -2, amp: 0.42, freq: 2.20, wave: 1.3, thick: 3, taper: 0.26, quiver: 0.06 },
  asleep: { base: 86, curl: 2, amp: 0.02, freq: 0.35, wave: 0.7, thick: 2, taper: 0.18 },
  eating: { base: 66, curl: 5, amp: 0.06, freq: 0.90, wave: 0.9, thick: 2, taper: 0.18 },
  pounce: { base: 76, curl: -2, amp: 0.16, freq: 2.40, wave: 1.1, thick: 2, taper: 0.18 },
  stalk: { base: 74, curl: 1, amp: 0.11, freq: 4.60, wave: 2.4, thick: 2, taper: 0.18, tipOnly: true },
};

const TAIL_TEXT = {
  relaxed: '自然平放，尾尖缓慢轻摆 —— 它很放松',
  walk: '竖起来随步子轻摆 —— 它走得很自在',
  needy: '尾尖大幅度来回扫动 —— 它有事要找你',
  happy: '高高竖起、尾尖微勾 —— 它在跟你打招呼',
  flick: '尾尖快速抽动 —— 它已经在忍了，快住手',
  alert: '僵直、小幅快摆 —— 它警觉起来',
  annoyed: '平铺在地、尾尖拍打地板 —— 它不耐烦了',
  angry: '炸毛竖起、大幅甩动 —— 它真的生气了',
  asleep: '松软地摊在地上 —— 它睡着了',
  eating: '低垂轻摆 —— 它在专心吃饭',
  pounce: '向后拉平 —— 它腾空扑击',
  stalk: '压低、尾尖抽动 —— 它锁定猎物了',
};

function tailMode() {
  if (state.asleep) return 'asleep';
  if (state.catState === 'angry') return 'angry';
  if (state.catState === 'annoyed') return 'annoyed';
  if (state.jumpY < -4) return 'pounce';
  if (fish.state === 'eating') return 'eating';
  if (toy.active) return 'stalk';
  if (state.catState === 'alert') return 'alert';
  if (state.isPetting && state.pettingPart === 'tail') return 'flick';
  // 摸头：撸得顺手时是开心的竖旗杆尾，撸过头就变成尾尖抽动的警告
  if (state.isPetting && state.pettingPart === 'head') {
    return state.stroke > CONFIG.affection.strokeHint ? 'flick' : 'happy';
  }
  if (state.walkDir !== 0) return 'walk';
  if (state.want) return 'needy';
  return 'relaxed';
}

// 拍地板：抬起 → 快速拍下 → 贴在地上停一下
function slapLift(sp, cfg) {
  if (!cfg.slap) return 0;
  if (sp < 0.34) return Math.sin((sp / 0.34) * Math.PI / 2);
  if (sp < 0.46) return 1 - (sp - 0.34) / 0.12;
  return 0;
}

function computeTail(now) {
  const cfg = TAIL_MODES[state.tailMode] || TAIL_MODES.relaxed;
  const t = now / 1000;
  const sp = cfg.slap ? (t * cfg.slap) % 1 : 0;
  const lift = slapLift(sp, cfg);
  const impact = !!cfg.slap && state.tailPrevPhase < 0.46 && sp >= 0.46;
  state.tailPrevPhase = sp;

  let ang = cfg.base * DEG;
  let x = TAIL_ROOT.c;
  let y = TAIL_ROOT.r;
  const cells = [];
  for (let i = 0; i < TAIL_N; i++) {
    const ramp = i / (TAIL_N - 1);
    const k = cfg.tipOnly ? ramp * ramp : ramp;
    const wave = Math.sin(t * cfg.freq * Math.PI * 2 - i * cfg.wave) * cfg.amp * (0.3 + 0.7 * k);
    const quiver = cfg.quiver ? Math.sin(t * 34 + i * 1.7) * cfg.quiver : 0;
    const a = ang + wave + quiver - (cfg.slap ? lift * cfg.lift * ramp : 0);
    x += Math.sin(a) * TAIL_SEG;
    y -= Math.cos(a) * TAIL_SEG;
    const w = Math.max(1, Math.round(cfg.thick - i * cfg.taper));
    const rr = Math.min(y, 23 - w); // 贴住地板
    cells.push([Math.round(x - w / 2), Math.round(rr), w, w, i]);
    ang += cfg.curl * DEG;
  }
  return { cfg, cells, impact, tip: cells[TAIL_N - 1] };
}

// ============================================================
//  怒气符号（生气的猫右上角）—— 由参考图转成的像素网格
// ============================================================
const ANGER = [
  '....##............##....',
  '....####........####....',
  '....################....',
  '.....##############.....',
  '###...##########...###..',
  '####....########....####',
  '.####..............####.',
  '..####............####..',
  '..####............####..',
  '..####............####..',
  '..####............####..',
  '..####............####..',
  '..####............####..',
  '..####............####..',
  '..####............####..',
  '..####............####..',
  '..####............####..',
  '.####..............####.',
  '####....########....####',
  '###...##########...###..',
  '.....##############.....',
  '....################....',
  '....####........####....',
  '....##............##....',
];

function drawAngerMark(x0, y0, px) {
  const GR = ANGER.length;
  ctx.fillStyle = '#c0261f';
  for (let r = 0; r < GR; r++) {
    for (let c = 0; c < GR; c++) {
      if (ANGER[r][c] !== '#') continue;
      ctx.fillRect(x0 + c * px, y0 + r * px, px, px);
    }
  }
}

// ============================================================
//  房间（居家场景）
// ============================================================

const FLOOR_Y = 400;   // 墙与地板的交界高度
const WALL_STRIPE = 26; // 墙纸竖纹间距
// 窗户：外框 / 内侧玻璃区
const WIN = { x: 604, y: 56, w: 184, h: 208 };
const GLASS = { x: 616, y: 68, w: 160, h: 184 };

// 昼夜两套配色：[白天, 夜晚]。夜晚是"室内开着灯"的暖调，不是冷蓝
const ROOM = {
  wall:         ['#f3e6d6', '#4a3c2f'],
  wallStripe:   ['#eee1d0', '#514234'],
  cornice:      ['#e3d2bc', '#57473a'],
  skirt:        ['#c9a684', '#2e2419'],
  skirtTop:     ['#dcc09c', '#3d3023'],
  floor:        ['#dcbd97', '#453626'],
  floorSeam:    ['#c4a179', '#392c1f'],
  floorGrain:   ['#cfae86', '#4f3e2c'],
  rug:          ['#cf9179', '#6b4438'],
  rugEdge:      ['#a86c58', '#553428'],
  rugInner:     ['#e0ab92', '#7f5545'],
  winFrame:     ['#f7f1e6', '#3a2f24'],
  winShade:     ['#ddcfbc', '#2f261d'],
  curtain:      ['#b8756a', '#5c3832'],
  curtainDim:   ['#a0645a', '#4a2d28'],
  artFrame:     ['#b98a5e', '#5a4430'],
  artSky:       ['#a8d4ea', '#242c44'],
  artHill:      ['#8fbf8a', '#3a5c3c'],
  pot:          ['#c1694f', '#7a4234'],
  leaf:         ['#6fa868', '#3d6b3a'],
  leafDark:     ['#5c9155', '#325a31'],
  nest:         ['#d9b48c', '#55402f'],
  nestEdge:     ['#b98f68', '#3f2f21'],
  nestInner:    ['#f0dcc6', '#6b5540'],
};

let dayMix = 0; // 0 = 白天，1 = 夜晚（用于平滑过渡）

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

function mixHex(a, b, m) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) + ((((pb >> 16) & 255) - ((pa >> 16) & 255)) * m));
  const g = Math.round(((pa >> 8) & 255) + ((((pb >> 8) & 255) - ((pa >> 8) & 255)) * m));
  const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * m);
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

// 取色：按昼夜过渡值在 [白天, 夜晚] 之间插值
function col(name) {
  const c = ROOM[name];
  if (dayMix <= 0) return c[0];
  if (dayMix >= 1) return c[1];
  return mixHex(c[0], c[1], dayMix);
}

function updateRoomMix(dt) {
  const target = settings.night ? 1 : 0;
  dayMix += (target - dayMix) * Math.min(1, dt * 3.4);
  if (Math.abs(target - dayMix) < 0.003) dayMix = target;
}

// 顶灯自上而下的光衰减（夜里才可见）
const GLOW_BANDS = [
  [0, 90, 0.10],
  [90, 180, 0.068],
  [180, 270, 0.044],
  [270, 400, 0.024],
];

function paintGlow(x, y, w, h) {
  if (dayMix <= 0.02) return;
  for (const band of GLOW_BANDS) {
    const top = Math.max(band[0], y);
    const bot = Math.min(band[1], y + h);
    if (bot <= top) continue;
    ctx.fillStyle = 'rgba(255, 204, 138, ' + (band[2] * dayMix).toFixed(3) + ')';
    ctx.fillRect(x, top, w, bot - top);
  }
}

// 画一整块墙（含墙纸竖纹）；只在铺底时调用
function paintWall(x, y, w, h) {
  ctx.fillStyle = col('wall');
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col('wallStripe');
  for (let sx = Math.floor(x / WALL_STRIPE) * WALL_STRIPE; sx < x + w; sx += WALL_STRIPE) {
    const a = Math.max(sx, x);
    const b = Math.min(sx + 3, x + w);
    if (b > a) ctx.fillRect(a, y, b - a, h);
  }
  paintGlow(x, y, w, h);
}

// 窗户：玻璃里的天空 + 窗框窗棂 + 窗帘
function drawWindow(t) {
  const g = GLASS;
  const n = dayMix;
  const seg = Math.round(g.h / 3);

  // 玻璃里的天空（上深下浅的竖向渐变）
  ctx.fillStyle = mixHex('#a9d6f0', '#0e1428', n);
  ctx.fillRect(g.x, g.y, g.w, seg);
  ctx.fillStyle = mixHex('#c8e6f7', '#182040', n);
  ctx.fillRect(g.x, g.y + seg, g.w, seg);
  ctx.fillStyle = mixHex('#e6f2fa', '#232c4e', n);
  ctx.fillRect(g.x, g.y + seg * 2, g.w, g.h - seg * 2);

  // 白天：太阳 + 云
  const dayA = clamp01((0.55 - n) / 0.35);
  if (dayA > 0) {
    ctx.globalAlpha = dayA;
    ctx.fillStyle = '#f7dc8e';
    ctx.beginPath(); ctx.arc(724, 106, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fdf3cf';
    ctx.beginPath(); ctx.arc(724, 106, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(634, 130, 44, 10);
    ctx.fillRect(646, 122, 22, 8);
    ctx.fillRect(698, 200, 40, 10);
    ctx.fillRect(710, 192, 18, 8);
    ctx.globalAlpha = 1;
  }

  // 夜晚：星星 + 月亮
  const nightA = clamp01((n - 0.45) / 0.35);
  if (nightA > 0) {
    for (const s of STARS) {
      ctx.globalAlpha = nightA * (0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + s.ph)));
      ctx.fillStyle = '#e6ecff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = nightA;
    ctx.fillStyle = 'rgba(214,226,255,0.10)';
    ctx.beginPath(); ctx.arc(724, 106, 32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2eed6';
    ctx.beginPath(); ctx.arc(724, 106, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ddd8bc';
    ctx.beginPath();
    ctx.arc(718, 100, 4, 0, Math.PI * 2);
    ctx.arc(731, 111, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 窗框（四条边，压在玻璃之上）
  ctx.fillStyle = col('winShade');
  ctx.fillRect(WIN.x, WIN.y, WIN.w, GLASS.y - WIN.y);
  ctx.fillRect(WIN.x, GLASS.y + GLASS.h, WIN.w, WIN.y + WIN.h - (GLASS.y + GLASS.h));
  ctx.fillRect(WIN.x, GLASS.y, GLASS.x - WIN.x, GLASS.h);
  ctx.fillRect(GLASS.x + GLASS.w, GLASS.y, WIN.x + WIN.w - (GLASS.x + GLASS.w), GLASS.h);
  ctx.fillStyle = col('winFrame');
  ctx.fillRect(WIN.x + 2, WIN.y + 2, WIN.w - 4, 4);
  ctx.fillRect(WIN.x + 2, WIN.y + WIN.h - 6, WIN.w - 4, 4);
  ctx.fillRect(WIN.x + 2, WIN.y + 2, 4, WIN.h - 4);
  ctx.fillRect(WIN.x + WIN.w - 6, WIN.y + 2, 4, WIN.h - 4);

  // 窗棂（十字）
  ctx.fillStyle = col('winShade');
  ctx.fillRect(692, GLASS.y, 8, GLASS.h);
  ctx.fillRect(GLASS.x, 156, GLASS.w, 8);
  ctx.fillStyle = col('winFrame');
  ctx.fillRect(693, GLASS.y, 3, GLASS.h);
  ctx.fillRect(GLASS.x, 157, GLASS.w, 3);

  // 窗台
  ctx.fillStyle = col('winFrame');
  ctx.fillRect(594, 264, 204, 18);
  ctx.fillStyle = col('winShade');
  ctx.fillRect(594, 278, 204, 4);

  // 窗台上的小花瓶
  ctx.fillStyle = col('pot');
  ctx.fillRect(662, 240, 26, 24);
  ctx.fillStyle = col('leafDark');
  ctx.fillRect(670, 226, 10, 16);
  ctx.fillStyle = col('leaf');
  ctx.fillRect(658, 232, 10, 10);
  ctx.fillRect(682, 230, 10, 12);

  // 窗帘：窗幔 + 两片垂布
  ctx.fillStyle = col('curtain');
  ctx.fillRect(586, 42, 214, 26);
  ctx.fillStyle = col('curtainDim');
  for (let i = 0; i < 7; i++) ctx.fillRect(590 + i * 30, 58, 12, 10);
  ctx.fillStyle = col('curtain');
  ctx.fillRect(586, 42, 44, 246);
  ctx.fillRect(764, 42, 36, 246);
  ctx.fillStyle = col('curtainDim');
  ctx.fillRect(598, 68, 5, 214);
  ctx.fillRect(614, 68, 5, 214);
  ctx.fillRect(778, 68, 5, 214);
  ctx.fillRect(762, 68, 4, 214);
  ctx.fillStyle = col('curtain');
  ctx.fillRect(586, 280, 44, 8);
  ctx.fillRect(764, 280, 36, 8);
}

// 墙面装饰：顶角线 + 挂画 + 小搁板
function drawWallDecor() {
  // 天花板与墙的交界
  ctx.fillStyle = col('cornice');
  ctx.fillRect(0, 0, canvas.width, 14);

  // 挂画
  ctx.fillStyle = col('artFrame');
  ctx.fillRect(100, 96, 108, 94);
  ctx.fillStyle = col('artSky');
  ctx.fillRect(108, 104, 92, 78);
  ctx.fillStyle = col('artHill');
  ctx.fillRect(108, 152, 92, 30);
  ctx.fillRect(124, 142, 32, 12);
  ctx.fillStyle = mixHex('#f2d98a', '#e8e4c8', dayMix);
  ctx.fillRect(174, 116, 14, 14);

  // 搁板
  ctx.fillStyle = col('artFrame');
  ctx.fillRect(40, 258, 150, 8);
  ctx.fillRect(52, 266, 8, 10);
  ctx.fillRect(170, 266, 8, 10);
  // 搁板上的书与罐子
  ctx.fillStyle = '#8fa9c4';
  ctx.fillRect(56, 218, 26, 40);
  ctx.fillStyle = '#6d88a6';
  ctx.fillRect(56, 218, 26, 6);
  ctx.fillStyle = col('pot');
  ctx.fillRect(96, 234, 28, 24);
  ctx.fillStyle = col('artFrame');
  ctx.fillRect(134, 226, 30, 32);
  ctx.fillStyle = col('artSky');
  ctx.fillRect(139, 231, 20, 22);
  ctx.fillStyle = col('artHill');
  ctx.fillRect(139, 244, 20, 9);
}

// 踢脚线 + 木地板 + 地毯
function drawFloor() {
  const W = canvas.width;
  const H = canvas.height;

  // 踢脚线
  ctx.fillStyle = col('skirt');
  ctx.fillRect(0, FLOOR_Y - 24, W, 24);
  ctx.fillStyle = col('skirtTop');
  ctx.fillRect(0, FLOOR_Y - 24, W, 3);

  // 地板
  ctx.fillStyle = col('floor');
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);

  // 木纹（固定规律，不能每帧随机）
  ctx.fillStyle = col('floorGrain');
  for (let i = 0; i < 26; i++) {
    const gx = ((i * 137) % 760) + 10;
    const gy = FLOOR_Y + 9 + ((i * 53) % 4) * 28;
    ctx.fillRect(gx, gy, 30 + (i % 3) * 14, 2);
  }

  // 板缝：横向长线 + 每行错开的纵向接缝
  const seams = [
    [96, 268, 470, 664],
    [28, 198, 386, 604, 748],
    [132, 322, 520, 706],
    [62, 252, 434, 642],
  ];
  let row = 0;
  for (let y = FLOOR_Y; y < H; y += 28, row++) {
    ctx.fillStyle = col('floorSeam');
    ctx.fillRect(0, y, W, 2);
    if (y + 28 <= H) {
      for (const x of seams[row % seams.length]) ctx.fillRect(x, y, 2, 28);
    }
  }

  // 地毯
  ctx.fillStyle = col('rugEdge');
  ctx.beginPath(); ctx.ellipse(400, 456, 212, 40, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col('rug');
  ctx.beginPath(); ctx.ellipse(400, 456, 203, 34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col('rugInner');
  ctx.beginPath(); ctx.ellipse(400, 456, 150, 22, 0, 0, Math.PI * 2); ctx.fill();
}

// 左侧盆栽 + 右侧猫窝
function drawFurniture() {
  // 盆栽
  ctx.fillStyle = col('leafDark');
  ctx.fillRect(58, 342, 36, 58);
  ctx.fillRect(46, 356, 20, 38);
  ctx.fillRect(86, 352, 22, 42);
  ctx.fillStyle = col('leaf');
  ctx.fillRect(66, 330, 20, 46);
  ctx.fillRect(78, 344, 18, 34);
  ctx.fillRect(50, 366, 16, 26);
  ctx.fillStyle = col('pot');
  ctx.fillRect(48, 396, 56, 44);
  ctx.fillStyle = col('skirtTop');
  ctx.fillRect(48, 396, 56, 5);

}

// 猫窝 —— 整只画在猫之后，所以猫走到窝里时下半身会被窝口挡住，
// 看上去就是「卧进去了」。猫在别处时它照常是一个空窝。
function drawNest() {
  ctx.fillStyle = col('nestEdge');
  ctx.beginPath(); ctx.ellipse(668, 452, 74, 33, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col('nest');
  ctx.beginPath(); ctx.ellipse(668, 448, 67, 28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col('nestInner');
  ctx.beginPath(); ctx.ellipse(668, 448, 46, 17, 0, 0, Math.PI * 2); ctx.fill();
  // 窝口前缘压一道深色，让「陷进去」的层次清楚
  ctx.strokeStyle = col('nestEdge');
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(668, 448, 67, 28, 0, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.stroke();
}

// 组装整间屋子（不含猫、玩具、粒子）
function drawRoom(t) {
  paintWall(0, 0, canvas.width, FLOOR_Y);
  drawWallDecor();
  drawWindow(t);
  drawFloor();
  drawFurniture();

  // 夜里在地板上铺一层暖光，像屋里开着灯
  if (dayMix > 0.02) {
    ctx.fillStyle = 'rgba(255, 188, 112, ' + (0.09 * dayMix).toFixed(3) + ')';
    ctx.fillRect(0, FLOOR_Y, canvas.width, canvas.height - FLOOR_Y);
  }
}


function draw(now) {
  const t = now / 1000;

  // 整间屋子（墙 / 窗 / 地板 / 家具）
  drawRoom(t);

  // 猫的影子（落在木地板上，跟着猫走）
  ctx.fillStyle = 'rgba(72, 44, 24, ' + (0.10 + dayMix * 0.28) + ')';
  ctx.beginPath();
  ctx.ellipse(catX(), CAT_FOOT_Y, 165 * K, 14 * K, 0, 0, Math.PI * 2);
  ctx.fill();

  // 呼吸（走动时呼吸幅度小一些）
  const breathAmp = state.asleep ? 3.5 : (state.walkDir !== 0 ? 1.6 : 2.5);
  const breath = Math.sin(t * (state.asleep ? 1.4 : 2.2)) * breathAmp * K;
  renderCat(now, breath);

  // 猫窝盖在猫身上，猫走到窝里就会像「卧进去了」
  drawNest();

  drawFish();
  drawToy(now);
  drawParticles();
}

function renderCat(now, breath) {
  const t = now / 1000;
  const P = PALETTES[settings.color];
  const PIX = {
    O: P.body,
    o: P.stripe,
    W: P.belly,
    P: P.innerEar,
    I: '#ffffff',
    K: '#2b2430',
  };
  const OUTLINE = '#3a2a20';

  const eating = fish.state === 'eating';
  const angry = state.catState === 'angry';
  const bob = eating ? Math.round(Math.sin(fish.timer * 12) * 3 * K) : 0;

  // 生气时压低身体 + 细碎发抖
  const crouch = angry ? 5 * K : 0;
  const tremble = angry ? (Math.sin(now / 26) > 0 ? 1 : -1) : 0;

  // 走路时身子一起一伏，像四只脚交替迈步
  const walking = state.walkDir !== 0;
  const stepBob = walking ? Math.abs(Math.sin(state.walkPhase)) * 2.2 * K : 0;

  const sx = Math.round(catX() - CAT_HALF_W + state.headTurn * 8 * K + tremble + state.lean * 3 * K);
  const petUp = state.isPetting && state.pettingPart === 'head' && state.catState === 'relaxed' ? 5 * K : 0;
  const sy = Math.round(CAT_TOP_Y + breath - petUp - stepBob + state.jumpY + bob + crouch - state.tailJolt * 2 * K);

  const px = (gx, gy, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(sx + gx * S, sy + gy * S, S, S);
  };
  // 半格像素（用于瞳孔高光）
  const pxq = (gx, gy, color, q) => {
    ctx.fillStyle = color;
    ctx.fillRect(sx + gx * S, sy + gy * S, q, q);
  };

  // 尾巴：先画（在身体后面），外扩一格描边再覆盖本体
  const tail = computeTail(now);
  if (tail.impact) {
    spawnDust(sx + (tail.tip[0] + 1) * S, sy + (tail.tip[1] + 1.5) * S);
    playThud();
    state.tailJolt = 1;
  }
  ctx.fillStyle = OUTLINE;
  for (const [c, r, w, h] of tail.cells) {
    ctx.fillRect(sx + (c - 1) * S, sy + (r - 1) * S, (w + 2) * S, (h + 2) * S);
  }
  for (const [c, r, w, h, i] of tail.cells) {
    ctx.fillStyle = (i % 2 === 1) ? P.stripe : P.body;
    ctx.fillRect(sx + c * S, sy + r * S, w * S, h * S);
  }

  // 直立耳先画，随后身体会盖住耳根
  if (!angry) drawEarsUpright(sx, sy, PIX, OUTLINE);

  // 描边 + 本体
  paintSprite(sx, sy, 0, GH - 1, PIX, OUTLINE);

  // 生气：直立耳收起来，改画向外压平的「飞机耳」
  if (angry) drawEarsFlat(sx, sy, PIX, OUTLINE, EAR_FLAT_DEG);

  // 走路：两只前爪轮流往前探一格踩在地上（脚底下面还空着一格地板）
  if (walking) {
    const downLeft = Math.sin(state.walkPhase) > 0;
    for (const paw of [{ c0: 5, on: downLeft }, { c0: 15, on: !downLeft }]) {
      if (!paw.on) continue;
      const pc = sx + paw.c0 * S;
      // 抹掉原爪底那圈描边，让爪子接下去
      ctx.fillStyle = PIX.W;
      ctx.fillRect(pc, sy + 22 * S, 4 * S, S);
      ctx.fillStyle = PIX.W;
      ctx.fillRect(pc, sy + 23 * S, 4 * S, S);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(pc - S, sy + 23 * S, S, S);
      ctx.fillRect(pc + 4 * S, sy + 23 * S, S, S);
      ctx.fillRect(pc, sy + 24 * S, 4 * S, S);
    }
  }

  // 胡须（从脸颊两侧伸出）
  ctx.fillStyle = '#8a7a6a';
  const whiskW = Math.max(2, Math.round(4 * K));
  for (const [row, off] of [[14.2, 3 * K], [15.4, 0], [16.6, -3 * K]]) {
    const wy = Math.round(sy + row * S + off);
    ctx.fillRect(sx - 2 * S, wy, 6 * S, whiskW);
    ctx.fillRect(sx + 20 * S, wy, 6 * S, whiskW);
  }

  // 像素眼睛
  const closed = state.asleep || now < state.blinkUntil;
  const annoyed = state.catState === 'annoyed';
  const happy = !closed && !annoyed && !angry && state.isPetting && state.pettingPart === 'head' && state.catState === 'relaxed';
  const EYEC = [5, 6, 7, 8];

  if (closed) {
    // 闭眼线（睡觉 / 眨眼）
    for (const c of EYEC) { px(c, 9, PIX.K); px(23 - c, 9, PIX.K); }
  } else if (angry) {
    // 生气：眼睛眯成外高内低的斜线，眉毛压低
    for (const c of EYEC) {
      for (const r of [7, 8, 9, 10, 11]) { px(c, r, PIX.O); px(23 - c, r, PIX.O); }
    }
    for (const [c, r] of [[5, 8], [5, 9], [6, 9], [6, 10], [7, 10], [8, 11]]) px(c, r, PIX.K);
    for (const [c, r] of [[18, 8], [18, 9], [17, 9], [17, 10], [16, 10], [15, 11]]) px(c, r, PIX.K);
    ctx.fillStyle = 'rgba(43, 36, 48, 0.5)';
    for (const [c, r] of [[4, 5], [5, 5], [6, 6], [7, 6], [8, 6]]) {
      ctx.fillRect(sx + c * S, sy + r * S, S, S);
      ctx.fillRect(sx + (23 - c) * S, sy + r * S, S, S);
    }
  } else if (annoyed) {
    // 烦躁半眯眼：盖住眼睛上半，只留一条缝
    for (const c of EYEC) {
      for (const r of [7, 8]) { px(c, r, PIX.O); px(23 - c, r, PIX.O); }
    }
    drawPupil(px, pxq, PIX, 2);
  } else if (happy) {
    // 开心 ⌒⌒ 眼：先用毛色盖掉整只眼
    for (const c of EYEC) {
      for (const r of [7, 8, 9, 10, 11]) { px(c, r, PIX.O); px(23 - c, r, PIX.O); }
    }
    px(5, 10, PIX.K); px(6, 9, PIX.K); px(7, 10, PIX.K);
    px(18, 10, PIX.K); px(17, 9, PIX.K); px(16, 10, PIX.K);
  } else {
    // 正常：竖瞳跟随鼠标
    drawPupil(px, pxq, PIX, 3);
  }

  // 吃东西时张嘴
  if (eating && Math.floor(fish.timer * 4) % 4 !== 1) {
    for (const c of [9, 10, 11, 12, 13, 14]) px(c, 15, PIX.K);
    for (const c of [10, 11, 12, 13]) px(c, 16, PIX.K);
    for (const c of [11, 12]) px(c, 17, PIX.K);
  }

  // 生气：张嘴嘶叫，露出上下犬齿
  if (angry) {
    for (const c of [8, 9, 10, 11, 12, 13, 14, 15]) { px(c, 15, PIX.K); px(c, 16, PIX.K); }
    for (const c of [9, 10, 11, 12, 13, 14]) px(c, 17, PIX.K);
    px(9, 15, '#ffffff'); px(14, 15, '#ffffff');
    px(10, 17, '#ffffff'); px(13, 17, '#ffffff');
  }

  // 生气：右上角弹出怒气符号
  if (angry) {
    const age = now - state.angryStart;
    const p = Math.min(1, age / 280);
    const ease = p < 0.55 ? 0.35 + 1.05 * (p / 0.55) : 1.4 - 0.4 * ((p - 0.55) / 0.45);
    const pulse = age > 300 ? 1 + 0.05 * Math.sin(now / 90) : 1;
    const cell = Math.max(1, Math.round(S * 0.29 * ease * pulse));
    drawAngerMark(
      sx + 19 * S + Math.round(Math.sin(now / 70) * 2),
      sy - 5 * S + Math.round(Math.sin(now / 130) * 2),
      cell
    );
  }
}

// 画精灵的某一段（skipEar 时跳过耳朵像素）
function paintSprite(sx, sy, r0, r1, PIX, OUTLINE) {
  for (let r = r0; r <= r1; r++) {
    const row = SPRITE[r];
    if (!row) continue;
    for (let c = 0; c < GW; c++) {
      const x = sx + c * S;
      const y = sy + r * S;
      if (SOLID_NO_EAR[r][c]) {
        ctx.fillStyle = PIX[row[c]];
        ctx.fillRect(x, y, S, S);
      } else if (solidBodyAt(r - 1, c) || solidBodyAt(r + 1, c) || solidBodyAt(r, c - 1) || solidBodyAt(r, c + 1)) {
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(x, y, S, S);
      }
    }
  }
}

function rotatePt(p, pivot, ang) {
  const dx = p.c - pivot.c;
  const dy = p.r - pivot.r;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  return { c: pivot.c + dx * cos - dy * sin, r: pivot.r + dx * sin + dy * cos };
}

function triContains(tri, x, y) {
  const [a, b, c] = tri;
  const d1 = (x - b.c) * (a.r - b.r) - (a.c - b.c) * (y - b.r);
  const d2 = (x - c.c) * (b.r - c.r) - (b.c - c.c) * (y - c.r);
  const d3 = (x - a.c) * (c.r - a.r) - (c.c - a.c) * (y - a.r);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// 飞机耳：立体耳绕耳根向外压平
// 直立耳：用 SPRITE 里那几行像素原样画（形状最准），外扩一格当描边。
// 画在身体之前，耳根的描边随后会被头顶盖掉，接缝干净。
const EAR_PIXELS = [];
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < GW; c++) {
    if (isEar(r, c) && SOLID[r][c]) EAR_PIXELS.push({ c, r, ch: SPRITE[r][c] });
  }
}
function drawEarsUpright(sx, sy, PIX, OUTLINE) {
  ctx.fillStyle = OUTLINE;
  for (const f of EAR_PIXELS) {
    ctx.fillRect(sx + (f.c - 1) * S, sy + (f.r - 1) * S, S * 3, S * 3);
  }
  for (const f of EAR_PIXELS) {
    ctx.fillStyle = PIX[f.ch];
    ctx.fillRect(sx + f.c * S, sy + f.r * S, S, S);
  }
}

// 飞机耳：把耳朵三角形绕耳根向外旋转压平（画在身体之后，所以完整可见）
function drawEarsFlat(sx, sy, PIX, OUTLINE, deg) {
  const ang = deg * Math.PI / 180;
  const left = EAR_TRI.map((p) => rotatePt(p, EAR_PIVOT, ang));
  const leftIn = EAR_INNER.map((p) => rotatePt(p, EAR_PIVOT, ang));
  const mirror = (tri) => tri.map((p) => ({ c: GW - 1 - p.c, r: p.r }));
  const sets = [[left, leftIn], [mirror(left), mirror(leftIn)]];

  const filled = [];
  for (const [tri, inner] of sets) {
    for (let r = -14; r < 16; r++) {
      for (let c = -14; c < GW + 14; c++) {
        if (!triContains(tri, c + 0.5, r + 0.5)) continue;
        filled.push({ c, r, color: triContains(inner, c + 0.5, r + 0.5) ? PIX.P : PIX.O });
      }
    }
  }
  // 先用底色外扩一格当描边
  ctx.fillStyle = OUTLINE;
  for (const f of filled) {
    ctx.fillRect(sx + (f.c - 1) * S, sy + (f.r - 1) * S, S * 3, S * 3);
  }
  for (const f of filled) {
    ctx.fillStyle = f.color;
    ctx.fillRect(sx + f.c * S, sy + f.r * S, S, S);
  }
}

function drawPupil(px, pxq, PIX, ph) {
  const dx = Math.max(-1, Math.min(1, Math.round(state.eyeLookX * 1.5)));
  const dy = Math.max(-1, Math.min(1, Math.round(state.eyeLookY * 1.5)));
  const top = (ph === 2 ? 9 : 8) + dy;
  for (const cx of [6, 17]) {
    for (let i = 0; i < ph; i++) {
      px(cx + dx, top + i, PIX.K);
      px(cx + 1 + dx, top + i, PIX.K);
    }
    // 左上角一点高光
    pxq(cx + dx, top, 'rgba(246,250,255,0.92)', 7);
  }
}

function drawToy(now) {
  if (!toy.active) return;

  // 冷却提示圈
  const cooling = now < toy.cooldownUntil;
  const pulse = 0.5 + 0.5 * Math.sin(now / 200);
  ctx.save();
  ctx.globalAlpha = cooling ? 0.12 : 0.25 + 0.2 * pulse;
  ctx.strokeStyle = cooling ? '#888' : '#e8605a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(toy.x, toy.y, 30 + (cooling ? 0 : pulse * 4), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 羽毛
  ctx.save();
  ctx.translate(toy.x, toy.y);
  ctx.rotate(Math.sin(toy.phase * 3) * 0.3);
  ctx.strokeStyle = '#a89880';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 22);
  ctx.lineTo(0, -22);
  ctx.stroke();
  ctx.fillStyle = '#e05a4a';
  ctx.beginPath();
  ctx.ellipse(0, -12, 9, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f08a7a';
  ctx.beginPath();
  ctx.ellipse(-3, -15, 4, 9, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ============================================================
//  交互
// ============================================================

function getPointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function headCenter() {
  return { x: 400 + state.bodyOffset, y: 258 };
}

function hitTest(x, y) {
  const ox = state.bodyOffset;
  // 尾巴（先判定，避免被头部区域吞掉）
  if (x > 496 + ox && x < 692 + ox && y > 374 && y < 474) return 'tail';
  // 头部（含耳朵）
  if (x > 246 + ox && x < 548 + ox && y > 124 && y < 374) return 'head';
  return null;
}

// 进入生气状态
function enterAngry(now, delta, text) {
  state.catState = 'angry';
  state.angryUntil = now + CONFIG.angryTimeout * 1000;
  state.angryStart = now;
  state.affection = clampAffection(state.affection + delta);
  state.tailTouchDuration = 0;
  // 怒气符号弹出时溅出红色火花
  for (let i = 0; i < 10; i++) {
    particles.push({
      kind: 'dust',
      x: 498 + state.bodyOffset + rand(-16, 16),
      y: 120 + rand(-16, 16),
      vx: rand(-110, 110),
      vy: rand(-110, 40),
      life: rand(0.3, 0.55),
      maxLife: 0.55,
      size: rand(4, 8),
      color: '#d8362b',
    });
  }
  playGrowl(0.8);
  playHiss();
  showMessage(text);
}


function onDown(pos, now) {
  ensureAudio();

  // 睡觉中：先唤醒
  if (state.asleep) {
    wakeCat(now);
    return;
  }

  // 逗猫棒优先
  if (toy.active) {
    const dx = pos.x - toy.x;
    const dy = pos.y - toy.y;
    if (Math.hypot(dx, dy) < 36) {
      catchToy(now);
      return;
    }
  }

  const hit = hitTest(pos.x, pos.y);
  if (hit) startPetting(hit, now);
}

function wakeCat(now) {
  state.asleep = false;
  state.sleepNext = now + rand(CONFIG.sleep.min, CONFIG.sleep.max) * 1000;
  state.catState = 'alert';
  state.alertTimer = 0;
  playMeow();
  const hc = headCenter();
  spawnMark(hc.x, hc.y - 90, '!', '#d99a1e');
  showMessage('猫被惊醒了，有点警觉……等它平复吧');
}

function catchToy(now) {
  // 没力气了：扑不动
  if (state.needs.energy < CONFIG.needs.tired) {
    const hc0 = headCenter();
    spawnMark(hc0.x, hc0.y - 110, 'z', '#8a96b4');
    showMessage('猫累得趴着不动 —— 让它先睡一会儿吧');
    return;
  }
  if (now < toy.cooldownUntil) {
    showMessage('猫在喘气，缓一缓才能再扑……');
    return;
  }
  toy.cooldownUntil = now + CONFIG.toy.cooldown * 1000;

  state.affection = clampAffection(state.affection + CONFIG.affection.toyCatch);
  state.needs.energy = clampNeed(state.needs.energy - 7);
  state.needs.mood = clampNeed(state.needs.mood + 5);
  stats.pets++;
  state.jumpV = -160;

  const hc = headCenter();
  spawnHeart(hc.x + 21, hc.y - 110);
  spawnHeart(hc.x - 7, hc.y - 115);
  playPounce();
  playMeow();
  showMessage('猫扑中了羽毛！好感度 +' + CONFIG.affection.toyCatch);

  // 羽毛飞到新位置
  toy.x = rand(120, 680);
  toy.baseY = rand(90, 280);
  toy.vx = (Math.random() < 0.5 ? -1 : 1) * rand(50, 90);
}

function startPetting(part, now) {
  ensureAudio();
  state.isPetting = true;
  state.pettingPart = part;
  stats.pets++;

  if (part === 'tail') state.tailTouchDuration = 0;

  // 即时反馈
  if (part === 'head') {
    if (state.catState === 'relaxed') {
      playPurr(0.5);
    } else if (state.catState === 'angry') {
      playGrowl(0.4);
      spawnMark(catX(), CAT_TOP_Y - 30, '!', '#e03131');
    } else if (state.catState === 'alert') {
      playHiss();
      spawnMark(catX(), CAT_TOP_Y - 30, '!', '#d99a1e');
    } else {
      playHiss();
      spawnMark(catX(), CAT_TOP_Y - 30, '!', '#cf5f4a');
    }
  } else if (part === 'tail') {
    if (state.catState === 'angry') {
      playGrowl(0.4);
      spawnMark(catX() + 93, CAT_TOP_Y + 190, '!', '#e03131');
    } else if (state.catState !== 'relaxed') {
      playHiss();
      spawnMark(catX() + 93, CAT_TOP_Y + 190, '!', '#cf5f4a');
    }
  }
}

function stopPetting(now) {
  if (!state.isPetting) return;

  state.isPetting = false;
  state.pettingPart = null;
  state.tailTouchDuration = 0;

  if (state.catState === 'annoyed') {
    if (now < state.annoyedUntil) {
      // 及时停手
      state.catState = 'relaxed';
      state.affection = clampAffection(state.affection + CONFIG.affection.stopInTime);
      showMessage('及时停手，猫放松了，好感度 +3');
      spawnHeart(catX() - 36, CAT_TOP_Y + 9);
      spawnHeart(catX() + 36, CAT_TOP_Y + 1);
      playPurr(0.4);
    } else {
      state.catState = 'alert';
      state.affection = clampAffection(state.affection + CONFIG.affection.stopLate);
      state.alertTimer = 0;
      showMessage('没有及时停手，猫进入警戒，好感度 -5');
      playMeow();
      spawnMark(catX(), CAT_TOP_Y - 30, '!', '#cf5f4a');
    }
  }
}

// 鼠标事件
canvas.addEventListener('mousemove', (e) => {
  const pos = getPointerPos(e);
  mouse.x = pos.x;
  mouse.y = pos.y;
  mouse.inside = true;

  let hit = hitTest(pos.x, pos.y);
  if (!hit && toy.active && Math.hypot(pos.x - toy.x, pos.y - toy.y) < 36) {
    hit = 'toy';
  }
  canvas.style.cursor = hit ? 'pointer' : 'default';

  if (state.isPetting && hit !== state.pettingPart) {
    stopPetting(performance.now());
  }
});

canvas.addEventListener('mousedown', (e) => {
  onDown(getPointerPos(e), performance.now());
});

canvas.addEventListener('mouseup', () => {
  stopPetting(performance.now());
});

canvas.addEventListener('mouseleave', () => {
  stopPetting(performance.now());
});

// 桌面宠物：眼睛跟随整个窗口的鼠标
window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
  mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  mouse.inside = true;
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const pos = getPointerPos(touch);
  mouse.x = pos.x;
  mouse.y = pos.y;
  mouse.inside = true;
  onDown(pos, performance.now());
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  stopPetting(performance.now());
}, { passive: false });

// ============================================================
//  投喂小鱼干
// ============================================================
const FISH = [
  "..FFF..",
  ".FKFFFF",
  "..FFF..",
];
const FISH_TARGET_Y = CAT_TOP_Y + 15 * S;   // 正好落在猫嘴的高度
const fish = { state: 'none', x: 0, y: 0, vy: 0, timer: 0, lastChomp: -1 };
let feedCooldownUntil = 0;

function feed() {
  const now = performance.now();
  if (fish.state !== 'none') return;
  if (now < feedCooldownUntil) {
    showMessage('猫刚吃饱啦，先歇一会儿～');
    return;
  }
  ensureAudio();

  // 太饱了：闻一闻就走开，这条鱼白喂
  if (state.needs.satiety >= CONFIG.needs.full) {
    playMeow();
    spawnMark(catX(), CAT_TOP_Y + 121, '✕', '#b8a898');
    showMessage('猫闻了闻就走开了 —— 它一点都不饿，这条鱼白喂了');
    feedCooldownUntil = now + 3000;
    return;
  }

  fish.state = 'falling';
  fish.x = catX() + rand(-24, 24);   // 直接掉在猫面前
  fish.y = 20;
  fish.vy = 0;
  fish.timer = 0;
  fish.lastChomp = -1;
  playTick();
  showMessage('一条小鱼干飞过来！');
}

function updateFish(dt) {
  if (fish.state === 'falling') {
    fish.vy += 1400 * dt;
    fish.y += fish.vy * dt;
    fish.timer += dt;
    if (fish.y >= FISH_TARGET_Y) {
      fish.y = FISH_TARGET_Y;
      fish.state = 'eating';
      fish.timer = 0;
      fish.lastChomp = -1;
      showMessage('猫开始吃鱼啦！');
    }
  } else if (fish.state === 'eating') {
    fish.timer += dt;
    const ph = Math.floor(fish.timer * 4) % 4;
    if (ph !== fish.lastChomp && ph === 0 && fish.timer > 0.2) playChomp();
    fish.lastChomp = ph;
    if (fish.timer >= 2.4) {
      fish.state = 'none';
      const wasHungry = state.needs.satiety < CONFIG.needs.warn;
      const gain = wasHungry ? 5 : 4; // 雪中送炭比随手一喂更值钱
      state.affection = clampAffection(state.affection + gain);
      state.needs.satiety = clampNeed(state.needs.satiety + CONFIG.needs.eatGain);
      state.needs.mood = clampNeed(state.needs.mood + 6);
      stats.pets++;
      feedCooldownUntil = performance.now() + 12000;
      spawnHeart(catX() - 29, CAT_TOP_Y + 14);
      spawnHeart(catX() + 29, CAT_TOP_Y + 6);
      playPurr(0.5);
      if (state.needs.satiety > 92) {
        state.stuffed = 25;
        showMessage('猫吃撑了，肚子圆滚滚 —— 接下来它会有点犯困');
      } else if (wasHungry) {
        showMessage('饿坏了，吃得特别香！好感度 +' + gain);
      } else {
        showMessage('咔嚓咔嚓…好吃！好感度 +' + gain);
      }
    }
  }
}

function playChomp() {
  const ac = audioReady();
  if (!ac) return;
  const now = ac.currentTime;
  const size = Math.floor(ac.sampleRate * 0.08);
  const buffer = ac.createBuffer(1, size, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / size, 3);
  }
  const src2 = ac.createBufferSource();
  src2.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  const gain = ac.createGain();
  gain.gain.value = 0.3;
  src2.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  src2.start(now);
}

function drawFish() {
  if (fish.state === 'none') return;
  let s = S;
  if (fish.state === 'eating') {
    const ph = Math.floor(fish.timer * 4) % 4;
    if (ph >= 3) return;
    s = ph === 0 ? S : (ph === 1 ? 9 : 6);
  }
  const wob = fish.state === 'falling' ? Math.round(Math.sin(fish.timer * 9) * 3) : 0;
  const x0 = Math.round(fish.x - (7 * s) / 2);
  const y0 = Math.round(fish.y + wob);
  for (let r = 0; r < FISH.length; r++) {
    for (let c = 0; c < FISH[r].length; c++) {
      const ch = FISH[r][c];
      if (ch === 'F') {
        ctx.fillStyle = '#e8887a';
        ctx.fillRect(x0 + c * s, y0 + r * s, s, s);
      } else if (ch === 'K') {
        ctx.fillStyle = '#2b2430';
        ctx.fillRect(x0 + c * s, y0 + r * s, s, s);
      }
    }
  }
}

// ============================================================
//  游戏循环
// ============================================================

let lastTime = performance.now();
let saveTimer = 0;

function update(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // 视觉缓动
  updateRoomMix(dt);
  updateVisuals(dt);

  // 跳跃物理
  if (state.jumpY < 0 || state.jumpV !== 0) {
    state.jumpV += 500 * dt;
    state.jumpY += state.jumpV * dt;
    if (state.jumpY >= 0) {
      state.jumpY = 0;
      state.jumpV = 0;
    }
  }

  // 互动逻辑
  if (state.isPetting) {
    stats.petTime += dt;
    if (state.pettingPart === 'head') handleHeadPet(dt, now);
    else if (state.pettingPart === 'tail') handleTailPet(dt, now);
  }
  updateStroke(dt, now);

  // 需求衰减 + 自主走动 + 猫的诉求
  updateNeeds(dt, now);
  updateRoam(dt, now);
  updateWant(now);

  // 精力见底：撑不了多久就要睡
  if (!state.asleep && state.needs.energy < CONFIG.needs.tired && state.catState === 'relaxed') {
    state.sleepNext = Math.min(state.sleepNext, now + 2500);
  }

  // 历史最高
  stats.best = Math.max(stats.best, state.affection);

  // 瞌睡逻辑
  updateSleep(dt, now);

  // 眨眼
  if (!state.asleep && state.catState === 'relaxed' && !state.isPetting) {
    if (now > state.blinkNext) {
      state.blinkUntil = now + 180;
      state.blinkNext = now + rand(2000, 6000);
    }
  }

  // 逗猫棒
  if (toy.active) {
    toy.phase += dt;
    toy.x += toy.vx * dt;
    if (toy.x < 60 || toy.x > 740) {
      toy.vx *= -1;
      toy.x = Math.max(60, Math.min(740, toy.x));
    }
    toy.y = toy.baseY + Math.sin(toy.phase * 2.3) * 18;
  }

  // 投喂小鱼干
  updateFish(dt);

  // 烦躁时还不收手 → 炸毛
  if (state.catState === 'annoyed' && state.isPetting && now > state.annoyedUntil) {
    state.tailTouchDuration = 0;
    enterAngry(now, CONFIG.affection.tailAngry, '忍到极限，猫炸毛了！尾巴整个竖起来甩 —— 好感度 -8');
  }

  // 生气慢慢平息
  if (state.catState === 'angry' && now > state.angryUntil) {
    state.catState = 'alert';
    state.alertTimer = 0;
    state.tailTouchDuration = 0;
    showMessage('猫的毛慢慢顺下来了……先别急着再摸它');
  }

  // 警戒恢复
  if (state.catState === 'alert') {
    if (!state.isPetting) {
      state.alertTimer += dt;
      if (state.alertTimer > CONFIG.alertRecoveryTime) {
        state.catState = 'relaxed';
        state.alertTimer = 0;
        showMessage('猫慢慢恢复了放松');
      }
    } else {
      state.alertTimer = 0;
    }
  }

  // 尾巴姿态（按猫行为学实时切换）
  state.tailJolt = Math.max(0, state.tailJolt - dt * 6);
  const tm = tailMode();
  if (tm !== state.tailMode) {
    state.tailMode = tm;
    updateTailUI();
  }

  // 粒子
  updateParticles(dt);
  // 抚摸时冒爱心（撸腻了爱心也变少，视觉上就能看出"手感"在掉）
  if (state.isPetting && state.pettingPart === 'head' && state.catState === 'relaxed') {
    if (Math.random() < 0.15 * (1 - state.stroke)) {
      spawnHeart(catX() + (Math.random() - 0.5) * 64, CAT_TOP_Y - 13);
    }
  }

  updateUI();
  draw(now);

  saveTimer += dt;
  if (saveTimer > 5) {
    saveTimer = 0;
    saveGame();
  }

  requestAnimationFrame(update);
}

function updateSleep(dt, now) {
  if (!state.asleep) {
    if (!state.isPetting && state.catState === 'relaxed' && now > state.sleepNext) {
      state.asleep = true;
      state.sleepUntil = now + rand(CONFIG.sleep.durMin, CONFIG.sleep.durMax) * 1000;
      state.zzzTimer = 0;
      showMessage('猫打瞌睡了……轻轻点它可以叫醒');
    }
  } else {
    state.zzzTimer -= dt;
    if (state.zzzTimer <= 0) {
      state.zzzTimer = 0.9;
      const hc = headCenter();
      spawnZzz(hc.x + 36, hc.y - 115);
    }
    if (now > state.sleepUntil) {
      state.asleep = false;
      state.sleepNext = now + rand(CONFIG.sleep.min, CONFIG.sleep.max) * 1000;
      playMeow();
      showMessage('猫睡醒了，伸了个懒腰');
    }
  }
}

function updateVisuals(dt) {
  // 注视目标：逗猫棒优先，其次鼠标
  let tx = mouse.x, ty = mouse.y, tracking = mouse.inside;
  if (toy.active) {
    tx = toy.x;
    ty = toy.y;
    tracking = true;
  }

  // 头跟随目标（左右轻微转向）；没人理它的时候，头朝着要走的方向
  let targetTurn = 0;
  if (tracking) {
    targetTurn = Math.max(-1, Math.min(1, (tx - catX()) / (400 * K)));
  } else if (state.walkDir !== 0) {
    targetTurn = state.walkDir * 0.72;
  }
  state.headTurn += (targetTurn - state.headTurn) * 0.06;

  // 眼睛朝向目标（更灵敏）
  let targetLookX = 0, targetLookY = 0;
  if (tracking) {
    const hx = catX();
    const hy = CAT_TOP_Y + 8.8 * S;
    targetLookX = Math.max(-1, Math.min(1, (tx - hx) / (300 * K)));
    targetLookY = Math.max(-1, Math.min(1, (ty - hy) / (300 * K)));
  } else if (state.walkDir !== 0) {
    targetLookX = state.walkDir * 0.55;
  }
  state.eyeLookX += (targetLookX - state.eyeLookX) * 0.15;
  state.eyeLookY += (targetLookY - state.eyeLookY) * 0.15;

  // 走动时身子朝行进方向偏一点
  const targetLean = state.walkDir !== 0 ? state.walkDir : 0;
  state.lean += (targetLean - state.lean) * 0.08;

  // 摸头时头轻微抬起
  let targetTilt = 0;
  if (state.isPetting && state.pettingPart === 'head' && state.catState === 'relaxed') {
    targetTilt = 1;
  }
  state.headTilt += (targetTilt - state.headTilt) * 0.1;

  // 烦躁/警戒/生气时身体后退
  let targetOffset = 0;
  if (state.catState === 'angry') targetOffset = 56;
  else if (state.catState === 'annoyed') targetOffset = 40;
  else if (state.catState === 'alert') targetOffset = 20;
  state.bodyOffset += (targetOffset - state.bodyOffset) * 0.1;
}

// 撸猫收益：随耐受度平方衰减 —— 刚开始 3 点/秒，撸到一半只剩 0.75，
// 撸满几乎归零。长按不动不再能刷分（修复：以前按住不放能一路刷到挚友）
function strokeFresh() {
  return Math.pow(1 - state.stroke, 2);
}

function handleHeadPet(dt, now) {
  if (state.catState === 'relaxed') {
    // 猫心里闷的时候不太领情，收益减半
    const mul = state.needs.mood < CONFIG.needs.glum ? 0.5 : 1;
    state.affection = clampAffection(state.affection + CONFIG.affection.headRelaxed * mul * strokeFresh() * dt);
    state.purrPhase += dt;
    // 越撸越不稀罕，呼噜声也变稀
    if (state.purrPhase > 0.6 + state.stroke * 1.5) {
      state.purrPhase = 0;
      playPurr(0.5);
    }
  } else if (state.catState === 'alert') {
    state.affection = clampAffection(state.affection + CONFIG.affection.headAlert * dt);
  } else if (state.catState === 'annoyed') {
    state.affection = clampAffection(state.affection + CONFIG.affection.headAnnoyed * dt);
  } else if (state.catState === 'angry') {
    state.affection = clampAffection(state.affection + CONFIG.affection.headAngry * dt);
  }
}

// 撸猫耐受度：一直被摸，猫会腻 —— 攒满就甩尾巴、再摸下去就炸毛
function updateStroke(dt, now) {
  const A = CONFIG.affection;
  const stroking = state.isPetting && state.pettingPart === 'head' && state.catState === 'relaxed';

  if (stroking) {
    state.stroke = Math.min(1, state.stroke + dt / A.strokeFill);
  } else {
    state.stroke = Math.max(0, state.stroke - dt / A.strokeCool);
    if (state.stroke < 0.15) state.strokeHinted = false;
  }

  if (stroking && state.stroke >= 1) {
    // 撸腻了：进入烦躁（和摸尾巴一样的出口），继续摸就会炸毛 -8
    state.catState = 'annoyed';
    state.annoyedUntil = now + CONFIG.annoyedTimeout * 1000;
    state.stroke = A.strokeAfter;
    state.strokeHinted = true;
    state.tailTouchDuration = 0;
    state.purrPhase = 0;
    showMessage('摸太久了，猫甩着尾巴走神 —— 它在说「够了」');
    spawnMark(catX() + 93, CAT_TOP_Y + 190, '!', '#cf5f4a');
    playHiss();
  } else if (stroking && !state.strokeHinted && state.stroke > A.strokeHint) {
    // 先给个预警，别让玩家莫名其妙被甩脸
    state.strokeHinted = true;
    showMessage('猫的尾巴尖开始抽动 —— 它觉得摸得有点久了');
  }
}

function handleTailPet(dt, now) {
  if (state.catState === 'relaxed') {
    // 摸尾巴：先是尾尖抽动警告，攒够了就不耐烦
    state.tailTouchDuration += dt;
    state.affection = clampAffection(state.affection + CONFIG.affection.tailRelaxed * dt);

    if (state.tailTouchDuration > CONFIG.tailIrritationTime) {
      state.catState = 'annoyed';
      // 注意单位：now 是毫秒，annoyedTimeout 是秒（之前漏乘 1000，
      // 导致"及时收手"的宽限期只有 1.5 毫秒，玩家几乎必吃惩罚）
      state.annoyedUntil = now + CONFIG.annoyedTimeout * 1000;
      showMessage('猫的尾巴开始拍地板——它在说「够了」');
      spawnMark(catX() + 93, CAT_TOP_Y + 190, '!', '#cf5f4a');
    }
  } else if (state.catState === 'annoyed') {
    state.affection = clampAffection(state.affection + CONFIG.affection.tailAnnoyed * dt);
  } else if (state.catState === 'alert') {
    // 警戒中的猫还去扯尾巴，很快就会被点燃
    state.tailTouchDuration += dt;
    state.affection = clampAffection(state.affection + CONFIG.affection.tailAlert * dt);
    if (state.tailTouchDuration > CONFIG.angryFromAlert) {
      enterAngry(now, CONFIG.affection.tailAngry, '别碰正在警戒的猫尾巴！它炸毛了，好感度 -8');
    }
  } else if (state.catState === 'angry') {
    state.affection = clampAffection(state.affection + CONFIG.affection.tailAngry * dt);
  }
}

// ============================================================
//  需求系统（v0.6）
//  饱食 / 精力 / 心情：随时间衰减，你不在的时候也照样掉
// ============================================================

const WANT_TEXT = {
  food: '猫饿了 —— 它正盯着你叫，该投喂了',
  attention: '猫有点闷 —— 它想被关注，摸摸它吧',
  play: '猫精力过剩 —— 它开始自己找乐子',
};

function updateNeeds(dt, now) {
  const N = state.needs;
  const CFG = CONFIG.needs;

  // 饱食：稳定下降
  N.satiety = clampNeed(N.satiety - NEED_RATE.satiety * dt);

  // 精力：睡觉回复；逗猫棒和吃撑都会加速消耗
  if (state.asleep) {
    N.energy = clampNeed(N.energy + CFG.sleepRegen * dt);
  } else {
    let eRate = NEED_RATE.energy;
    if (toy.active) eRate *= 1.7;
    if (state.stuffed > 0) eRate *= 1.9;
    N.energy = clampNeed(N.energy - eRate * dt);
  }

  // 心情：饿、累、被惹毛都会掉得更快
  let mRate = NEED_RATE.mood;
  if (N.satiety < CFG.warn) mRate *= 1.9;
  if (N.energy < CFG.tired) mRate *= 1.6;
  if (state.catState === 'angry') mRate *= 3.0;
  else if (state.catState === 'annoyed') mRate *= 2.0;
  N.mood = clampNeed(N.mood - mRate * dt);

  // 被摸头的时候心情回升（同样受耐受度影响：撸腻了就不再回心情）
  if (state.isPetting && state.pettingPart === 'head' && state.catState === 'relaxed') {
    N.mood = clampNeed(N.mood + 4 * strokeFresh() * dt);
  }

  if (state.stuffed > 0) state.stuffed = Math.max(0, state.stuffed - dt);
}

// ============================================================
//  自主走动：猫自己在屋里换地方待着
// ============================================================

// 什么时候它没心思走动
function canRoam() {
  if (state.asleep) return false;
  if (state.isPetting) return false;
  if (state.catState !== 'relaxed') return false;   // 警戒 / 烦躁 / 生气时都钉在原地
  if (fish.state !== 'none') return false;          // 在吃饭
  if (toy.active) return false;                     // 在盯逗猫棒
  if (state.jumpY < 0 || state.jumpV !== 0) return false;
  return true;
}

// 挑一个去处：别老去同一个地方；困了就往猫窝走
function pickSpot() {
  const R = CONFIG.roam;
  if (state.needs.energy < CONFIG.needs.tired + 14) return R.spots[0];  // 猫窝
  const far = R.spots.filter((s) => Math.abs(s.x - state.cx) > 90);
  const pool = far.length ? far : R.spots;
  return pool[Math.floor(Math.random() * pool.length)];
}

function updateRoam(dt, now) {
  const R = CONFIG.roam;

  // 兜底：无论如何都别让猫跑出屋里能待的范围
  state.cx = Math.max(R.minX, Math.min(R.maxX, state.cx));

  if (!canRoam()) {
    if (state.walkDir !== 0) {
      state.walkDir = 0;
      state.walkPhase = 0;
      state.walkPause = now + rand(R.pauseMin, R.pauseMax) * 1000;
    }
    return;
  }

  // 正在迈步
  if (state.walkDir !== 0) {
    state.walkPhase += dt * 8.5;
    const step = R.speed * dt * state.walkDir;
    state.cx += step;

    // 走一段就扬起一点灰
    state.walkDust += Math.abs(step);
    if (state.walkDust > 52) {
      state.walkDust = 0;
      spawnDust(state.cx + rand(-24, 24), CAT_FOOT_Y - 1, 'rgba(150, 124, 96, 0.65)');
    }

    const arrived = state.walkDir > 0 ? state.cx >= state.walkTargetX : state.cx <= state.walkTargetX;
    if (arrived) {
      state.cx = Math.max(R.minX, Math.min(R.maxX, state.walkTargetX));
      state.walkDir = 0;
      state.walkPhase = 0;
      state.walkPause = now + rand(R.pauseMin, R.pauseMax) * 1000;
    }
    return;
  }

  // 站着：到点了想想要不要换个地方待
  if (now < state.walkPause) return;
  state.walkPause = now + rand(R.pauseMin, R.pauseMax) * 1000;
  if (Math.random() < R.idleChance) return;         // 这次就赖着不动

  const spot = pickSpot();
  const dx = spot.x - state.cx;
  if (Math.abs(dx) < 28) return;                    // 已经在这儿了

  state.roamSpot = spot.name;
  state.walkTargetX = Math.max(R.minX, Math.min(R.maxX, spot.x));
  state.walkDir = dx > 0 ? 1 : -1;
  state.walkDust = 0;
}

// 猫的诉求：先定优先级（饿 > 闷 > 精力过剩），再定期表达出来
function updateWant(now) {
  const N = state.needs;
  const CFG = CONFIG.needs;

  let w = null;
  if (N.satiety < CFG.warn) w = 'food';
  else if (N.mood < CFG.glum) w = 'attention';
  else if (N.energy > 82 && !state.asleep && state.catState === 'relaxed') w = 'play';

  if (w !== state.want) {
    const had = state.want;
    state.want = w;
    state.wantNext = now + 1200;
    if (w && !had) showMessage(WANT_TEXT[w]);
  }

  // 睡觉 / 炸毛 / 烦躁的时候没心思提要求
  if (!w || state.asleep || state.catState === 'angry' || state.catState === 'annoyed') return;
  if (now < state.wantNext) return;

  state.wantNext = now + rand(2800, 4600);
  const hc = headCenter();

  if (w === 'food') {
    spawnMark(hc.x + 54, hc.y - 110, '🍖', '#e8a15a');
    if (Math.random() < 0.6) playMeow();
  } else if (w === 'attention') {
    spawnMark(hc.x + 54, hc.y - 110, '?', '#9ad0e8');
  } else {
    // 精力过剩：自己找个乐子蹦一下
    spawnMark(hc.x + 54, hc.y - 110, '✨', '#d99a1e');
    if (state.jumpY === 0 && state.jumpV === 0 && Math.random() < 0.35) {
      state.jumpV = -110;
    }
  }
}

// 离线结算：你不在的时候，它照样在饿、在累、在闷
function applyOfflineDecay() {
  if (!state.lastSeen) return;
  const sec = Math.min((Date.now() - state.lastSeen) / 1000, CONFIG.needs.offlineCap);
  if (sec < 60) return;

  const N = state.needs;
  N.satiety = clampNeed(N.satiety - NEED_RATE.satiety * sec);
  N.energy = clampNeed(N.energy - NEED_RATE.energy * sec);
  N.mood = clampNeed(N.mood - NEED_RATE.mood * sec);

  const mins = Math.round(sec / 60);
  const span = mins >= 60 ? Math.round(mins / 60) + ' 小时' : mins + ' 分钟';
  if (N.satiety < CONFIG.needs.warn) {
    showMessage('你离开了 ' + span + '。猫饿坏了，一见你就开始叫');
  } else if (N.mood < CONFIG.needs.glum) {
    showMessage('你离开了 ' + span + '。猫有点闹脾气，暂时不太想理你');
  } else {
    showMessage('你离开了 ' + span + '，猫一直在等你回来');
  }
}

// ============================================================
//  UI
// ============================================================

function currentLevel() {
  for (let i = 0; i < CONFIG.levels.length; i++) {
    if (state.affection >= CONFIG.levels[i].min) return i;
  }
  return CONFIG.levels.length - 1;
}

function levelIndexByName(name) {
  const i = CONFIG.levels.findIndex((l) => l.name === name);
  return i < 0 ? CONFIG.levels.length : i;
}

function updateUI() {
  affectionEl.textContent = Math.round(state.affection);

  const pct = state.affection;
  let color;
  if (pct >= 70) color = '#78bd6a';
  else if (pct >= 40) color = '#d9a02c';
  else color = '#cf5f4a';

  affectionBar.style.width = pct + '%';
  affectionBar.style.background = color;

  const stateText = {
    relaxed: state.asleep ? '打瞌睡' : '放松',
    alert: '警戒',
    annoyed: '烦躁',
    angry: '生气',
  };
  stateEl.textContent = stateText[state.catState];
  stateEl.className = 'cat-state cat-state-' + state.catState;

  // 头衔
  const lv = currentLevel();
  const L = CONFIG.levels[lv];
  titleEl.textContent = L.emoji + ' ' + L.name;
  if (state.levelName !== L.name) {
    if (state.levelName !== '' && lv < levelIndexByName(state.levelName)) {
      // 升了头衔
      showMessage('升级了！猫现在把你当成【' + L.name + '】！');
      spawnHeart(catX() - 36, CAT_TOP_Y + 9);
      spawnHeart(catX() + 32, CAT_TOP_Y);
      spawnHeart(catX() - 4, CAT_TOP_Y - 21);
      playChime();
    }
    state.levelName = L.name;
  }

  // 统计
  statBestEl.textContent = Math.round(stats.best);
  statPetTimeEl.textContent = Math.floor(stats.petTime);
  statPetsEl.textContent = stats.pets;

  // 需求条
  setNeed(needSatietyEl, state.needs.satiety);
  setNeed(needEnergyEl, state.needs.energy);
  setNeed(needMoodEl, state.needs.mood);
}

// 需求条：低于警戒线时变红并闪烁
function setNeed(el, v) {
  if (!el) return;
  el.style.width = Math.round(v) + '%';
  el.style.background = v < CONFIG.needs.warn ? '#cf5f4a' : (v < 55 ? '#d9a02c' : '#78bd6a');
  el.classList.toggle('need-low', v < CONFIG.needs.warn);
}

// 尾巴姿态提示（把猫行为学直接写在界面上）
function updateTailUI() {
  if (!tailStateEl) return;
  tailStateEl.textContent = TAIL_TEXT[state.tailMode] || '';
  tailStateEl.className = 'tail-state tail-' + state.tailMode;
}

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.classList.add('show');
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    messageEl.classList.remove('show');
  }, 3000);
}

// ============================================================
//  启动
// ============================================================

loadSave();
applyOfflineDecay();

// 标签页切回时补算后台期间的衰减（后台 rAF 会暂停，光靠游戏循环算不到）
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveGame();
    return;
  }
  lastTime = performance.now();
  const gap = (Date.now() - state.lastSeen) / 1000;
  if (gap > 120) applyOfflineDecay();
});

// 应用已保存的设置
document.body.classList.toggle('night', settings.night);
dayMix = settings.night ? 1 : 0;
btnSound.textContent = settings.muted ? '🔇' : '🔊';
btnSound.classList.toggle('active', !settings.muted);
btnNight.textContent = settings.night ? '☀️' : '🌙';
btnNight.classList.toggle('active', settings.night);
catNameEl.textContent = PALETTES[settings.color].name + ' · 你的虚拟猫';

const t0 = performance.now();
state.sleepNext = t0 + rand(CONFIG.sleep.min, CONFIG.sleep.max) * 1000;
state.blinkNext = t0 + rand(2000, 5000);
state.walkPause = t0 + rand(2.5, 5.5) * 1000;   // 开场先站着看一会儿
state.tailMode = tailMode();
updateTailUI();

updateUI();

requestAnimationFrame((t) => {
  lastTime = t;
  update(t);
});
