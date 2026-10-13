/**
 * 验证数据库侧推送链路：
 * 测试账号 A 写一篇日记 → 触发器 net.http_post → send-push →
 * 从 pg_net 响应表读取真实 HTTP 结果；并核对 cron 任务已落库。
 * 用法：node scripts/verify-push-chain.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const PROJECT_REF = 'whxivdsckeiqraivrodt';
const password = 'Saisai#Test520';

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

// ---------------------------------------------------------------- cron 任务
const jobs = await sql(
  `SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'daily-check-push';`,
);
console.log('cron 任务:', JSON.stringify(jobs));

// ---------------------------------------------------------------- 触发链路
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const { data: userPage } = await admin.auth.admin.listUsers();
const users = (userPage?.users ?? []).filter((u) => u.email_confirmed_at);
const testUser = users
  .filter((u) => u.email?.startsWith('saisai.test.a.'))
  .sort((a, b) => ((a.email ?? '') > (b.email ?? '') ? -1 : 1))[0];
if (!testUser?.email) {
  console.error('FAIL 未找到测试账号 A');
  process.exit(1);
}

const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
await client.auth.signInWithPassword({ email: testUser.email, password });
const { data: membership } = await client
  .from('couple_members')
  .select('couple_id')
  .limit(1)
  .maybeSingle();

const { data: diary, error } = await client
  .from('diaries')
  .insert({
    couple_id: membership?.couple_id,
    author_id: testUser.id,
    diary_date: '2026-09-17',
    content: '推送链路验证（可删除）',
    images: [],
  })
  .select()
  .single();
console.log('日记写入:', error ? `FAIL ${error.message}` : `PASS id=${diary.id}`);

// 等 pg_net 异步投递完成
await new Promise((r) => setTimeout(r, 6000));

const responses = await sql(`
  SELECT status_code, LEFT(content, 120) AS content, created
  FROM net._http_response ORDER BY created DESC LIMIT 3;
`);
console.log('pg_net 最近响应:', JSON.stringify(responses, null, 1));

// 收尾删除测试日记
if (diary) {
  await client.from('diaries').delete().eq('id', diary.id);
  console.log('测试日记已删除');
}