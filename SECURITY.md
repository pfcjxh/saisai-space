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

### 待你手动执行（**必做**）
> 旧密钥（`aassddff…rtyy`，完整值见泄露时的版本历史）已视为泄露，**必须作废**。

```bash
# 1) 应用轮换迁移（会打印新密钥的 SHA-256 指纹）
supabase db push

# 2) 取回新密钥明文
#    Dashboard -> SQL Editor:
#    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret';

# 3) 同步到 Edge Function，否则推送会 401
supabase secrets set PUSH_WEBHOOK_SECRET="<上一步取回的值>"

# 4) 重新部署两个函数
supabase functions deploy send-push --no-verify-jwt
supabase functions deploy daily-check-push --no-verify-jwt

# 5) 验证链路（会写一篇测试日记并读取 pg_net 响应）
node scripts/verify-push-chain.mjs
```

**同时建议轮换**（这三项曾以明文存在于工作区 `.env`，且目录无 git 历史保护）：

- Supabase Dashboard → Project Settings → API → **Roll `service_role` / secret key**
- Supabase Account → Access Tokens → **吊销并重建** `sbp_...`
- Cloudflare → My Profile → API Tokens → **Roll** `cfut_...`

## 三、日常约定

- 新增需要机密的迁移时，一律走 Vault：`vault.create_secret()` + `SECURITY DEFINER` 读取函数 + `REVOKE FROM anon, authenticated`。
- 提交前自查：
  ```bash
  git diff --cached | grep -nE 'sb_secret_|sbp_|cfut_|eyJhbGciOi|aassddff'
  ```
- `.env` 永远不进版本库（已在 `.gitignore` 中，且 `!.env.example` 例外只放占位符）。
