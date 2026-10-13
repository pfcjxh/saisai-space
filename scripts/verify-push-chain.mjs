/**
 * 推送链路端到端验证
 *
 * 在数据库侧用 pg_net 分别以「Vault 新密钥 / 已泄漏的旧密钥 / 随机错误密钥」
 * 调用 Edge Function，并读取 net._http_response 的真实状态码：
 *   · Vault 新密钥 -> 期望 200（链路通）
 *   · 旧泄漏密钥   -> 期望 401（已作废，这是本次整改的核心目标）
 *   · 随机错误密钥 -> 期望 401（防伪造）
 *
 * 为什么必须用真实调用验证：Supabase Management API 的 secrets 接口返回的
 * value 字段是**不透明表示**（并非明文），无法用它比对密钥是否生效 ——
 * 实测写入后读回值不同，故唯一可信的判定方式是让真实链路调用一次。
 *
 * 与旧版的区别：旧版依赖公网访问 *.supabase.co 并需要历史测试账号，
 * 在本机网络下不可用；本版全程只走管理 API 的 SQL 通道。
 *
 * 用法：node scripts/verify-push-chain.mjs
 */
import { readFileSync } from 'node:fs';
import { sql } from './sql-client.mjs';

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const REF = env.SUPABASE_PROJECT_REF ?? new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const BASE = `https://${REF}.supabase.co`;
/** 初版迁移里明文写死、现已作废的密钥（用于验证它确实失效） */
const LEAKED = 'aassddffgghhjjkkllqqwweerrttyy';

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

let passed = 0;
let failed = 0;
function record(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n================ 推送链路端到端验证 ================\n');

// ---------------------------------------------------------------- 前置

console.log('--- 环境解析 ---');
{
  const r = await sql(`select public.push_functions_base_url() as base`);
  const resolved = r.data?.[0]?.base;
  record('0.1 端点基址解析正确', resolved === BASE, `解析为 ${resolved}`);
}
{
  const r = await sql(
    `select decrypted_secret as s from vault.decrypted_secrets where name = 'push_webhook_secret'`,
  );
  const s = r.data?.[0]?.s;
  record('0.2 Vault 中存在推送密钥', typeof s === 'string' && s.length >= 32, `长度 ${s?.length}`);
  // 旧密钥绝不应仍存在于 Vault
  record('0.3 Vault 中的密钥已非泄漏值', s !== LEAKED);
}

// ---------------------------------------------------------------- 功能调用

/** 以指定密钥调用函数，返回 pg_net 记录的真实状态码 */
async function callWith(secret) {
  const before = await sql(`select coalesce(max(id), 0)::bigint as max_id from net._http_response`);
  const maxId = Number(before.data?.[0]?.max_id ?? 0);

  await sql(`
    select net.http_post(
      url := ${lit(`${BASE}/functions/v1/daily-check-push`)},
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', ${lit(secret)}
      ),
      body := '{}'::jsonb
    ) as rid
  `);

  // 轮询等待异步投递完成（pg_net 是异步的，最多等 25s）
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await sql(
      `select status_code, left(content, 60) as content
         from net._http_response where id > ${maxId} order by id desc limit 1`,
    );
    const row = res.data?.[0];
    if (row) return { status: row.status_code, content: row.content ?? '' };
  }
  return { status: null, content: '(超时未收到响应)' };
}

console.log('\n--- 真实调用（每次等待 pg_net 投递完成）---');

const secretRow = await sql(
  `select decrypted_secret as s from vault.decrypted_secrets where name = 'push_webhook_secret'`,
);
const vaultSecret = secretRow.data?.[0]?.s;

const withNew = await callWith(vaultSecret);
console.log(`  Vault 新密钥 -> HTTP ${withNew.status}  ${withNew.content}`);
record('1.1 Vault 新密钥可正常调用（链路通）', withNew.status === 200, `HTTP ${withNew.status}`);

const withOld = await callWith(LEAKED);
console.log(`  旧泄漏密钥   -> HTTP ${withOld.status}  ${withOld.content}`);
record('1.2 已泄漏的旧密钥被拒绝（已作废）', withOld.status === 401, `HTTP ${withOld.status}`);

const withBad = await callWith('totally-wrong-secret-12345');
console.log(`  随机错误密钥 -> HTTP ${withBad.status}  ${withBad.content}`);
record('1.3 随机错误密钥被拒绝', withBad.status === 401, `HTTP ${withBad.status}`);

// ---------------------------------------------------------------- 数据库侧去硬编码

console.log('\n--- 数据库侧去硬编码复核 ---');
{
  const r = await sql(`
    select
      position('aassddff' in prosrc) = 0 as no_leak,
      prosrc like '%push_webhook_secret()%' as uses_vault
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and proname = 'notify_diary_push'
  `);
  record('2.1 notify_diary_push 无密钥字面量', r.data?.[0]?.no_leak === true);
  record('2.2 notify_diary_push 从 Vault 读取', r.data?.[0]?.uses_vault === true);
}
{
  const r = await sql(`
    select
      position('aassddff' in command) = 0 as no_leak,
      command like '%push_webhook_secret()%' as uses_vault
    from cron.job where jobname = 'daily-check-push'
  `);
  record('2.3 cron 任务无密钥字面量', r.data?.[0]?.no_leak === true);
  record('2.4 cron 任务从 Vault 读取', r.data?.[0]?.uses_vault === true);
}
{
  const r = await sql(`
    select count(*)::int as n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc ~ 'aassddff'
  `);
  const n = r.data?.[0]?.n ?? -1;
  record('2.5 全库函数源码无泄漏密钥', n === 0, `命中 ${n} 个函数`);
}

// ---------------------------------------------------------------- 权限收敛

console.log('\n--- 权限收敛 ---');
{
  const r = await sql(`
    select
      has_function_privilege('anon', 'public.push_webhook_secret()', 'EXECUTE') as anon_can,
      has_function_privilege('authenticated', 'public.push_webhook_secret()', 'EXECUTE') as auth_can
  `);
  record('2.6 anon 无权调用密钥读取函数', r.data?.[0]?.anon_can === false);
  record('2.7 authenticated 无权调用密钥读取函数', r.data?.[0]?.auth_can === false);
}

// ---------------------------------------------------------------- 汇总

console.log(`\n================ 结果: ${passed} 项通过, ${failed} 项失败 ================\n`);
process.exit(failed > 0 ? 1 : 0);
