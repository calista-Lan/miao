# 项目长期备忘

## 定位（最要紧）
`猫🐱` 是**以养宠为主的网页游戏**，重点在游戏体验本身。**不是**科普／教学网站。
做功能建议时优先考虑：养成循环是否闭环、玩家动机、选择的代价、长期目标。
不要提议"解说猫语""知识图鉴"这类教学向内容。

## 技术约定
- 纯前端零依赖零构建：`猫.html` + `mao.css` + `miao.js`（单文件，约 2450 行）
- 像素猫用字符网格 `SPRITE` 描述（24 列宽）；描边靠 `SOLID` + `solidAt()` 自动推算
- 耳朵是三角形光栅化 + 绕 `EAR_PIVOT` 旋转（生气时 `EAR_FLAT_DEG = -75` 变飞机耳）
- 尾巴是 7 节链式骨骼，姿态定义在 `TAIL_MODES`，行为学文案在 `TAIL_TEXT`
- 音效全部 WebAudio 程序生成，不引外部音频文件
- 存档用 localStorage，key = `cat-game-v03`，`loadSave()` / `saveGame()`，每 5 秒自动存一次
- 粒子系统在 `particles` 数组，按 `kind` 区分（heart／mark／zzz／dust）

## 需求系统（v0.6 引入，改数值必看）
- `state.needs = { satiety, energy, mood }`，0-100；衰减速率 `NEED_RATE`，参数 `CONFIG.needs`
- 离线也衰减：`saveGame()` 写 `lastSeen`，启动时 `applyOfflineDecay()` 补算（上限 6 小时）
- `state.want` 是猫的主动诉求：饿 > 闷 > 精力过剩；它同时驱动尾巴 `needy` 姿态和气泡
- 交互代价：饱食 ≥85 拒食、精力 <25 拒玩逗猫棒、心情 <30 摸头收益减半
- 需求条 DOM id：`need-satiety` / `need-energy` / `need-mood`
- **改初始值时 `resetGame()` 和 `state.needs` 两处要同步改**，否则重置后不一致

## 房间场景（v0.7 引入，改画面必看）
- 画布内容 = **一间屋子**（墙纸／木地板／地毯／窗户／窗帘／挂画／搁板／盆栽／猫窝），不再是天空＋地板
- `ROOM` 调色板每项写成 `[白天, 夜晚]`，用 `col(name)` 按 `dayMix` 插值取色 —— **改房间配色只动这张表**
- `dayMix`（0 = 昼 / 1 = 夜）在 `updateRoomMix(dt)` 里缓动逼近，`update()` 每帧调用；启动时按存档直接置位，避免开局闪一下
- 分层顺序：`drawRoom` = `paintWall` → `drawWallDecor` → `drawWindow` → `drawFloor` → `drawFurniture`
- **`paintWall` 是墙面的唯一真相**：墙纸＋顶灯光衰都在里面。新增墙面效果必须写进 `paintWall`，
  否则任何局部重绘都会缺一块
- **耳朵不再"擦墙重画"**（v0.8 起 `eraseWall` 已删除）：`SOLID_NO_EAR` 把耳朵排除在身体之外，
  直立耳用 `drawEarsUpright()` 画在身体**之前**（耳根被头顶盖住），飞机耳用 `drawEarsFlat()` 画在身体**之后**。
  这样猫走到挂画／窗户前面也不会擦坏装饰。**别再引入按区域重绘背景的做法**
- 直立耳必须沿用 `SPRITE` 的原像素（三角形光栅化出来的形状明显更胖更差）；只有飞机耳才旋转
- 猫的水平可走范围 `214 ~ 648`、猫身宽 240：走到最左会压住盆栽右半（看着像站在盆栽前，可接受），
  走到最右正好落在猫窝上。因此墙上装饰（y < 200）不用再躲猫，地面装饰也不用（猫在前景）
