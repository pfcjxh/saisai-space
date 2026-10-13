/**
 * 同步推送共享密钥：Vault（数据库侧）→ Edge Function Secrets
 *
 * 背景：推送链路由两半组成，两边的密钥必须一致，否则 Edge Function 返回 401：
 *   · 数据库侧：pg_net 调 Edge Function 时带 `x-webhook-secret` 头，
 *               密钥来源为 vault.secrets['push_webhook_secret']；
 *   · 函数侧  ：PUSH_WEBHOOK_SECRET 环境变量（verifyWebhookSecret 比对）。
 * 轮换时若只改一边，推送立即 401。本脚本负责把两边的值对齐。
 *
 * 用法：
 *   node scripts/sync-push-secret.mjs            # 同步（Vault -> Edge）
 *   node scripts/sync-push-secret.mjs --check    # 只校验两边是否一致（不写）
 *   node scripts/sync-push-secret.mjs --rotate   # 轮换：生成新值写入两边
 *
 * 安全：全程不打印密钥明文，只输出 SHA-256 前缀指纹以便比对。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sql } from './sql-client.mjs';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const rotate = args.includes('--rotate');

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = env.SUPABASE_PROJECT_REF ?? new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];

/** 只输出指纹，不回显明文 */
const fingerprint = (v) => createHash('sha256').update(String(v)).digest('hex').slice(0, 16);

async function readVaultSecret() {
  const r = await sql(
    `select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret'`,
  );
  if (!r.ok) throw new Error('读取 Vault 失败: ' + JSON.stringify(r.data).slice(0, 200));
  return r.data?.[0]?.decrypted_secret ?? null;
}

async function writeVaultSecret(value) {
  // 用 vault.update_secret / create_secret，避免明文出现在 SQL 日志里
  const r = await sql(`
    DO $$
    DECLARE v_id uuid;
    BEGIN
      SELECT id INTO v_id FROM vault.secrets WHERE name = 'push_webhook_secret';
      IF v_id IS NULL THEN
        PERFORM vault.create_secret(${quote(value)}, 'push_webhook_secret', '推送调度共享密钥');
      ELSE
        PERFORM vault.update_secret(v_id, ${quote(value)});
      END IF;
    END $$;
  `);
  if (!r.ok) throw new Error('写入 Vault 失败: ' + JSON.stringify(r.data).slice(0, 200));
}

/** 单引号转义，防止 SQL 注入（值由本脚本生成或来自 Vault） */
function quote(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function readEdgeSecret() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`读取 Edge Secrets 失败: HTTP ${res.status}`);
  const list = await res.json();
  return list.find((s) => s.name === 'PUSH_WEBHOOK_SECRET')?.value ?? null;
}

async function writeEdgeSecret(value) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ name: 'PUSH_WEBHOOK_SECRET', value }]),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`写入 Edge Secrets 失败: HTTP ${res.status} ${t.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------- 主流程

console.log(`\n=== 推送密钥同步 ${checkOnly ? '(校验模式)' : rotate ? '(轮换模式)' : '(同步模式)'} ===\n`);

const vaultBefore = await readVaultSecret();
const edgeBefore = await readEdgeSecret();

console.log(`Vault  侧: ${vaultBefore ? fingerprint(vaultBefore) : '(不存在)'}  长度 ${vaultBefore?.length ?? 0}`);
console.log(`Edge   侧: ${edgeBefore ? fingerprint(edgeBefore) : '(不存在)'}  长度 ${edgeBefore?.length ?? 0}`);
console.log(`是否一致  : ${vaultBefore && edgeBefore && vaultBefore === edgeBefore ? '✅ 一致' : '❌ 不一致'}\n`);

if (checkOnly) {
  process.exit(vaultBefore === edgeBefore ? 0 : 1);
}

let target;
if (rotate) {
  const { randomBytes } = await import('node:crypto');
  target = randomBytes(32).toString('hex');
  console.log(`已生成新密钥（指纹 ${fingerprint(target)}，32 字节随机）\n`);
  console.log('--- 1/2 写入数据库 Vault ---');
  await writeVaultSecret(target);
  console.log('  ✅ Vault 已更新');
} else {
  if (!vaultBefore) {
    console.error('Vault 中没有密钥，请先应用迁移 20260916000500 或使用 --rotate');
    process.exit(1);
  }
  target = vaultBefore;
}

console.log(`--- ${rotate ? '2/2' : '1/1'} 写入 Edge Function Secrets ---`);
await writeEdgeSecret(target);
console.log('  ✅ Edge Secrets 已更新');

// ---------------------------------------------------------------- 复核

console.log('\n--- 复核 ---');
const vaultAfter = await readVaultSecret();
const edgeAfter = await readEdgeSecret();
console.log(`Vault: ${fingerprint(vaultAfter)}`);
console.log(`Edge : ${fingerprint(edgeAfter)}`);

if (vaultAfter === edgeAfter) {
  console.log('\n✅ 两侧指纹一致\n');
  console.log('⚠️ 注意：Edge Function 需要重启才能加载新环境变量。');
  console.log('   如验证仍为 401，请重启函数（Dashboard -> Edge Functions -> 重新部署，');
  console.log('   或调用 Management API 的 functions 更新接口）。');
  process.exit(0);
} else {
  console.error('\n❌ 两侧仍不一致，请检查\n');
  process.exit(1);
}
