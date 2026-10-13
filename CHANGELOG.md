# 变更记录与保存点

本文件记录 2026-10-13 的一轮集中整改，以及如何回退到任意保存点。

---

## 一、保存点（git tag）

每个保存点都是一个可完整回退的状态。**回退方式见第三节。**

| 标签 | 提交 | 内容 |
|---|---|---|
| `checkpoint-0-baseline` | `526b2e8` | **修复前基线**。整改开始前的完整工作区快照，任何改动都可退回这里 |
| `checkpoint-1-security` | `9a75039` | 安全整改：明文密钥迁入 Supabase Vault |
| `checkpoint-2-authview` | `6c30aef` | 配对状态机修复：创建空间后邀请码不再不可达 |
| `checkpoint-3-timezone` | `60a52f8` | 时区统一：消灭三套写法与硬编码东八区 |
| `checkpoint-4-borrowed` | `e56acd7` | 借鉴落地：离线快照身份隔离 + 全局错误兜底 |
| `checkpoint-5-cleanup` | `de3a788` | 清理死代码 + 接上被遗漏的里程碑卡 |
| `checkpoint-6-final` | `cb13bff` | 交付文档 CHANGELOG.md + 回退指引 |
| `checkpoint-7-realtime` | `00084cc` | Realtime 回环抑制（在途写入追踪 + 乐观更新防覆盖） |
| `checkpoint-8-dedup-rls` | `31c3327` | 左滑/键盘避让去重 + RLS `(select auth.uid())` 性能迁移（已落生产） |
| `checkpoint-9-docs` | `a06939a` | CHANGELOG 更新（第二轮保存点与遗留事项） |
| `checkpoint-10-push-secret` | `c1a8475` | **推送密钥轮换闭环**：Vault 托管 + 旧泄漏密钥作废 + 函数重部署 |
| `checkpoint-11-push-e2e` | `cc6b14e` | 推送验证覆盖真实日记触发器路径（14/14 通过） |
| `checkpoint-12-final` | `f912091` | CHANGELOG 反映推送密钥轮换已完成 |
| `checkpoint-13-editable` | `a9e1b1e` | **全量可编辑能力**：设置页 + 在一起的日子修正为 2026-08-07 + 伴侣代录生理期 + 任意城市名 |
| `checkpoint-14-proxy-consent` | `cc9d099` | **代录授权开关**（可见可撤销）+ 脏值检测 |

> `checkpoint-7` 起为第二轮深化工作，`checkpoint-13` 起为第三轮（可编辑能力），均基于 `checkpoint-6` 之后追加。

### 第三轮：让内容可直接在网页上修改

**需求**：用户要求大部分内容可自行修改，且需代女朋友录入生理期（她两周才能用一次手机）。

| 能力 | 位置 |
|---|---|
| 在一起的日子 | 设置页 → 已修正为 **2026-08-07**，带「已一起走过 N 天」预览 |
| 我的 / TA 的昵称 | 设置页 |
| 我的 / TA 的城市 | 设置页 → 支持**任意城市名**（Open-Meteo 地理编码兜底），常用城市按广东/山东分组 |
| 首页情话 | 设置页 → 首页文案 |
| 生理期代录 | 生理期页 → 伴侣可打卡/补录，记录标注代录人 |
| 代录授权开关 | 设置页 → 互相帮忙 → 双方可见、**可随时收回** |

**关键设计（调研同类开源项目后确定）**：业界共识是「经期数据默认对伴侣只读，
私密可见性由数据主人单方面控制」。本项目的代录需求是该共识之外的特例，
因此补了一层**显式可撤销授权**，而非简单放开 RLS：

- `couple_settings.allow_proxy_period_write` 控制伴侣能否代录（默认开，可随时关）
- 关掉后伴侣**立即**失去写权限（RLS 层生效，已用 6 项自动化断言验证）
- 她标记 `private` 且非伴侣录入的记录，**无论开关状态始终不可见**

---

## 二、各项改动摘要

### 检查点 1 — 安全

**问题**：迁移 `20260916000500_push_dispatch.sql` 把推送 webhook 密钥与项目 URL **明文写死**在 SQL 里并随迁移入库；`.env.example` 提交了真实项目 URL 与 anon key；`scripts/verify-push-chain.mjs` 硬编码项目 ref。

**整改**：
- 迁移重写为 v2，改为运行时从 **Supabase Vault** 读取：
  - `public.push_webhook_secret()` → `vault.decrypted_secrets`
  - `public.push_functions_base_url()` → `current_setting` / Vault / 本地默认
  - 两者均 `SECURITY DEFINER` 且 `REVOKE anon, authenticated`，防止密钥经 PostgREST 外泄
