const fs = require('fs');
function rep(content, old, neu, count, label) {
  const n = content.split(old).length - 1;
  if (n !== count) throw new Error(label + ': expected ' + count + ', got ' + n);
  return content.split(old).join(neu);
}
let src = fs.readFileSync('miao.js', 'utf8');

// ---------- 1. 重建精灵（大头尖耳大眼小猫）----------
const R = [];
R.push('..' + 'o' + '.'.repeat(18) + 'o' + '..');
R.push('.oPo' + '.'.repeat(16) + 'oPo.');
R.push('.oPoo' + '.'.repeat(14) + 'ooPo.');
R.push('.oPoO' + 'O'.repeat(14) + 'OoPo.');
R.push('..' + 'O'.repeat(20) + '..');
R.push('..' + 'OOOO' + 'oo' + 'O'.repeat(8) + 'oo' + 'OOOO' + '..');
R.push('..' + 'O'.repeat(20) + '..');
R.push('..' + 'OOO' + 'IIII' + 'O'.repeat(6) + 'IIII' + 'OOO' + '..');
R.push('..' + 'OO' + 'IIIII' + 'O'.repeat(6) + 'IIIII' + 'OO' + '..');
R.push('..' + 'OO' + 'IIIII' + 'O'.repeat(6) + 'IIIII' + 'OO' + '..');
R.push('..' + 'OO' + 'IIIII' + 'O'.repeat(6) + 'IIIII' + 'OO' + '..');
R.push('..' + 'OOO' + 'IIII' + 'O'.repeat(6) + 'IIII' + 'OOO' + '..');
R.push('...' + 'O'.repeat(5) + 'WWWWPPWWWW' + 'O'.repeat(5) + '...');
R.push('....' + 'OOOO' + 'WKWKWKWW' + 'OOOO' + '.' + 'oo' + '.');
R.push('....' + 'OOOO' + 'WKWWWWKW' + 'OOOO' + 'OOO' + '.');
R.push('.....' + 'OOOO' + 'W'.repeat(6) + 'OOOO' + 'OOOO' + '.');
R.push('.....' + 'ooOO' + 'W'.repeat(6) + 'OOoo' + 'OOOO' + '.');
R.push('.....' + 'OOOO' + 'W'.repeat(6) + 'OOOO' + 'OOOO' + '.');
R.push('.....' + 'O' + 'WWWW' + 'OOOO' + 'WWWW' + 'O' + '.OOO.');
R.push('......' + 'O' + 'WWW' + 'OOOO' + 'WWW' + 'O' + 'OOOO' + '..');
for (const [i, r] of R.entries()) if (r.length !== 24) throw new Error('row ' + i + ' len ' + r.length);
const block = 'const SPRITE = [\n' + R.map(r => '  "' + r + '",').join('\n') + '\n];';
const re = /const SPRITE = \[[\s\S]*?\n\];/;
if (!re.test(src)) throw new Error('SPRITE not found');
src = src.replace(re, block);

// ---------- 2. 闭眼线位置 ----------
src = rep(src,
`    for (const c of [5, 6, 7]) px(c, 8, PIX.K);
    for (const c of [16, 17, 18]) px(c, 8, PIX.K);`,
`    for (const c of [5, 6, 7]) px(c, 9, PIX.K);
    for (const c of [16, 17, 18]) px(c, 9, PIX.K);`, 1, 'closed eyes');

// ---------- 3. 烦躁半眯眼（盖住上两排）----------
src = rep(src,
`    drawPupil(px, PIX);
    for (const c of [4, 5, 6, 7, 8]) px(c, 7, PIX.O);
    for (const c of [15, 16, 17, 18, 19]) px(c, 7, PIX.O);`,
`    drawPupil(px, PIX);
    for (const r of [7, 8]) {
      for (const c of [4, 5, 6, 7, 8]) px(c, r, PIX.O);
      for (const c of [15, 16, 17, 18, 19]) px(c, r, PIX.O);
    }`, 1, 'annoyed');

// ---------- 4. 开心眼 ----------
src = rep(src,
`    px(5, 8, PIX.K); px(6, 7, PIX.K); px(7, 8, PIX.K);
    px(16, 8, PIX.K); px(17, 7, PIX.K); px(18, 8, PIX.K);`,
`    px(5, 9, PIX.K); px(6, 8, PIX.K); px(7, 9, PIX.K);
    px(16, 9, PIX.K); px(17, 8, PIX.K); px(18, 9, PIX.K);`, 1, 'happy');

