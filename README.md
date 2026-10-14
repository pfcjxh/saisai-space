# 赛赛 · 双人空间

> **情侣专属的私密小宇宙** —— 一个只属于两个人的 PWA 私密空间。
> 异地也能一起记日记、数纪念日、关心彼此的身体、攒共同的心愿单。

**🌐 在线使用：** **https://saisai-pp-space.pages.dev**
（手机浏览器打开 → 「添加到主屏幕」即可像原生 App 一样使用）

| | |
|---|---|
| **技术栈** | Vue 3.5 · TypeScript 5.9 (strict) · Vite 7 · Pinia 3 · Tailwind v4 |
| **后端** | Supabase（Auth / Postgres + RLS / Storage / Realtime / Edge Functions） |
| **PWA** | vite-plugin-pwa（自定义 Service Worker + Web Push 推送） |
| **部署** | Cloudflare Pages（前端）+ Supabase（数据与函数） |
| **数据模型** | 13 张业务表，全部启用 RLS 行级安全，空间外的人**看不到你们的任何数据** |

---

## 目录

1. [登录网页：注册与配对](#一登录网页注册与配对)
2. [功能详解](#二功能详解)
3. [使用指南（按场景）](#三使用指南按场景)
4. [技术架构](#四技术架构)
5. [本地开发](#五本地开发)
6. [部署与运维](#六部署与运维)
7. [隐私与安全](#七隐私与安全)
8. [已知边界与路线图](#八已知边界与路线图)

---

## 一、登录网页：注册与配对

**登录页地址：** https://saisai-pp-space.pages.dev/auth
（未登录时从任意页面都会引导到这里；直接访问 `/auth` 也有效）

### 1.1 注册（每人一次）

切换到 **「注册」** 标签，填写三项：

| 字段 | 说明 |
|---|---|
| **邮箱** | 用作登录账号（必须真实可用，见下方邮箱确认） |
| **密码** | 至少 **6 位** |
| **昵称** | 对方在 App 里看到的名字（例如「赛赛」「pp」） |

点击 **「注册并开始」** → 页面提示 *「注册邮件已发送，请查收并点击确认链接，然后回到这里登录」*。
**去邮箱点开确认链接**（Supabase 发送，一般几秒内到达；没收到检查垃圾箱），然后回登录页。

> ⚠️ 未确认邮箱前无法登录，这是 Supabase Auth 的默认安全策略。

### 1.2 登录

**「登录」** 标签 → 输入邮箱 + 密码 → 进入。

- 已有配对空间的账号：直接进入「今日」看板。
- 忘记密码：应用内暂未提供自助重置入口，需由部署者在 Supabase Dashboard → Authentication → Users 里发送重置邮件。

### 1.3 创建空间 / 凭邀请码配对（**双人空间的核心**）

首次登录且尚未配对时，登录页会出现两个入口：

```
┌─────────────────────────────┐
│   创建双人空间               │   ← 先登录的一方点这里
│   生成邀请码，等 TA 来加入     │
├─────────────────────────────┤
│   加入 TA 的空间              │   ← 后登录的一方点这里
│   输入 TA 发来的 6 位邀请码     │   （例如：ABC123）
└─────────────────────────────┘
```

**完整配对流程（第一次一起用时走一遍即可）：**

1. **你**：注册 + 登录 → 点 **「创建双人空间」** → 得到一个 **6 位邀请码**（页面明文展示，可一键复制）
2. 把邀请码发给 TA（微信/iMessage 随意）
3. **TA**：注册 + 登录 → 点 **「加入 TA 的空间」** → 输入邀请码 → 加入
4. 你这边点 **「刷新」** 看到 TA 已加入 → 双方自动跳转「今日」看板，配对完成

> 配对后，一个空间**恰好两个人**：日记、心愿、待办、生理期、情书——全部只有彼此可见。
> 邀请码随时可在 **设置 → 我们的空间** 查看（空间邀请码一栏）。

---

## 二、功能详解

底部导航共 5 个标签 + 设置页：

> **今日 · 我们 · 生理期 · 日记 · 心愿**

### 2.1 今日（`/today`）—— 双人看板

| 卡片 | 功能 |
|---|---|
| **问候头部** | 按时段问候（早安/午好/晚安）+ 日期星期 + 「在一起第 N 天」+ 自定义情话；双方心情头像（点按可打卡当前心情：平静/开心/疲惫/被关怀/困倦）；**分享卡片**：把天数与纪念日生成精美图片，长按保存发朋友圈 |
| **开启通知横幅** | 检测到本机未绑定推送终端时出现，一键开启；已开启或点「稍后」后 7 天内不再打扰 |
| **双城天气** | 左右两列分别显示 **「我」** 与 **「TA」** 的今日/明日天气与温度区间（数据来自 Open-Meteo 免费气象，6 小时缓存，离线自动回退上次数据并标注「缓存」）。城市可在设置页随时改（见 [3.2](#32-改城市比如她从莱阳去海阳上学)） |
| **里程碑倒数** | 距离下一个重要日子的倒数：置顶（pinned）纪念日优先，自动涵盖**农历纪念日**与传统节日（七夕、中秋等由农历引擎换算） |
| **生理期关怀** | 本人视角：周期进度条 + 「预计 N 天后来临 / 经期中第 N 天」+ 快捷记录入口；伴侣视角：自动切换成关怀话术（「她还没有记录周期」等），底部常驻「日历推演仅供参考」合规标注 |

### 2.2 我们（`/together`）—— 共享待办 + 纪念日 + 回忆

**① 待办**
- 四个分类：`daily 日常 / recharge 充电 / bill 账单 / date 约会`
- 指派给 **我 / TA / 共同**；重复规则（每周几自动滚动）
- 按 **今天 / 明天 / 更晚 / 无日期** 自动分组；已完成单独收纳
- 支持搜索；双方改动**实时同步**（Supabase Realtime，你勾完 TA 那边立刻变）

**② 纪念日**
- 分类：`birthday 生日 / anniversary 纪念 / holiday 节日 / life 生活`
- **公历 / 农历双轨**：农历日期每年自动换算回公历（含闰月处理），不用每年手动改
- 「逐年提醒」开关、**置顶**（影响今日页倒数）；清单 + **月历**双视图（月历里还会标出当月传统节日）
- 创建/编辑/删除全开放，双方实时同步

**③ 回忆**
- 时间轴聚合：**日记 + 纪念日 + 情书** 三类事件按月翻阅你们的故事
- 点击情书条目可直接拆信

### 2.3 生理期（`/cycle`）—— 周期管理 + 伴侣代录

- **周期预测**：基于历史记录的加权平均（越近的周期权重越高），给出「预计 X~Y 天后来临」「已推迟 N 天」等结论；数据不足时明确标注「（默认）」，不假装精确
- **清单视图**：进行中的经期卡（可改起止日期/删除）+ 历史周期卡（显示周期长度）
- **日历视图**：整月标记经期日、预测窗口与打卡
- **每日打卡**：经量（1~5 滴水）、痛感（无痛~剧烈）、伴随症状（腰酸/腹胀/疲惫/嗜睡/胸胀/情绪低落）、心情、备注
- **隐私开关**：每条打卡可选 `公开给 TA` 或 `仅自己可见` —— **「仅自己可见」在数据库层（RLS）隔离，TA 查不到任何细节**
- **伴侣代录**（本项目核心场景）：
  - 男生打开生理期页进入 **伴侣关怀视角**，操作区显示「正在为 TA 代录」，可替她 **经期来了 / 今日打卡 / 补录历史周期 / 修改 / 删除**
  - 每条记录的 `recorded_by` 标注实际录入人，可追溯
  - **代录授权开关**（设置 → 互相帮忙）：她随时可以关掉，关掉后他立即失去写入权限
- **实时同步**：他代录后，她打开页面立刻看到（Realtime），无需手动刷新
- **主动推送**：经期开始 / 刚结束时，系统即时提醒他「她的经期来了，接下来几天多照顾她」；此外每天上午 9 点按预测做 1~2 天的关怀预警（夜间 23:00~08:00 强制静默）

### 2.4 日记（`/diary`）—— 日记 + 信笺

两个标签页：

**「日记」**
- 按月分组的时间轴日记；支持**图片**（本地压缩后上传 Supabase Storage）、**点赞**、**追加式评论**（你们的对话留在字里行间）
- 只有空间内两个人可见；作者可编辑/删除自己的日记

**「信笺」**
- **便利贴墙**：双列瀑布流便签，随手贴一句想说的话，对方可看到是谁贴的；作者可编辑/撤下
- **信笺盒（情书）**：写一封带标题与正文的信 → 以信封动画寄出 → 对方点开拆信；寄出后不支持编辑（**信是写完才郑重寄出的**），作者可撤回

### 2.5 心愿（`/wishes`）—— 共同心愿单

- 分类：`travel 旅行 / food 美食 / experience 体验 / purchase 心愿物`
- 谁都可以提心愿 → 一起**标记达成**（记录达成时间）
- 适合攒「想一起做的事」：想去的店、想看的演出、想买的礼物

### 2.6 设置（`/settings`）—— 这里的内容都可以直接改

| 分区 | 可改项 |
|---|---|
| 我们的空间 | **在一起的日子**（含「已一起走过 N 天」实时预览）· 空间邀请码 |
| 我 | 昵称 · **所在城市（天气）** |
| TA | TA 的昵称 · **TA 的所在城市（天气）** ——「你随时可以帮 TA 维护」 |
| 首页文案 | 问候语下面那句情话（留空则用默认文案） |
| 互相帮忙 | **允许代为记录生理期** / **允许代为修改资料** 两个授权开关（双方可见、随时可撤销） |
| 提醒与外观 | 消息提醒（日记/纪念日/经期三类开关 + **开启通知 / 测试推送**）· **主题外观**（纯黑 OLED / 米白 / 雾蓝 / 樱粉 / 跟随系统） |
| 账号 | 当前邮箱 · 退出登录 |

---

## 三、使用指南（按场景）

### 3.1 第一次一起用

按 [§1.3](#13-创建空间--凭邀请码配对双人空间的核心) 完成配对 → 进设置把 **昵称、双方城市、在一起的日子** 一并填好 → 今日页就有了完整看板。

### 3.2 改城市（比如她从莱阳去海阳上学）

**设置 → 「TA 所在的城市（天气）」→ 修改**：

- 直接**输入任意城市名**（如 `海阳`）→ 确定；或点快捷城市组一键选中
- 内置了常用城市坐标，**没有收录的城市走地理编码自动解析**；同名重名城市（如「海阳」安徽/山东各有一个）**优先匹配山东省**
- 切换城市会清掉旧坐标重新解析，天气卡下拉刷新即生效

### 3.3 帮 TA 记录生理期（她两周才用一次手机的场景）

1. 打开 **生理期** 标签（会显示「正在为 saisai 代录」提示条）
2. 她来月经当天 → 点 **「经期来了」**
3. 之后每天想记就点 **「今日打卡」**（经量/痛感/症状随便勾）
4. 结束当天 → 点 **「经期结束」**
5. 忘记记的历史 → 点 **「补录」**，手选起止日期（补录旧日期**不会**给她发推送打扰）
6. 录错了 → 卡片上直接编辑或删除

> 前提：设置 → 互相帮忙 →「允许代为记录生理期」处于**开启**（默认开启）。她不在时你替她记，她回来随时可以关掉这个授权。

### 3.4 开启手机通知（必做，否则收不到提醒）

- **iPhone**：Safari 打开本站 → 底部「分享」→ **「添加到主屏幕」** → 从主屏幕图标重新打开 App → 回到首页点 **「开启双人消息提醒」横幅**（iOS 需 16.4+）
- **Android / 桌面浏览器**：直接点首页横幅的 **「开启」** → 允许通知权限
- 验证：设置 → 消息提醒 → 点 **「测试」**，本机应弹出「已成功连接到我们的私密频道 ♡」

推送会在这些时刻到达：TA 写了新日记 · 纪念日当天 9:00 · 经期开始/结束（推给他）· 经期临近 1~2 天（双方分别推关怀）。

### 3.5 记录有意义的日子

**我们 → 纪念日 → ＋**：选分类 → 写标题 → 选日期（**公历/农历**可切，农历会实时预览对应公历日）→ 打开「逐年」→ 可选**置顶**（置顶项会出现在今日页倒数卡）。

### 3.6 写日记 / 贴便签 / 寄情书

**日记 → ＋** 写正文加图 → 发布 → TA 端收到推送，可以点赞评论。
**日记 → 信笺**：左半是便利贴墙（随手贴），下方是情书（郑重寄出，寄出后不可编辑）。

### 3.7 离线也能用

应用是 PWA：**装过一次 + 打开过**，之后无网也能浏览上次缓存的看板/日记/生理期（顶部会有离线条），恢复网络自动同步。

---

## 四、技术架构

### 4.1 目录结构

```
app/
├── index.html                  # PWA 外壳 + 主题防闪烁内联脚本
├── vite.config.ts              # Vite + Tailwind v4 + vite-plugin-pwa(injectManifest)
├── public/                     # 图标 / _redirects（Cloudflare SPA 回退）
├── src/
│   ├── main.ts                 # 挂载 + 三层全局错误兜底 + SW 自动更新注册
│   ├── router/index.ts         # 路由 + 鉴权守卫（public 路由未登录进演示态）
│   ├── stores/                 # Pinia：auth / couple / app
│   ├── views/                  # AuthView · TodayView · TogetherView · CycleView
│   │                           # DiaryView · WishesView · SettingsView
│   ├── components/
│   │   ├── dashboard/          # 天气卡 · 生理期关怀卡 · 里程碑卡 · 推送横幅 · 分享卡
│   │   ├── period/             # 状态卡 · 历史卡 · 日历 · 打卡抽屉 · 周期表单
│   │   ├── anniversaries/      # 纪念日卡 · 创建/编辑抽屉 · 月历
│   │   ├── diary|notes|letters # 日记卡 · 便利贴 · 信笺与拆信动画
│   │   ├── todos|wishes        # 待办卡 · 心愿卡
│   │   ├── layout|common|settings
│   ├── composables/            # usePeriod · usePeriodRealtime · useWeather(地理编码)
│   │                           # useTodos(Realtime) · useAnniversaries · useWebPush …
│   ├── services/               # 各表 CRUD 收敛层 + supabase 客户端 + 离线快照
│   ├── utils/                  # date(时区) · lunar(农历双轨) · errors · inflight(回环抑制)
│   ├── mocks/                  # 未登录演示态兜底数据（任何页面永不白屏）
│   └── sw.ts                   # 自定义 Service Worker：预缓存 + 运行时缓存 + Push 监听
├── supabase/
│   ├── migrations/             # 0001~0013：schema · RLS · 推送 · 实时（幂等可重放）
│   └── functions/              # send-push · daily-check-push（Deno Edge Functions）
├── scripts/                    # supabase-sql · apply-migration · verify-* 验证套件
└── tests/                      # 时区/坐标等 node 校验脚本
```

### 4.2 数据模型（13 张表）

`profiles`（昵称/性别/城市/时区/心情/通知偏好/情话） · `couples`（邀请码/在一起的日子） · `couple_members`（owner/partner 两成员） · `couple_settings`（代录授权开关） · `todos` · `anniversaries`（公历农历/置顶） · `diaries`（点赞/评论 JSONB） · `love_letters` · `sticky_notes` · `period_cycles`（起止日期 + `recorded_by` 录入人） · `period_logs`（打卡明细 + `visibility` 隐私开关） · `wishes` · `push_subscriptions`（推送终端）

### 4.3 安全模型（RLS 行级安全）

**所有表启用 RLS，空间外用户零可见**。关键策略：

| 边界 | 策略 |
|---|---|
| 空间隔离 | 全部按 `couple_members` 成员身份判定，非成员一张表都读不到 |
| 生理期打卡隐私 | 伴侣只能读 `visibility='shared'` 或**自己录入**的打卡；她标「仅自己可见」的内容在**数据库层**被截断 |
| 伴侣代录 | `period_cycles/logs` 允许伴侣写入，但需 `couple_settings.allow_proxy_period_write = true`（默认开，她可随时关） |
| 资料互改 | 双方可改对方昵称/城市（`allow_proxy_profile_edit` 同样可关） |
| 推送终端 | `push_subscriptions` 仅本人可读写；VAPID 私钥与 webhook 密钥存 Supabase Vault，**不进代码库** |
| 离线快照 | 本机缓存按 `${userId}:${coupleId}` 隔离，换账号不会串数据 |

### 4.4 实时与推送链路

- **Realtime**：`todos / anniversaries / diaries / love_letters / sticky_notes / wishes / period_cycles` 进入 `supabase_realtime` 发布，前端按空间/归属人订阅，写操作有回环抑制（自己的乐观写不会被服务端回声覆盖）。**`period_logs` 有意不进发布**——Realtime 不逐行执行 RLS，私密打卡进发布即泄漏。
- **即时推送**（pg_net 触发器 → `send-push` Edge Function → Web Push）：日记创建 → 推 TA；经期开始/结束 → 推他（他代录时不推他，补录历史不打扰）。
- **定时推送**（pg_cron 每小时 → `daily-check-push`）：按各自**时区**在本地上午 9 点下发：纪念日当天提醒（公历/农历都算）+ 经期临近 1~2 天关怀（分别推双方）；本地 23:00~08:00 静默。
- 偏好开关 `notify_diary / notify_anniversary / notify_period` 在发送层过滤；失效终端（404/410）自动剔除。

### 4.5 PWA 与离线

- `injectManifest` 自定义 SW：App Shell 预缓存、Open-Meteo/字体/Supabase 请求分级缓存（Cache-First / NetworkFirst）、Push 事件唤起通知并按 `data.url` 路由
- **自动更新**：新版本发布后用户下次打开自动重载，不需要手动清缓存
- 数据层 `networkFirst` 快照：弱网/离线平滑降级并标注「缓存」，绝不白屏
- iOS 添加到主屏幕引导（带 3 天防骚扰）；装机后支持独立模式 + Web Push

---

## 五、本地开发

### 5.1 环境准备

```bash
node -v        # 建议 20+（开发在 24 上验证）
npm install
cp .env.example .env      # 然后填入真实值；.env 已被 .gitignore 排除
```

`.env` 变量说明（见 `.env.example` 注释）：

| 变量 | 用途 |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase 项目地址与 anon key（**仅这两个会进前端包**） |
| `SUPABASE_SECRET_KEY` / `SUPABASE_ACCESS_TOKEN` | 仅供本地 `scripts/*.mjs` 使用，**绝不进前端** |
| `VITE_VAPID_PUBLIC_KEY` | Web Push 公钥；不配则前端自动进 Mock 模式 |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | Pages 部署脚本用 |

### 5.2 常用命令

```bash
npm run dev               # 开发服务器（已开 host，手机可访问 http://<本机IP>:5173 联调）
npm run typecheck         # vue-tsc + tsc，必须零错误
npm run build             # 类型检查 + 生产构建（输出 dist/）
npm run preview           # 本地预览构建产物
npm run icons             # 重新生成 PWA 图标（sharp）

npm run test:date         # 时区日期校验
npm run test:date:all-tz  # 全时区跑一遍
```

> Windows 沙箱提示：若构建时 esbuild 报 EPERM，先把 `$env:TEMP` 指到工作区内再 build。

### 5.3 数据库与验证脚本

```bash
# 执行 SQL（走 Supabase 管理 API，本机可直连 *.supabase.co 的 REST 但管理通道最稳）
node scripts/supabase-sql.mjs "select 1"
node scripts/supabase-sql.mjs --file 某个.sql

# 应用迁移（事务内执行，失败整体回滚；--dry 先干跑）
node scripts/apply-migration.mjs --file supabase/migrations/20260916001300_xxx.sql [--dry]

# 验证套件
node scripts/verify-rls-semantics.mjs     # RLS 语义
node scripts/verify-editable.mjs          # 可编辑能力（含陌生人越权拒绝）
node scripts/verify-proxy-consent.mjs     # 代录授权开关
node scripts/verify-push-chain.mjs        # 推送链路端到端（密钥有效性）
node scripts/verify-auth-flow.mjs         # 登录流程
node scripts/verify-diary-policies.mjs    # 日记策略
```

---

## 六、部署与运维

### 6.1 前端（Cloudflare Pages）

```bash
npm run build
npx wrangler pages deploy dist --project-name=saisai-pp-space --branch=main --commit-dirty=true
```

（需要 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`；项目已绑定 `saisai-pp-space.pages.dev`。）

### 6.2 数据库迁移

```bash
node scripts/apply-migration.mjs --file supabase/migrations/<新迁移>.sql
```

迁移文件全部**幂等**（`IF NOT EXISTS` / `CREATE OR REPLACE` / 判存），可重复执行；`apply-migration` 会在事务里跑并在结束后核对策略数与 RLS 开关。

### 6.3 Edge Functions

```bash
supabase functions deploy send-push --no-verify-jwt
supabase functions deploy daily-check-push --no-verify-jwt
# 推送密钥变更后同步（webhook 密钥在 Vault，VAPID 私钥在函数 secrets）
node scripts/sync-push-secret.mjs
```

### 6.4 版本保存点（回滚）

git 里有 17 个带注释的保存点，可完整回退：

```bash
git tag -l 'checkpoint-*'
git reset --hard checkpoint-16-weather-period-fix   # 回退到指定保存点
```

---

## 七、隐私与安全

- **私有空间**：13 张表全部 RLS，非成员零可见；本仓库为 **Private**。
- **秘密不入库**：`.env` 不入库（历史已清洗，活跃密钥从未出现在任何提交）；VAPID 私钥、推送 webhook 密钥在 Supabase Vault / Functions Secrets。
- **隐私开关真实生效**：生理期打卡的「仅自己可见」在 SQL 层过滤，不是前端隐藏。
- **代录可撤销**：她随时在设置里关掉代录授权，RLS 立即生效。
- **夜间静默**：23:00~08:00 不推任何通知。
- **合规标注**：周期推算基于历史均值的日历推演，页面常驻声明「不可作为避孕或医学诊疗依据」。
- 安全事件与轮换流程见 [SECURITY.md](./SECURITY.md)；变更记录见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 八、已知边界与路线图

**当前边界（有意为之或尚未做）：**

- 应用内**无自助找回密码**（部署者可在 Supabase 后台发重置邮件）
- 情书寄出后不可编辑（产品决策）；心愿单图片字段已有、上传 UI 未做
- 首页「待办速览」组件已写好但未挂载（是否占用首屏待定）
- 尚无 CI/CD：目前手动 `typecheck + build + wrangler deploy`，后续可接 GitHub Actions 自动化

**候选升级方向**（与同类开源项目对照后整理）：重逢倒计时、恋爱地图（共同足迹打点）、悄悄话轻聊天、一键「想你了」、情侣活动卡抽签、数据导出。

---

## 许可

私人情侣应用，**未附开源许可证**——仅供学习参考；二次使用请先取得同意。
Issues / PR 欢迎技术讨论。

<p align="center">— 两个人的私密小宇宙，写给我们自己 —</p>