- 昼夜改为「窗外天光 + 室内灯光」：星星只在窗玻璃区生成，月亮在窗格里，夜里 `paintGlow` 做自上而下的灯光衰减
- 地板板缝／木纹必须用固定算式，**不能每帧随机**，否则会抖动
- 页面配色在 `mao.css` 的 `:root` / `body.night` 两套变量；画布的木框用多层 `box-shadow` 实现（不占布局）
- **canvas 必须保留 `flex: none`**：`.container` 是 column flex，`height: auto` 的 canvas 会被压扁 → 画面变形
- UI 里加 emoji 要挑老编码的（`🪶` 在本机字体缺字形、显示成方框，已换 `🎣`）

## 猫的尺寸与走动（v0.8 引入，改坐标必看）
- 猫的大小 = `const S`（每格像素）。**已从 14 缩到 10**；`const K = S / 14` 是相对初版的比例，
  所有"固定 px"的偏移（胡须粗细、呼吸幅度、粒子出生点、影子半径…）都乘 K。
  **改 S 只需改一处，其余自动跟随** —— 前提是新写的代码也遵守这条
- 几何基准全部由常量推导，不要再写死数字：
  `CAT_FOOT_Y = 452`（脚踩在地板上的高度）、`CAT_TOP_Y = CAT_FOOT_Y - GH * S`（精灵首行）、
  `CAT_HALF_W = GW / 2 * S`；猫的水平中心一律用 `catX()`（= `state.cx + state.bodyOffset`）
- `state.cx` 是猫在屋里的身体中心 x，由自主走动改变；`state.bodyOffset` 是"被吓退"的额外位移
- 自主走动在 `updateRoam()`：`canRoam()` 决定什么时候不许动（睡觉／被摸／非 relaxed／吃鱼／逗猫棒／跳跃中），
  `pickSpot()` 挑去处（精力低于 `tired+14` 就往猫窝走），`CONFIG.roam` 里是速度与停留时长
- 走路的表现：`stepBob` 身体起伏、`state.walkPhase` 驱动**两只前爪交替往前探一格**
  （脚底下面还空着一格地板，所以不用擦除）、`state.lean` + `headTurn` 给出方向感、脚下扬灰
- 尾巴多了 `walk` 姿态；`drawNest()` **画在猫之后**，所以猫走到窝里时下半身被窝口挡住 = "卧进去"
- hitTest 必须跟着 `catX()` 走，尾巴判定区在 `cx + 100 ~ cx + 216`

## 编辑这个项目的注意
- **同一文件不要并行发起多个 Edit**：工具是"读-改-写回"，并行时后写的会覆盖先写的，
  且每条都回报 Successfully。要么串行，要么用一段脚本一次改完。本项目已因此丢过改动
- 改完必跑：`node --check miao.js`，再跑 `.workbuddy/tools/render-verify.js`

## 验证方式（改动画必跑）
- 语法：`node --check miao.js`
- 行为：`.workbuddy/tools/render-verify.js` —— Node 假 DOM 真实执行 `miao.js`，
  录制 canvas 绘制指令后自行光栅化成 PNG。能看到代码真实画出来的样子，不是示意图
- 渲染工装里 `ctx.save/restore` 必须实现状态栈，否则 `globalAlpha` 会泄漏污染整帧
- 工装里测试用的 `sheetGrid(...)` **裁切坐标写死在猫的旧位置上，改 S 或改猫的坐标后要同步改**，
  否则预览图裁出来全是墙。另外测"不能走动"的用例时要连 `sleepUntil` 一起锁住，
  不然猫会自己醒过来把用例跑飞
- 工装里可以 `evalIn(...)` 直接改 `state`，所以加新功能时顺手补几条断言：
  边界值（走到头停在 minX/maxX）、兜底（人为越界能不能拉回）、
  以及"什么情况下不该发生"（睡着时不该走动）—— 这三种最有价值

## 用户偏好
- 用户是 Lan，中文交流
- 要能真正落地的改动，不要泛泛的功能清单
- 反感"假功能"——加了但没有任何实际作用的装饰