// ---------- 5. 吃东西张嘴 ----------
src = rep(src,
`    for (const c of [10, 11, 12, 13]) px(c, 12, PIX.K);
    for (const c of [11, 12]) px(c, 13, PIX.K);`,
`    for (const c of [9, 10, 11, 12, 13]) px(c, 13, PIX.K);
    for (const c of [10, 11, 12]) px(c, 14, PIX.K);`, 1, 'eating mouth');

// ---------- 6. 大瞳孔 2x3 ----------
src = rep(src,
`  // 左眼瞳孔 2x2 + 高光
  px(5 + dx, 7 + dy, PIX.K);
  px(6 + dx, 7 + dy, PIX.K);
  px(5 + dx, 8 + dy, PIX.K);
  px(6 + dx, 8 + dy, PIX.K);
  px(5 + dx, 7 + dy, 'rgba(255,255,255,0.9)');
  // 右眼瞳孔 2x2 + 高光
  px(16 + dx, 7 + dy, PIX.K);
  px(17 + dx, 7 + dy, PIX.K);
  px(16 + dx, 8 + dy, PIX.K);
  px(17 + dx, 8 + dy, PIX.K);
  px(16 + dx, 7 + dy, 'rgba(255,255,255,0.9)');`,
`  // 左眼瞳孔 2x3 + 高光
  px(5 + dx, 8 + dy, PIX.K);
  px(6 + dx, 8 + dy, PIX.K);
  px(5 + dx, 9 + dy, PIX.K);
  px(6 + dx, 9 + dy, PIX.K);
  px(5 + dx, 10 + dy, PIX.K);
  px(6 + dx, 10 + dy, PIX.K);
  px(5 + dx, 8 + dy, 'rgba(255,255,255,0.9)');
  // 右眼瞳孔 2x3 + 高光
  px(16 + dx, 8 + dy, PIX.K);
  px(17 + dx, 8 + dy, PIX.K);
  px(16 + dx, 9 + dy, PIX.K);
  px(17 + dx, 9 + dy, PIX.K);
  px(16 + dx, 10 + dy, PIX.K);
  px(17 + dx, 10 + dy, PIX.K);
  px(16 + dx, 8 + dy, 'rgba(255,255,255,0.9)');`, 1, 'pupil');

// ---------- 7. 位置/命中/坐标微调 ----------
src = rep(src, 'const FISH_TARGET_Y = 291;', 'const FISH_TARGET_Y = 312;', 1, 'fish y');
src = rep(src, `  return { x: 400 + state.bodyOffset, y: 250 };`, `  return { x: 400 + state.bodyOffset, y: 280 };`, 1, 'headCenter');
src = rep(src,
`  const hy = 250;
  const dx = x - hx;
  const dy = y - hy;
  if (Math.sqrt(dx * dx + dy * dy) < 105) return 'head';

  if (x > 520 + state.bodyOffset && x < 620 + state.bodyOffset && y > 340 && y < 455) {`,
`  const hy = 280;
  const dx = x - hx;
  const dy = y - hy;
  if (Math.sqrt(dx * dx + dy * dy) < 110) return 'head';

  if (x > 490 + state.bodyOffset && x < 580 + state.bodyOffset && y > 350 && y < 455) {`, 1, 'hitTest');
src = rep(src,
`    const hx = 400 + state.bodyOffset;
    const hy = 250;
    targetLookX = Math.max(-1, Math.min(1, (tx - hx) / 300));`,
`    const hx = 400 + state.bodyOffset;
    const hy = 280;
    targetLookX = Math.max(-1, Math.min(1, (tx - hx) / 300));`, 1, 'look ref');

src = rep(src, `spawnMark(400, 130, '!',`, `spawnMark(400, 180, '!',`, 4, 'head marks');
src = rep(src, `spawnMark(600, 340, '!',`, `spawnMark(545, 350, '!',`, 2, 'tail marks');
src = rep(src, `spawnHeart(400 + state.bodyOffset + (Math.random() - 0.5) * 90, 170);`, `spawnHeart(400 + state.bodyOffset + (Math.random() - 0.5) * 90, 200);`, 1, 'pet heart');
src = rep(src,
`      spawnHeart(350, 180);
      spawnHeart(450, 170);`,
`      spawnHeart(350, 215);
      spawnHeart(450, 205);`, 1, 'stop hearts');
src = rep(src,
`      spawnHeart(350, 170);
      spawnHeart(445, 160);
      spawnHeart(395, 140);`,
`      spawnHeart(350, 215);
      spawnHeart(445, 205);
      spawnHeart(395, 185);`, 1, 'level hearts');

fs.writeFileSync('miao.js', src);
console.log('ALL PATCHES OK');