- 新增迁移 `20260916000900_rotate_push_webhook_secret.sql`：**轮换密钥**为 32 字节随机值
- `.env.example` 全部改为占位符
- 新增 [SECURITY.md](SECURITY.md)：凭据分级表 + **待你手动执行的轮换清单**

> ⚠️ **旧密钥已视为泄露，必须执行 [SECURITY.md](SECURITY.md) 第二节的轮换步骤**，否则推送会 401。

### 检查点 2 — AuthView 配对状态机

**问题**：`needsPairing = context === null` 遗漏了「已创建空间但 TA 还没加入」这一状态（context 非空、partner 为空）。该状态下两个 computed 同时为 false，页面回落到登录表单——**`onCreateCouple` 成功后用户被弹回登录页，邀请码在界面上完全不可达**，主流程断裂。

**整改**：改为显式五态状态机 `confirm-email | login | create-couple | await-partner | paired`，任意时刻必有且仅有一个分支命中。新增「等待 TA 加入」界面：大字号邀请码 + 一键复制 + 手动刷新配对状态。顺带修正邀请码输入 `maxlength` 8→6（与校验和文案对齐）。

### 检查点 3 — 时区

**问题**：三套写法并存，且 `'Asia/Shanghai'` 硬编码在 4 处。

| 错误写法 | 后果 |
|---|---|
| `new Date('2026-09-16').getDay()` | 日期串按 **UTC** 解析再取本地星期。**实测纽约时区返回 2（周二），正确值是 3（周三）——差一天** |
| `new Date(iso).getFullYear()` 拼串 | 隐式设备时区，与 `profiles.timezone` 不一致 |
| `new Date(\`${date}T12:00:00\`).toISOString()` | 按设备时区解释，跨时区存取无法往返 |

**整改**：`src/utils/date.ts` 顶部写入**时区规约**，并新增四个统一入口：

| 新函数 | 用途 | 替换 |
|---|---|---|
| `weekdayIndexOfDate()` | 日历事实（星期与时区无关） | 写法 ① |
| `formatDateInTimezone(iso, tz)` | 时间戳 → 日历日 | 写法 ② |
| `zonedTimeToUtc(date, time, tz)` | 日历日 → 时间戳（迭代两次跨越 DST） | 写法 ③ |
| `nowInTimezone(tz)` | 指定时区的年/月/日/星期 | 相对推算 |

并把 `profile.timezone` 贯通到 `useAnniversaries` / `usePeriod` / `TodoItemCard` / `TodoCreateSheet` / `CycleView` / `TogetherView`。

**顺带修复**：`CycleView.isPartnerView` 原为 `gender ?? 'male'`（女性用户资料加载前会先看到「伴侣关怀模式」）；`TodoItemCard.isOverdue` 原按时间戳比较（当天 12:00 到期的任务下午就被判过期）；过期文案「已过期 · 今天」自相矛盾。

### 检查点 4 — 借鉴同类项目

参考 GitHub 同类项目调研（结论：该品类无高 star 项目，价值在具体工程解法）。**仅借鉴设计思想，未复制任何代码。**

**A. 离线快照身份隔离（修复真实隐私泄漏）**
快照键只有业务域，不含身份。同设备换账号后 `readSnapshot()` 会把**上一账号**的日记/待办/生理期打卡当作本账号缓存读出。
→ 键空间改为 `${userId}:${coupleId}::${key}`；DB 升级到 v2 并丢弃旧键空间；登出顺序修正为**先清快照再 signOut**（快照定位依赖登出前的身份指纹）。

**B. `usePeriod` 快照路径绕过隐私过滤**
`networkFirst` 命中快照时直接信任 `result.data.logs`，未重新应用伴侣视角过滤 → 本机缓存有本人打卡明细时，伴侣视角会把私密打卡渲染出来。→ 一律按当前视角裁决。

**C. 全局错误兜底**
项目此前无 `app.config.errorHandler` / `onerror` / `unhandledrejection`，未捕获异常静默失败。
→ 新增 `src/utils/errors.ts`（`AppError` + Postgres 错误码映射 + 脱敏 + 分级输出 + 监控接入点），`main.ts` 挂三层兜底 + `vite:preloadError` 自动重载 + `router.onError`。其中 `PGRST202/204` 标记为**不可重试**（迁移没跑时重试永远不会成功）；`23502/23514` 归为 `VALIDATION` 而非误判为 `CONFLICT`。

### 检查点 5 — 清理与补接

**删除**：5 个 `.bak`（删除前已确认全仓无引用）、`todoService.listPendingTodos`、`profileService.updateProfile` + `ProfilePatch`。

