/**
 * RLS 越权渗透测试（Phase 12 · 安全性审计）
 *
 * 攻击者视角全自动审计：4 个真实账号 / 2 个独立情侣空间，
 * 覆盖 6 大攻击向量、12 个具体攻击点，逐条断言数据库内核拦截状态。
 *
 * 角色：Alice（空间1·女）、Bob（空间1·男，Alice 伴侣）、
 *       Mallory（空间2·外部恶意攻击者）、Dave（空间2·Mallory 伴侣）
 *
 * 用法：node tests/rls-penetration.mjs
 * 说明：脚本自建自清（含存储对象与账号），可重复执行。
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------- 环境

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const PASSWORD = 'Rls#Audit2026';
const ts = Date.now();

const admin = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

// ---------------------------------------------------------------- 断言框架

const results = [];
let passed = 0;
let failed = 0;

function record(id, vector, name, expected, ok, detail = '') {
  results.push({ id, vector, name, expected, ok, detail });
  if (ok) passed++;
  else failed++;
}

/** 越权拒绝判定：报错（42501 等）或零行受影响，二者皆是拦截成功 */
function denied(result) {
  const { data, error } = result;
  if (error) return true;
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  return false;
}

// ---------------------------------------------------------------- 会话建立

async function makeUser(tag, nickname, gender) {
  const email = `rls.test.${tag}.${ts}@gmail.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { nickname, gender },
  });
  if (error || !data.user) throw new Error(`创建 ${tag} 失败: ${error?.message}`);
  const client = createClient(URL, ANON);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`${tag} 登录失败: ${signInError.message}`);
  return { id: data.user.id, email, client };
}

const alice = await makeUser('alice', '爱丽丝', 'female');
const bob = await makeUser('bob', '鲍勃', 'male');
const mallory = await makeUser('mallory', '马洛里', 'female');
const dave = await makeUser('dave', '戴夫', 'male');
/** Eve：未配对的外部攻击者（用于精确测试邀请码有效性/满员判定） */
const eve = await makeUser('eve', '夏娃', 'female');
const allUsers = [alice, bob, mallory, dave, eve];

// ---------------------------------------------------------------- 数据布景

// 空间 1：Alice 创建，Bob 加入
const { data: couple1 } = await alice.client.rpc('create_couple_with_membership', {
  p_relationship_started_at: '2026-08-16',
});
const { data: row1 } = await alice.client
  .from('couples')
  .select('invite_code')
  .eq('id', couple1)
  .single();
const invite1 = row1?.invite_code;
const { error: bobJoinErr } = await bob.client.rpc('join_couple_by_invite', {
  p_invite_code: invite1,
});
record(
  'C-3',
  '正向对照',
  'Bob 凭邀请码正常配对',
  '配对成功（证明 RPC 主路径可用）',
  !bobJoinErr,
  bobJoinErr?.message ?? '',
);

// 空间 2：Mallory 创建，Dave 加入
const { data: couple2 } = await mallory.client.rpc('create_couple_with_membership', {
  p_relationship_started_at: '2026-01-01',
});
const { data: row2 } = await mallory.client
  .from('couples')
  .select('invite_code')
  .eq('id', couple2)
  .single();
await dave.client.rpc('join_couple_by_invite', { p_invite_code: row2?.invite_code });

// Alice 的真实业务数据
const now = new Date().toISOString();
const { data: todo } = await alice.client
  .from('todos')
  .insert({ couple_id: couple1, title: '审计待办', created_by: alice.id })
  .select()
  .single();
const { data: anniversary } = await alice.client
  .from('anniversaries')
  .insert({
    couple_id: couple1,
    title: '审计纪念日',
    target_date: '2026-12-25',
    created_by: alice.id,
  })
  .select()
  .single();
const { data: wish } = await alice.client
  .from('wishes')
  .insert({ couple_id: couple1, title: '审计心愿', created_by: alice.id })
  .select()
  .single();
const { data: diary } = await alice.client
  .from('diaries')
  .insert({
    couple_id: couple1,
    author_id: alice.id,
    diary_date: '2026-09-17',
    content: '审计日记原文',
    images: [],
  })
  .select()
  .single();
const { data: cycle } = await alice.client
  .from('period_cycles')
  .insert({ user_id: alice.id, start_date: '2026-08-25', end_date: '2026-09-08' })
  .select()
  .single();
await alice.client.from('period_logs').insert([
  {
    user_id: alice.id,
    cycle_id: cycle?.id ?? null,
    log_date: '2026-08-26',
    visibility: 'private',
    pain_level: 3,
    notes: '私密笔记：绝密内容',
  },
]);
const { data: sharedLog } = await alice.client
  .from('period_logs')
  .insert({
    user_id: alice.id,
    cycle_id: cycle?.id ?? null,
    log_date: '2026-08-27',
    visibility: 'shared',
    pain_level: 1,
  })
  .select()
  .single();
void now;

// Alice 上传真实存储对象（供穿透测试）
const storagePath = `${couple1}/diaries/${diary?.id ?? 'x'}/audit.webp`;
const { error: uploadErr } = await alice.client.storage
  .from('couples-media')
  .upload(storagePath, new Blob([new Uint8Array([82, 73, 70, 70])], { type: 'image/webp' }), {
    contentType: 'image/webp',
  });
if (uploadErr) throw new Error(`布景上传失败: ${uploadErr.message}`);

// 正向对照：Bob 能读空间 1 待办（证明会话有效，RLS 不是无差别拒绝）
const { data: bobSeesTodo } = await bob.client.from('todos').select('id').eq('id', todo?.id);
record(
  'C-1',
  '正向对照',
  'Bob 可读自己空间的待办',
  '返回 1 行（验证会话与策略正常）',
  (bobSeesTodo ?? []).length === 1,
  JSON.stringify(bobSeesTodo),
);
const { data: bobSeesAliceProfile } = await bob.client
  .from('profiles')
  .select('id')
  .eq('id', alice.id);
record(
  'C-2',
  '正向对照',
  'Bob 可读伴侣 Alice 的公开资料',
  '返回 1 行',
  (bobSeesAliceProfile ?? []).length === 1,
);

// ================================================================
// 向量 1：跨情侣空间水平越权（Mallory 攻击空间 1）
// ================================================================

for (const table of ['todos', 'anniversaries', 'wishes', 'diaries']) {
  const { data, error } = await mallory.client
    .from(table)
    .select('*')
    .eq('couple_id', couple1);
  const leaked = (data ?? []).length;
  record(
    `1.1-${table}`,
    '跨空间水平越权',
    `Mallory 读取空间1 的 ${table}`,
    '返回空数组，零泄漏',
    !error && leaked === 0,
    error ? `err:${error.message}` : `leaked:${leaked}`,
  );
}

{
  const { error } = await mallory.client
    .from('todos')
    .insert({ couple_id: couple1, title: '垃圾待办', created_by: mallory.id })
    .select();
  record('1.2-todos', '跨空间水平越权', 'Mallory 向空间1 注入待办', 'RLS 拒绝（报错）', !!error, error?.message ?? '竟然插入成功');
}
{
  const { error } = await mallory.client
    .from('wishes')
    .insert({ couple_id: couple1, title: '垃圾心愿', created_by: mallory.id })
    .select();
  record('1.2-wishes', '跨空间水平越权', 'Mallory 向空间1 注入心愿', 'RLS 拒绝（报错）', !!error, error?.message ?? '竟然插入成功');
}
{
  const upd = await mallory.client
    .from('anniversaries')
    .update({ title: '被篡改' })
    .eq('id', anniversary?.id)
    .select();
  record('1.3-update', '跨空间水平越权', 'Mallory 篡改空间1 纪念日', '0 行受影响', denied(upd), upd.error?.message ?? '');
}
{
  const del = await mallory.client
    .from('diaries')
    .delete()
    .eq('id', diary?.id)
    .select();
  record('1.3-delete', '跨空间水平越权', 'Mallory 删除空间1 日记', '0 行受影响', denied(del), del.error?.message ?? '');
}

// ================================================================
// 向量 2：生理期隐私垂直穿透（Bob 窥探 Alice）
// ================================================================

{
  const { data, error } = await bob.client
    .from('period_logs')
    .select('id, visibility, notes, pain_level')
    .eq('user_id', alice.id);
  const rows = data ?? [];
  const privateLeaked = rows.filter((r) => r.visibility === 'private').length;
  record(
    '2.1-private',
    '生理期隐私穿透',
    'Bob 查询 Alice 全部打卡（含 private）',
    '仅返回 shared，private 在库内核截断',
    !error && privateLeaked === 0 && rows.length === 1,
    error ? `err:${error.message}` : `rows:${rows.length} privateLeaked:${privateLeaked}`,
  );
}
{
  const upd = await bob.client
    .from('period_logs')
    .update({ pain_level: 5 })
    .eq('id', sharedLog?.id)
    .select();
  record('2.2-update', '生理期隐私穿透', 'Bob 篡改 Alice 的经期打卡', '0 行受影响', denied(upd), upd.error?.message ?? '');
}
{
  const del = await bob.client
    .from('period_cycles')
    .delete()
    .eq('id', cycle?.id)
    .select();
  record('2.2-delete', '生理期隐私穿透', 'Bob 删除 Alice 的周期记录', '0 行受影响', denied(del), del.error?.message ?? '');
}
{
  // 伴侣可读基础周期统计（权限矩阵：只读）——正向对照
  const { data } = await bob.client.from('period_cycles').select('id').eq('user_id', alice.id);
  record('2.3-对照', '生理期隐私穿透', 'Bob 可读基础周期统计（只读）', '返回 1 行', (data ?? []).length === 1);
}

// ================================================================
// 向量 3：日记防篡改与追加边界（Bob 攻击 Alice 日记）
// ================================================================

{
  const upd = await bob.client
    .from('diaries')
    .update({ content: '被伴侣篡改的正文' })
    .eq('id', diary?.id)
    .select();
  record('3.1-content', '日记防篡改', 'Bob 篡改日记正文', 'RLS 拒绝', denied(upd), upd.error?.message ?? '');
}
{
  const upd = await bob.client
    .from('diaries')
    .update({ diary_date: '2020-01-01' })
    .eq('id', diary?.id)
    .select();
  record('3.1-date', '日记防篡改', 'Bob 篡改日记日期', 'RLS 拒绝', denied(upd), upd.error?.message ?? '');
}
{
  const upd = await bob.client
    .from('diaries')
    .update({
      comments: [
        { author_id: bob.id, nickname: '鲍勃', content: '审计评论', created_at: new Date().toISOString() },
      ],
      liked_by: [bob.id],
    })
    .eq('id', diary?.id)
    .select()
    .single();
  record(
    '3.2-append',
    '日记防篡改',
    'Bob 正常追加评论与点赞',
    '允许执行（伴侣追加策略）',
    !upd.error && !!upd.data,
    upd.error?.message ?? '',
  );
}
{
  // 追加后校验正文冻结
  const { data } = await alice.client
    .from('diaries')
    .select('content, diary_date, author_id, title')
    .eq('id', diary?.id)
    .single();
  record(
    '3.3-freeze',
    '日记防篡改',
    '追加互动后正文/日期/作者保持冻结',
    'content=审计日记原文 且 author=Alice',
    data?.content === '审计日记原文' && data?.author_id === alice.id,
    JSON.stringify(data),
  );
}

// ================================================================
// 向量 4：身份仿冒（Profile 与 author_id 伪造）
// ================================================================

{
  const upd = await bob.client
    .from('profiles')
    .update({ nickname: '冒充爱丽丝', timezone: 'UTC' })
    .eq('id', alice.id)
    .select();
  record('4.1', '身份仿冒', 'Bob 篡改 Alice 的昵称/时区', '0 行受影响', denied(upd), upd.error?.message ?? '');
  const { data: check } = await alice.client.from('profiles').select('nickname, timezone').eq('id', alice.id).single();
  record(
    '4.1b-复核',
    '身份仿冒',
    'Alice 资料未被改动',
    '昵称=爱丽丝',
    check?.nickname === '爱丽丝',
    JSON.stringify(check),
  );
}
{
  const ins = await mallory.client
    .from('diaries')
    .insert({
      couple_id: couple1,
      author_id: alice.id,
      diary_date: '2026-09-17',
      content: '伪造 Alice 名义的日记',
      images: [],
    })
    .select();
  record('4.2-cross', '身份仿冒', 'Mallory 伪造 author_id=Alice 写入空间1', 'RLS 拒绝', !!ins.error, ins.error?.message ?? '');
}
{
  const ins = await mallory.client
    .from('diaries')
    .insert({
      couple_id: couple2,
      author_id: alice.id,
      diary_date: '2026-09-17',
      content: '在自己空间伪造 Alice 署名',
      images: [],
    })
    .select();
  record('4.2-self', '身份仿冒', 'Mallory 在自己空间伪造 author_id=Alice', 'RLS 拒绝（author 必须本人）', !!ins.error, ins.error?.message ?? '');
}

// ================================================================
// 向量 5：存储桶私有文件穿透（Mallory 攻击空间1 媒体）
// ================================================================

{
  const up = await mallory.client.storage
    .from('couples-media')
    .upload(`${couple1}/diaries/${diary?.id ?? 'x'}/evil.webp`, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }), {
      contentType: 'image/webp',
    });
  record('5.1-upload', '存储桶穿透', 'Mallory 向空间1 路径上传文件', 'Storage RLS 拒绝', !!up.error, up.error?.message ?? '竟然上传成功');
}
{
  const signed = await mallory.client.storage
    .from('couples-media')
    .createSignedUrls([storagePath], 300);
  const urls = signed.data ?? [];
  const gotUrl = urls.filter((u) => !!u.signedUrl).length;
  record(
    '5.1-sign',
    '存储桶穿透',
    'Mallory 申请空间1 文件签名 URL',
    '无签名 URL 下发',
    gotUrl === 0,
    signed.error?.message ?? `urls:${gotUrl}`,
  );
}
{
  const del = await mallory.client.storage.from('couples-media').remove([storagePath]);
  const removedCount = (del.data ?? []).length;
  record('5.1-delete', '存储桶穿透', 'Mallory 删除空间1 文件', '0 个对象被删', removedCount === 0, del.error?.message ?? `removed:${removedCount}`);
}
{
  // 正向对照：Alice 自己能签名
  const signed = await alice.client.storage.from('couples-media').createSignedUrls([storagePath], 300);
  const gotUrl = (signed.data ?? []).filter((u) => !!u.signedUrl).length;
  record('5.2-对照', '存储桶穿透', 'Alice 可签名自己的文件', '下发 1 个签名 URL', gotUrl === 1);
}

// ================================================================
// 向量 6：RPC 空间绑定与配对并发
// ================================================================

{
  const { error } = await alice.client.rpc('create_couple_with_membership', {
    p_relationship_started_at: '2026-01-01',
  });
  record(
    '6.1',
    'RPC 空间绑定',
    '已在空间中的 Alice 再次创建空间',
    '抛错 already_in_couple',
    !!error && /already_in_couple/.test(error.message),
    error?.message ?? '竟然创建成功',
  );
}
{
  const { error } = await mallory.client.rpc('join_couple_by_invite', { p_invite_code: invite1 });
  record(
    '6.2',
    'RPC 空间绑定',
    '已配对用户 Mallory 使用他人邀请码',
    '抛错 already_in_couple（守卫优先，不泄露邀请码有效性）',
    !!error && /already_in_couple/.test(error.message),
    error?.message ?? '竟然加入成功',
  );
}
{
  // Eve 未配对：使用满员空间（Alice+Bob 共 2 人）的合法邀请码 → 满员拦截
  const { error } = await eve.client.rpc('join_couple_by_invite', { p_invite_code: invite1 });
  record(
    '6.3',
    'RPC 空间绑定',
    '未配对 Eve 用满员空间邀请码潜入',
    '抛错 couple_is_full（上限 2 人硬约束）',
    !!error && /couple_is_full/.test(error.message),
    error?.message ?? '竟然加入成功',
  );
}
{
  const { error } = await eve.client.rpc('join_couple_by_invite', { p_invite_code: 'ZZZZZZ' });
  record(
    '6.4',
    'RPC 空间绑定',
    '未配对 Eve 用不存在的邀请码',
    '抛错 invalid_invite_code',
    !!error && /invalid_invite_code/.test(error.message),
    error?.message ?? '竟然加入成功',
  );
}

// ---------------------------------------------------------------- 报告

console.log('\n=================== RLS 渗透审计报告 ===================\n');
const pad = (s, n) => String(s).padEnd(n, ' ');
console.log(
  pad('编号', 12) + pad('攻击向量', 18) + pad('测试项 / 预期防御', 46) + '判定',
);
console.log('-'.repeat(92));
for (const r of results) {
  console.log(
    pad(r.id, 12) +
      pad(r.vector, 18) +
      pad(`${r.name} → ${r.expected}`, 46) +
      (r.ok ? 'PASS' : `FAIL${r.detail ? ` (${r.detail})` : ''}`),
  );
}
console.log('-'.repeat(92));
console.log(`合计: ${passed} 项通过, ${failed} 项失败\n`);

// ---------------------------------------------------------------- 清理

await alice.client.storage.from('couples-media').remove([storagePath]);
await admin.from('couples').delete().in('id', [couple1, couple2]);
let cleanupOk = true;
for (const u of allUsers) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) cleanupOk = false;
}
console.log(cleanupOk ? '测试数据已清理（存储对象 + 双空间 + 4 账号）' : '⚠️ 部分测试数据清理失败，请手动检查');

process.exit(failed > 0 ? 1 : 0);