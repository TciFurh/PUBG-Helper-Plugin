# 开发说明

本文记录**接口字段、结构差异、踩过的坑**，以及本实例相对上游的改动明细。面向改代码的人，普通使用请看 [README](../README.md)。

---

## 目录

- [接口速查](#接口速查)
- [列表字段](#列表字段)
- [详情四种结构](#详情四种结构)
- [踩坑清单](#踩坑清单)
- [每日任务（福利中心）](#每日任务福利中心)
- [本地增强记录](#本地增强记录)
- [开发工具](#开发工具)

---

## 接口速查

营地 API 基址 `https://formal.api.gp.qq.com`，全部请求走 `utils/api.js`。

| 用途 | 接口 | 关键参数 |
|---|---|---|
| 战绩分类列表 | `getpubgbattlelist` | `page` / `pageSize` / `tabIndex` / `gameId=20004` |
| 单局详情 | `getpubgplaydetail` | `battleId` / `battleMode` / `roleId` |
| 最近对局 | `/play/getrecentbattlelist` | `roleId` / `page` / `pageSize` |
| 地铁赛季档案 | `getescaperecord` | `roleId` |
| 古墓赛季档案 | `getlosttombrecord` | `roleId` |

### tabIndex 分类映射

| tabIndex | 分类 | tabIndex | 分类 |
|---|---|---|---|
| `-1` | 全部 | `3` | 巅峰赛 |
| `0` | 计分（排位） | `4` | 全民赛场 |
| `1` | 不计分（匹配） | `5` | 地铁逃生 |
| `2` | 团竞 | `6` | 绿洲共创 |
| `7` | 古墓迷途 | `8` | 谁是内鬼 |

---

## 列表字段

`getpubgbattlelist` 单条记录的常用字段：

| 字段 | 含义 | 备注 |
|---|---|---|
| `teamRank` | 队伍名次 | `#0` 表示该模式无排名意义（如绿洲跑酷），不展示 |
| `rankColor` | 名次配色 | 接口直出，如 `#D98500` |
| `promotion` | 晋级赛 | `taskId` / `process` / `target` / `pass` / `protect` |
| `killingCount` | 击败 | |
| `ratingValue` / `ratingChange` | 积分 / 积分变化 | |
| `ratingIcon` | 评级图标 | S+ / SS / SSS |
| `isMvp` | 是否 MVP | `1` 为是 |
| `income` / `isMaxIncome` | 地铁收益 / 是否新纪录 | `isMaxIncome` 是字符串 `'1'` |
| `diamondIncome` | 钻石收益 | |
| `hardType` | 地铁难度档 | 进阶常规 / 基础常规 / 特殊 |
| `lianshaNum` / `lianshaIcon` | 团竞连击数 / 图标 | 图标是横向纹理图，直接 `<img>` 会被拉爆 |
| `reviewJump` / `hasDetail` | 可复盘 / 可查详情 | |

---

## 详情四种结构

`getpubgplaydetail` 返回 `dataList` 数组，按 `type` 取块。四种模式的结构完全不同，**不要按模式名判断，按字段判断**：

```js
const isMetro = d.income !== undefined && d.hardType !== undefined
const isTdm   = d.viewType === 'vsteam' || !!block(d, 'teams')
const isSuper = d.isSuperBody === true
```

### 经典 / 排位

| block | 内容 |
|---|---|
| `ability` | `list`（数值分组）+ `radar`（五维雷达）+ `ratingTips` |
| `equipment` | 枪械：`weaponName` / `totaldamage` / `hitRate` / `critRate` / `headRate` / `bodyRate` / `handRate` / `limbRate` / `footRate` |
| `team` | 队伍成员，数值在 `infoList`（淘汰 / 助攻 / 伤害 / 救援 / 评价） |
| `kills` / `killer` / `top5` | 我的淘汰 / 淘汰我的人 / 第一名队伍 |

### 地铁逃生

| block | 内容 |
|---|---|
| `equipment` | `data.list` 是**对象不是数组**，要 `Object.values()`；每件带 `parts`（配件）、`affixes`（词条）、`quality` |
| `bag` / `safebag` | `list`（物品）+ `counts`（品质分布，key 是品质码） |
| `kills` | 淘汰明细，`damageStats.list` 里有 `healthDamage` / `vestDamage` / `helmetDamage` / `ammoName` / `partDamages` |

顶层还有 `income` / `itemsWorth` / `huntingScore` / `prestige` / `feat`（后三个带 `addXxx` 增量）、`survivalTime`、`divOriIcon`（段位徽章）。

### 超体对抗

`isSuperBody = true`，额外字段：

- `heroInfo`（`heroName` / `selfImage` / `nameCard` / `selfBkg`）、`heroLevel`、`heroRating`、`heroRatingChange`
- `heroPlugins` + `craftPlugins`：插件（`name` / `desc` / `url`）
- `achievement.list`：称号徽章，**可能只有 `icon` 没有 `name`**
- `analysis.damage` / `analysis.heal`：构成条，每项 `name` / `value`，占比要自己按 `total` 算
- `honorIcon`（前十）/ `rankIcon`（前五）：荣誉图标

### 团队竞技

`viewType = 'vsteam'`，`dataList[0].data` 是 `[{list: 蓝方}, {list: 红方}]`：

- 成员数值从 `infoList` 取，键是 淘汰 / 助攻 / 战损 / 连击
- 顶层有 `rank` / `result` / `lianshaNum` / `ratingValue` / `ratingChange` / `isRanking`

> **成员数值列不要写死字段名**：按 `infoList` 的 key 顺序取前 4 个（经典是伤害/救援，团竞是战损/连击），模式变了也不用改代码。

### 能力雷达

`ability.data.radar.radar`：

```json
{ "max": 100, "data": [
  { "k": "排名", "v": "100.0", "ksup": { "c": "#D98500ff" } },
  { "k": "淘汰", "v": "79.5", "ksup": { "c": "#FFFFFFff" } }
] }
```

- 五维：排名 / 淘汰 / 物资 / 治疗 / 伤害，满分 100
- `buildRadar()` 在 JS 里把网格、轴线、数据多边形、标签锚点全算成 SVG 坐标字符串，模板只填空 —— **模板里不碰三角函数**
- 经典与超体都有，地铁接口不返回该块

---

## 踩坑清单

| 坑 | 现象 | 解法 |
|---|---|---|
| `bar-fill` 是 `<span>` | 晋级赛进度条整条看不见 | 加 `display: block`，inline 元素 height 无效 |
| 品质色 `#RRGGBBAA` | 用 `replace(/ff$/,'')` 会把 `#FFFFFFff` 切成 `#FFFF` | 按长度切前 6 位 |
| 团竞 `result=Win` 被当成地铁 | 列表里显示「成功」而不是「胜」 | 判定改成 **地铁必有 `hardType`，团竞必有 `result`**，两者互斥 |
| `lianshaIcon` 是横向纹理图 | 当 `<img>` 渲染会撑成一大块 | 不用图标，改成纯文本徽章 |
| 收益小数值被转万 | `4128` 显示成 `0.4万` | 绝对值 < 10000 时走 `toLocaleString` 原样显示 |
| art-template 旧语法 | 每次渲染刷一堆 `Template upgrade` 告警 | 用 4.x 的 `{{ each list item }}`，不写 `as` |
| `equipment.list` 是对象 | `.map()` 报 not a function | `Array.isArray() ? list : Object.values(list)` |

---

## 每日任务（福利中心）

签到页那份任务的自动化在 `utils/dailyTask.js`（编排）+ `apps/campTask.js`（指令/定时），接口要点：

| 接口 | 用途 |
|---|---|
| `c.gp.qq.com/gp/api/php/act_getscoretasklist.php` | 积分任务列表（10 条 + 活跃度礼包） |
| `c.gp.qq.com/gp/api/php/completescoretask.php` | 上报完成积分任务（多数完成即自动入账） |
| `c.gp.qq.com/gp/api/php/act_receivelivenessgift.php` | 领活跃度礼包（giftId 1/2/3） |
| `c.gp.qq.com/gp/api/php/activity/welfare/tasklist.php` | 福利任务列表（每天 3 条，refreshCount 剩余刷新） |
| `c.gp.qq.com/gp/api/php/activity/welfare/refreshtask.php` | 刷新福利任务 |
| `c.gp.qq.com/gp/api/php/activity/welfare/completetask.php` | 领福利任务奖励（带 taskIndex） |
| `formal.api.gp.qq.com/game/batchmodulelogreport` | 行为埋点（浏览 5 分钟/看直播 5 分钟任务全靠它） |
| `formal.api.gp.qq.com/user/sharecallback` | 分享回调（shareInfo/shareAssets/shareMatch/shareH5） |
| `formal.api.gp.qq.com/user/addlike` / `moment/like` | 点赞与取消（1=赞 0=取消） |
| `formal.api.gp.qq.com/play/gametoolchange` | 开关对局工具 |
| `formal.api.gp.qq.com/game/recharge` | 资讯充能 |
| `formal.api.gp.qq.com/game/gethotrank` | 营地热榜（「查看热门榜单」任务；`data.list` 100 条，带封面/作者/时长） |

**状态机**（实测 2026-10-23）：

- 积分任务 `status`：0=未完成 → 做动作 → 2=已完成（自动入账）；`1` 是「完成待上报」，`completescoretask` 兜底
- 福利任务 `status`：0=未做 → 做动作 → 1=可领 → `completetask(index)` 领奖 → 2=已领
- 网上教程说 H5 接口要抓包拿 `sig/msdkEncodeParam/timestamp`，**实测不需要**：插件现有 `openId/userId/token` 直接过（`-30003` 才是登录态问题）

**踩坑**：

- H5 接口要带 `algorithm=v2&encode=2&source=heping_yingdi&version=3.1.96i&roleId` 这组固定参数
- 王者营地（kohcamp.qq.com）同族接口要求 `gameId` 在 body 和 header 各一份；和平营地不需要
- 分享任务为什么能「按了就算」：客户端分享服务端收不到回调，服务端只认 `sharecallback` 这个口
- 撤赞只撤**本次为任务点的**（记录 iInfoId/momentId 再逐个取消），`/user/likerecords` 全量取消会动用户的历史点赞
- **动作抛异常会中断整轮**：积分/福利/周任务三类循环统一走 `runAction(fn, ctx)` 包裹，
  异常一律降级成 `{ ok:false, note:'执行异常：…' }`。2026-10-24 修的坑——当时 `hotRank` 调的
  `api.get_hot_rank()` 根本没实现，TypeError 直接炸掉整轮（含进度回填），外面只看到一句「执行失败」

**刷新机制**（实测 2026-10-23）：

- `refreshCount` 是「已刷新次数」的**负数计数**（-1、-2…），不是剩余上限；刚登录没刷过时是 0
- 次数用尽时 `refreshtask` 回 **`-76504`**，列表停留在最后一轮
- 每轮刷新常直接刷出「已完成待领取」的任务（服务端知道你今天做过什么），领一遍就是一轮奖励
- `runDailyTasks` 的福利任务循环：做 → 领 → 刷新 → 再做 → 再领，直到接口拒绝或 10 轮上限

**游戏手册 · 每周任务**（`runWeeklyTasks`，`#和平周任务`）：

| 接口 | 用途 |
|---|---|
| `/game/getseasonpasstask` | 手册 8 周任务（**必须带有效 roleId，传 0 回 -20011**） |
| `/game/claimseasonpasspoints` | 领手册积分——**默认绝不调用**（用户要求只做不领） |

- 结构：`data.weekList[] { weekNo, isOpen, taskList[] { id,title,desc,progress,maxProgress,status,point } }`
- status：0=未完成 → 做动作 → 1=完成待领 →（App 手动领）→ 2=已领
- 可自动做的：分享战绩/资讯/资产/复盘（sharecallback）、浏览资讯 5 分钟（埋点）、查看热榜（gethotrank）、
  观看复盘（getpubgreplaydata4）、开启 4 个对局工具（id 0-4 里凑满 4 个，id=3 可能是加速器）
- 做不了的：登录类（日常使用累计）、小组件、企微绑定、找搭子/地铁图鉴/壁纸库（暂无接口）
- 动作完成后**再拉一次列表**回填最新进度（分享/浏览类计数是服务端异步确认的）

**新增资料查询接口**（`apps/campSocial.js`，全读操作）：

| 指令 | 接口 | 说明 |
|---|---|---|
| `#和平营地币` | `/user/getusercoins` | `coins[]` 带 `name/num`（福利币、营地装饰碎片） |
| `#和平访客` | `/user/getvisits` | `list[]`：昵称/角色/段位/`offlineTime`/`onlineStatus` |
| `#和平在线好友` | `/user/getonlinefriends` | 需带 `roleId`；`online` 值 1在线/2游戏中/3离线/4隐身 |
| `#和平赛事` | `/leagues/leaguelist` | `leagues[]`：name/year/season/leagueType |

**还没自动化、值得做的方向**（来自 apktool 解包的 322 个接口路径，见 `D:/rea/api_paths.txt`）：

- **营地动态/社区**（`/moment/*` 40+ 接口）：热帖聚合、发动态、评论
- **UGC 攻略**：`/ugc/list`、`/ugc/getmodsformoment`
- **精彩时刻**：`/play/getwonderfulmoments`（裸调回 -20011，还差参数，待抓包补）
- **直播**：`/game/getwatchanchorlist`、`anchorlivedetail`，可做主播开播提醒
- **赛事详情**：`/leagues/{circleinfo,scheduletheme,teamlist}` 可往下钻赛程与战队

---

## 本地增强记录

以下改动为本仓库相对上游插件的增强：

- **扫码登录**：`utils/wxQrLogin.js` 实现微信扫码登录，营地客户端版本号（`cClientVersionCode` / `cClientVersionName`）从 APK 解包取真实值修正，解决「此版本已停用」报错
- **QQ 扫码登录**（`apps/qqLogin.js` + `utils/qqPageLogin.js`）：QQ 网页授权（m_authorize）+ 营地 `/user/login(qqconnect)` 换凭证，支持 `#设置QQ` 指定账号，扫码成功自动保存凭证
- **资产与签到**（`apps/assetAndSign.js` + `apps/extractCred.js`）：营地仓库分类资产查询、每日签到；签到修复 `roleId` 被公共参数覆盖导致 `-71005` 的问题
- **凭证提取模块**：配套 LSPosed 模块（`com.camp.hook`）抓取营地登录凭证直接复制到剪贴板，格式与 `#提交和平` 一致，免抓包
- **指令规范**：登录指令统一为 `#和平QQ登录` / `#和平微信登录`，签到为 `#和平签到`；切换登录方式需带「强制」
- **周报**（`apps/weeklyReport.js` + `resources/weeklyreport.html`）：段位积分变化（含 +/- 与前后对比）、场次 / 胜场 / 前 10 / 淘汰 / 阵亡 / K·D 六指标卡
- **全部战绩**（`apps/battleList.js` + `utils/battleView.js` + `resources/battleoverview.html` / `battlelist.html`）：
  - 十分类总览取自 `getpubgbattlelist` 的 tabIndex；分类列表每页 10 场，页码 1-10
  - 列表统一为「结果/排名 · 模式 · 数值1 · 数值2 · 评分 · 时间」六列，由 `buildRow` 按分类决定每列取什么，模板不再按模式分支
  - **晋级赛角标**：左上角金 / 灰丝带「晋级赛·成功 / 失败 / 保护」，含晋级进度
  - **排名配色**：取接口 `rankColor`，`#0` 视为无排名不展示
  - **地铁行**：`hardType` + 成败、击败、狩猎积分、收益（负数标红、新高标「新纪录」）
  - **团竞行**：胜 / 败、淘汰 + 助攻、积分 + 变化、连击徽章（胜金败红）
  - 地铁 / 古墓列表顶部附带赛季档案卡（场数 / 收益 / 撤离率等）
  - 列表写入共享缓存（`utils/battleCache.js`），`#和平战绩详情` 可直接按编号查全部战绩里的对局
- **最近战绩与单局详情**（`apps/recentBattle.js` + `utils/battleView.js` + `resources/recentbattle.html` / `battledetail.html`）：
  - `buildDetailView` 按返回结构归一化，模板只判断「有没有这个区块」，未知模式也不会白屏
  - 地铁：收益卡（新纪录 / 钻石）、六格数据、装备栏、背包与品质分布、淘汰明细（伤害/距离/护甲/头盔/弹药）、段位图标
  - 超体：英雄卡、插件、称号徽章、能力雷达、伤害与治疗构成
  - 团竞：蓝红双方阵容；数值条放队伍排名 / 淘汰 / 助攻 / 战损 / 连击 / 积分（胜负已在标题条 chip 上，不重复占格）
  - 经典：枪械命中部位、队伍、我的淘汰、淘汰我的人、第一名队伍
  - 荣誉图标（前十 / 前五）放标题条右侧；`mvpIcon` 不放这里（图大字重，与成员行 MVP 徽章重复）
- **主页渲染重构**（`resources/myHomepage.html` + `apps/myHomepage.js`）：
  - ins 深色风格，黑白灰三色主题（仅「游戏在线」状态用绿色背景）
  - 三列卡片布局：个人资料 / 印记成就 / 模式数据；团竞拆成排位、传统两张卡
  - 王牌 / 地铁 / 古墓印记三卡独立展示，图标放大并保留原始比例
  - 地铁印记卡：5 印记横排 + 历史最高财富 / 历史最高积分双成就卡
  - 区服信息以图标内联展示（QQ/微信、安卓/苹果），零外部依赖
  - 新增字段：最近战斗时间、在线状态、最高战力/职业、职业熟练度、最高收益成就

---

## 开发工具

`docs/tools/` 下两个脚本，改模板时用来快速看效果，不用重启机器人。

### `pubg_battle_preview.mjs` — 渲染预览图

用真实营地数据跑模板 → Edge 无头截图，产物落在 `<JIULI_ROOT>/temp_preview/*.png`。

```bash
# 默认读 D:/jiuli 的凭证与依赖
node docs/tools/pubg_battle_preview.mjs

# 只渲列表 / 只渲详情
ONLY=list   node docs/tools/pubg_battle_preview.mjs
ONLY=detail node docs/tools/pubg_battle_preview.mjs

# 复用上次落盘的 view_*.json，不重复打接口
REUSE=1 node docs/tools/pubg_battle_preview.mjs
```

环境变量：`JIULI_ROOT`（默认 `D:/jiuli`）、`EDGE_PATH`、`VTB`（虚拟时间预算，默认 25000ms）。

> ⚠️ 必须在**沙箱外**执行，否则 Edge 起不来。地铁详情有 60+ 张 CDN 图，`VTB` 给小了会截到破图。

### `pubg_field_audit.mjs` — 字段覆盖率审计

拉一局地铁 / 超体 / 团竞的原始详情，dump 出顶层字段和各 block 的 key，用来核对「接口有但模板没展示」的数据。

```bash
node docs/tools/pubg_field_audit.mjs
# 产物：temp_preview/raw_*.json、fields_*.txt
```

两个脚本都用 `createRequire(<JIULI_ROOT>/package.json)` 锚定依赖解析，所以**在任意目录执行都能跑**。
