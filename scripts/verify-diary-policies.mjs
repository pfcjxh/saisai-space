/**
 * 验证迁移 0005 的 RLS 语义（使用 Phase 1 冒烟测试留下的两个测试账号）：
 *   1. A（作者）写日记成功；
 *   2. B（伴侣）追加 comments / liked_by 成功；
 *   3. B 篡改 content 被数据库拒绝；
 *   4. A 删除日记收尾。
 * 用法：node scripts/verify-diary-policies.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
const password = 'Saisai#Test520';

// 找到冒烟测试留下的配对账号（A 为空间 owner）
const admin = createClient(url, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: userPage } = await admin.auth.admin.listUsers();
const testUsers = (userPage?.users ?? [])
  .filter((u) => u.email?.startsWith('saisai.test.') && u.email_confirmed_at)
  .sort((a, b) => ((a.email ?? '') < (b.email ?? '') ? -1 : 1));
const emailA = testUsers[0]?.email;
const emailB = testUsers[1]?.email;
if (!emailA || !emailB) {
  console.error('FAIL  未找到测试账号，请先运行 scripts/supabase-smoke.mjs');
  process.exit(1);
}

const clientA = createClient(url, anon);
const clientB = createClient(url, anon);
const { error: errA } = await clientA.auth.signInWithPassword({ email: emailA, password });
const { error: errB } = await clientB.auth.signInWithPassword({ email: emailB, password });
if (errA || errB) {
  console.error('FAIL  测试账号登录失败:', errA?.message ?? errB?.message);
  process.exit(1);
}

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

// 先取 A 的空间
const { data: membershipA } = await clientA
  .from('couple_members')
  .select('couple_id')
  .limit(1)
  .maybeSingle();
const coupleId = membershipA?.couple_id;
if (!coupleId) {
  console.error('FAIL  A 不属于任何空间');
  process.exit(1);
}

const { data: created, error: e1 } = await clientA
  .from('diaries')
  .insert({
    couple_id: coupleId,
    author_id: (await clientA.auth.getUser()).data.user.id,
    diary_date: '2026-09-17',
    content: '策略验证日记',
    images: [],
  })
  .select()
  .single();
check('A（作者）创建日记', !e1 && !!created, e1?.message);
if (!created) process.exit(1);

// 2. B 追加评论与点赞
const comment = [
  {
    author_id: (await clientB.auth.getUser()).data.user.id,
    nickname: 'B',
    content: '伴侣评论',
    created_at: new Date().toISOString(),
  },
];
const { data: commented, error: e2 } = await clientB
  .from('diaries')
  .update({ comments: comment })
  .eq('id', created.id)
  .select()
  .single();
check('B（伴侣）追加评论', !e2 && !!commented, e2?.message);

const { data: liked, error: e3 } = await clientB
  .from('diaries')
  .update({ liked_by: [(await clientB.auth.getUser()).data.user.id] })
  .eq('id', created.id)
  .select()
  .single();
check('B（伴侣）点赞', !e3 && !!liked, e3?.message);

// 3. B 篡改正文必须被拒（策略拒绝时表现为报错，或 0 行受影响，二者皆是拦截成功）
const { data: hacked, error: e4 } = await clientB
  .from('diaries')
  .update({ content: '被篡改的正文' })
  .eq('id', created.id)
  .select();
const tamperBlocked = !!e4 || (hacked ?? []).length === 0;
check('B 篡改正文被拦截', tamperBlocked, tamperBlocked ? '' : '篡改竟然成功了');

// 4. A 删除收尾
const { error: e5 } = await clientA.from('diaries').delete().eq('id', created.id);
check('A 删除日记收尾', !e5, e5?.message);

console.log(`\n结果: ${passed} 项通过, ${failed} 项失败`);
process.exit(failed > 0 ? 1 : 0);