> 📌 子代理报告称 `lunar.lunarLabelOfSolar` 是死代码，**经核实它在 [AnniversaryCard.vue:43](src/components/anniversaries/AnniversaryCard.vue#L43) 被使用，未删除**——避免了一次误删。

**补接**：`UpcomingMilestoneCard` 此前是无引用组件，导致纪念日「置顶到首页」开关**在 UI 上完全无效**。现已在 `TodayView` 接入并拉取纪念日数据，开关真正生效。

**未做（有意）**：
- `QuickTodoCard` 未删除——首页当前不展示待办速览，直接删会损失产品能力，是否启用待决策。
- **未做**调研报告建议的「日记评论/点赞拆独立表」重构。该建议基于「伴侣点赞会被 RLS 拒绝」的假设，但按 SQL 语义判定**该假设不成立**：`WITH CHECK` 校验的是新行，客户端只发 `{liked_by}` 时其余列保持原值，`diary_body_unchanged()` 比对通过。且线上库当前网络不可达、无法实测。基于未验证的假设做 schema 迁移风险高于收益。

---

## 三、如何回退

```bash
# 查看所有保存点
git tag -l 'checkpoint-*'

# 方式 1：完整回退到某个保存点（丢弃其后的所有改动）
git reset --hard checkpoint-3-timezone

# 方式 2：只回退单个文件到某个保存点
git checkout checkpoint-2-authview -- src/views/AuthView.vue

# 方式 3：对比某个保存点与当前的差异
git diff checkpoint-0-baseline --stat
git diff checkpoint-0-baseline -- src/utils/date.ts

# 方式 4：回到最新状态（回退后又想前进）
git reset --hard checkpoint-5-cleanup
```

> ⚠️ `git reset --hard` 会丢弃工作区未提交的改动。执行前先 `git status` 确认。

---

## 四、验证方式

```bash
npm run typecheck        # vue-tsc + tsc，零错误
npm run build            # 生产构建（沙箱下需先设 TEMP，见下）
npm run test:date        # 时区测试（单时区，22 项断言）
npm run test:date:all-tz # 时区测试跨 6 时区（132 项断言）
npm run preview          # 本地预览构建产物
node --experimental-strip-types tests/inflight.check.ts  # 在途写入 28 项断言
node scripts/verify-rls-semantics.mjs                    # 线上 RLS 语义 19 项断言
node scripts/apply-migration.mjs --file <迁移.sql>        # 事务内应用迁移
node scripts/supabase-sql.mjs "select 1"                  # 直连生产库执行 SQL
```

**构建环境注意**：若在受限沙箱下构建，esbuild 需要可删除的临时目录，先执行：

```powershell
$env:TEMP = Join-Path $PWD '.tmp-build'; $env:TMP = $env:TEMP
```

`.tmp-build/` 已在 `.gitignore` 中。

**本机网络限制**：`*.supabase.co`（项目域名）的 TLS 握手被网络层重置，
但 `api.supabase.com`（管理 API）与数据库端口可达。因此：
- 迁移、SQL、密钥轮换走 `scripts/supabase-sql.mjs`（管理 API 通道）；
- `tests/rls-penetration.mjs` 依赖公网访问项目域名，**本机无法运行**，
  改用 `scripts/verify-rls-semantics.mjs` 在同一连接内切身份断言。

**当前验证结果（全部为生产环境实测）**：
- `typecheck` 通过；`build` 通过（precache 45 项）
- 时区测试 6 时区 × 22 项 = **132 项全绿**
- 在途写入测试 **28 项全绿**
- RLS 语义验证 **19/19 通过**
- 推送链路端到端验证 **14/14 通过**
  （新密钥 200 / 旧泄漏密钥 401 / 错误密钥 401 / 真实写日记触发 200）
- 线上 `https://saisai-pp-space.pages.dev`：今日页 **11/11 命中，零运行时错误**

---

## 五、遗留事项

1. **凭据轮换（建议，非阻塞）**：`.env` 中的 `service_role`、Supabase access token、
   Cloudflare token 曾以明文存在于工作区。你已表示暂不处理，仅作记录
   （见 [SECURITY.md](SECURITY.md) 第二节）。
2. **`QuickTodoCard`** 去留待决策（首页当前不展示待办速览）。
3. **调研报告中未落地的借鉴项**：Playwright E2E 骨架、月历网格 ×2 去重、
   弹层 CSS ×13 收敛为单一 `<BaseSheet>`。

> 推送密钥轮换已**完成并验证**，不再属于遗留事项 —— 详见 `checkpoint-10`。
4. 调研报告中的其余借鉴项（Realtime 回环抑制、VueUse 去重左滑/键盘避让、Playwright E2E、RLS 的 `(select auth.uid())` 性能写法）尚未落地，可作为后续迭代。
