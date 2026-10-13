# 安全说明与凭据轮换清单

> 本文件记录赛赛 · 双人空间项目的凭据管理约定，以及一次已发生的密钥外泄事件处置流程。

## 一、凭据分级

| 凭据 | 存放位置 | 能否进版本库 | 说明 |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `.env` / 前端构建 | ✅ 可以 | 项目地址，非机密 |
| `VITE_SUPABASE_ANON_KEY` | `.env` / 前端构建 | ✅ 可以 | 受 RLS 约束，设计上可公开 |
| `VITE_VAPID_PUBLIC_KEY` | `.env` / 前端构建 | ✅ 可以 | VAPID 公钥 |
| `SUPABASE_SECRET_KEY` | `.env`（仅本地脚本） | ❌ **禁止** | service_role 级，**可绕过全部 RLS** |
| `SUPABASE_ACCESS_TOKEN` | `.env`（仅本地脚本） | ❌ **禁止** | 管理 API 令牌，可操作整个账号 |
| `CLOUDFLARE_API_TOKEN` | `.env`（仅部署） | ❌ **禁止** | 可发布/删除 Pages 项目 |
| `PUSH_WEBHOOK_SECRET` | Supabase Vault + Edge Secrets | ❌ **禁止** | 调度层共享密钥 |
| `VAPID_PRIVATE_KEY` | 仅 Edge Function Secrets | ❌ **禁止** | 推送签名私钥 |

**铁律**：`.env` 与 Edge Function Secrets 之外，任何文件都不得出现上述「禁止」级凭据的字面量——包括 SQL 迁移、测试脚本、注释与文档。

## 二、已发生的外泄事件与处置

### 事件
迁移 `20260916000500_push_dispatch.sql` 的初版把 webhook 共享密钥与项目 URL
**明文写死**在 SQL 中，并随迁移进入版本历史；同时 `.env.example` 提交了真实项目 URL 与 anon key。

### 处置（已完成）
1. 迁移 `...000500` 重写为 **v2**：删除全部机密字面量，改为运行时从 **Supabase Vault** 读取
   （`public.push_webhook_secret()` / `public.push_functions_base_url()`，且 `REVOKE` 掉
   `anon` 与 `authenticated` 的执行权，防止密钥经 PostgREST 外泄）。
2. 新增迁移 `20260916000900_rotate_push_webhook_secret.sql`：把库内密钥**轮换为新的 32 字节随机值**。
3. `.env.example` 清空所有真实凭据，改为占位符 + 获取途径说明。
4. `scripts/verify-push-chain.mjs` 的项目 ref 改为从 `.env` 推导，不再硬编码。

### 已完成（2026-10-14，已对生产库执行并验证）
> 旧密钥 `aassddff…rtyy` 曾经是**实际生效**的密钥——调查发现 Edge Secret 虽被改过，
> 但函数容器从未重启，运行的仍是旧值。现已彻底作废。

| 步骤 | 状态 |
|---|---|
| 项目 URL 托管到 Vault（Supabase 禁止 `ALTER DATABASE SET app.settings.*`，报 42501） | ✅ |
| 迁移 `...000500` v2 建立 Vault 密钥 + 辅助函数 + 重写触发器与 cron | ✅ 已应用 |
| 轮换密钥（32 字节随机），同步写入 Vault 与 Edge Secrets | ✅ 已轮换 |
| 重新部署 `send-push` v5 / `daily-check-push` v4 使新环境变量生效 | ✅ 已部署 |
| 端到端验证 | ✅ **13/13 通过** |

**关键验证结果**（`node scripts/verify-push-chain.mjs`）：

```
Vault 新密钥 -> HTTP 200   链路通
旧泄漏密钥   -> HTTP 401   已作废  ← 整改核心目标
随机错误密钥 -> HTTP 401   防伪造
```

> ⚠️ 一个容易踩的坑：**写入 Edge Secret 后必须重新部署函数**，否则容器仍用旧
> 环境变量。而且 Management API 的 `secrets` 接口返回的 `value` 字段是**不透明
> 表示**（非明文），无法用它比对密钥是否生效——唯一可信的验证方式是让真实链路
> 调用一次函数（见 `scripts/verify-push-chain.mjs`）。

### 仍建议轮换（你已表示暂不处理，仅作记录）
这三项曾以明文存在于工作区 `.env`：

- Supabase Dashboard → Project Settings → API → **Roll `service_role` / secret key**
- Supabase Account → Access Tokens → **吊销并重建** `sbp_...`
- Cloudflare → My Profile → API Tokens → **Roll** `cfut_...`

## 三、日常约定与运维脚本

- 新增需要机密的迁移时，一律走 Vault：`vault.create_secret()` + `SECURITY DEFINER` 读取函数 + `REVOKE FROM anon, authenticated`。
- **密钥轮换**用现成脚本，不要手工改：
  ```bash
  node scripts/sync-push-secret.mjs --check    # 只校验两侧是否一致
  node scripts/sync-push-secret.mjs --rotate   # 生成新值并写入两侧
  # 轮换后必须重新部署函数，否则环境变量不生效：
  npx supabase functions deploy send-push --project-ref <ref> --no-verify-jwt
  npx supabase functions deploy daily-check-push --project-ref <ref> --no-verify-jwt
  node scripts/verify-push-chain.mjs           # 端到端验证
  ```
- **应用迁移**用事务化脚本（失败自动回滚）：
  ```bash
  node scripts/apply-migration.mjs --file <迁移.sql> [--dry]
  ```
- **直连生产库**执行 SQL：
  ```bash
  node scripts/supabase-sql.mjs "select 1"
  node scripts/supabase-sql.mjs --file <文件.sql>
  ```
- 提交前自查：
  ```bash
  git diff --cached | grep -nE 'sb_secret_|sbp_|cfut_|eyJhbGciOi|aassddff'
  ```
- `.env` 永远不进版本库（已在 `.gitignore` 中，且 `!.env.example` 例外只放占位符）。
