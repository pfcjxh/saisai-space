/**
 * Supabase 全链路冒烟测试（开发期一次性工具）
 *
 * 链路：管理员建号 A/B（email_confirm 预确认）-> 自动建档 -> A 建空间 ->
 *       B 凭邀请码配对 -> 共享数据互写 -> RLS 越权/隐私拦截验证。
 *
 * 用法：node scripts/supabase-smoke.mjs
 * 依赖：.env 中需含 SUPABASE_SECRET_KEY（仅本机使用，绝不进入前端包）。
 * 注意：会创建两个测试账号（随机邮箱），测试后可到 Dashboard
 *       Authentication -> Users 手动删除。
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------- 读取 .env

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) {
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const secretKey = env.SUPABASE_SECRET_KEY;
if (!url || !anonKey || !secretKey) {
  console.error('FAIL  .env 缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SECRET_KEY');
  process.exitCode = 1;
  throw new Error('missing env');
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

const ts = Date.now();
const emailA = `saisai.test.a.${ts}@gmail.com`;
const emailB = `saisai.test.b.${ts}@gmail.com`;
const password = 'Saisai#Test520';

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const clientA = createClient(url, anonKey);
const clientB = createClient(url, anonKey);

// ---------------------------------------------------------------- 1. 建号 + 登录

const { data: createdA, error: createErrorA } = await admin.auth.admin.createUser({
  email: emailA,
  password,
  email_confirm: true,
});
check('管理员创建用户 A（预确认）', !createErrorA && !!createdA.user, createErrorA?.message);

const { data: createdB, error: createErrorB } = await admin.auth.admin.createUser({
  email: emailB,
  password,
  email_confirm: true,
});
check('管理员创建用户 B（预确认）', !createErrorB && !!createdB.user, createErrorB?.message);

const { data: signInA, error: signInErrorA } = await clientA.auth.signInWithPassword({
  email: emailA,
  password,
});
check('用户 A 登录获得会话', !signInErrorA && !!signInA.session, signInErrorA?.message);

const { error: signInErrorB } = await clientB.auth.signInWithPassword({
  email: emailB,
  password,
});
check('用户 B 登录获得会话', !signInErrorB, signInErrorB?.message);

const userA = createdA.user.id;
const userB = createdB.user.id;

// ---------------------------------------------------------------- 2. 自动建档（handle_new_user 触发器）

await new Promise((r) => setTimeout(r, 800)); // 等触发器落库

const { data: profileA, error: profileErrorA } = await clientA
  .from('profiles')
  .select('*')
  .eq('id', userA)
  .maybeSingle();
check('触发器自动建档（A 的 profiles 行）', !profileErrorA && !!profileA, profileErrorA?.message);

// ---------------------------------------------------------------- 3. A 创建空间

const { data: coupleId, error: createError } = await clientA.rpc(
  'create_couple_with_membership',
  { p_relationship_started_at: '2024-05-20' },
);
check('A 创建空间（create_couple_with_membership）', !createError && !!coupleId, createError?.message);

const { data: coupleRow, error: coupleReadError } = await clientA
  .from('couples')
  .select('invite_code')
  .eq('id', coupleId)
  .single();
check('A 读回空间与邀请码', !coupleReadError && !!coupleRow?.invite_code, coupleReadError?.message);
const inviteCode = coupleRow?.invite_code;
console.log(`      邀请码: ${inviteCode}`);

// ---------------------------------------------------------------- 4. B 配对

// 配对前：B 不能读空间（RLS 拦截）
const { data: beforeJoin, error: beforeJoinError } = await clientB
  .from('couples')
  .select('id')
  .eq('id', coupleId);
check(
  '配对前 B 读空间被 RLS 拦截（返回空）',
  !beforeJoinError && (beforeJoin ?? []).length === 0,
);

const { data: joinedId, error: joinError } = await clientB.rpc('join_couple_by_invite', {
  p_invite_code: inviteCode,
});
check('B 凭邀请码加入（join_couple_by_invite）', !joinError && joinedId === coupleId, joinError?.message);

// 配对后：B 可读空间与 A 的公开资料
const { data: afterJoin } = await clientB.from('couples').select('id').eq('id', coupleId);
check('配对后 B 可读空间', (afterJoin ?? []).length === 1);

const { data: partnerProfile } = await clientB
  .from('profiles')
  .select('id, nickname')
  .eq('id', userA);
check('配对后 B 可读 A 的公开资料', (partnerProfile ?? []).length === 1);

// B 不可改 A 的资料（RLS：仅本人可写）
const { data: hacked } = await clientB
  .from('profiles')
  .update({ nickname: '被篡改' })
  .eq('id', userA)
  .select();
check('B 篡改 A 的资料被拦截（0 行受影响）', (hacked ?? []).length === 0);

// ---------------------------------------------------------------- 5. 共享数据互写

const { data: todo, error: todoError } = await clientA
  .from('todos')
  .insert({ couple_id: coupleId, title: '联调测试待办', created_by: userA })
  .select()
  .single();
check('A 创建待办', !todoError && !!todo, todoError?.message);

const { data: todoAfterToggle, error: toggleError } = await clientB
  .from('todos')
  .update({ is_completed: true })
  .eq('id', todo.id)
  .select();
check('B 完成 A 的待办（空间成员互写）', !toggleError && (todoAfterToggle ?? []).length === 1, toggleError?.message);

// ---------------------------------------------------------------- 6. 生理期隐私分级

const { data: cycleRow, error: cycleError } = await clientA
  .from('period_cycles')
  .insert({ user_id: userA, start_date: '2026-09-10' })
  .select()
  .single();
check('A 记录周期', !cycleError && !!cycleRow, cycleError?.message);

await clientA.from('period_logs').insert([
  { user_id: userA, cycle_id: cycleRow.id, log_date: '2026-09-10', visibility: 'private', notes: '私密笔记' },
  { user_id: userA, cycle_id: cycleRow.id, log_date: '2026-09-11', visibility: 'shared', mood: 'calm' },
]);

const { data: logsSeenByB } = await clientB.from('period_logs').select('*').eq('user_id', userA);
check(
  'B 仅可见 shared 记录（private 被底层拦截）',
  (logsSeenByB ?? []).length === 1 && logsSeenByB[0].visibility === 'shared',
);

const { data: cyclesSeenByB } = await clientB.from('period_cycles').select('id').eq('user_id', userA);
check('B 可读 A 的基础周期统计（权限矩阵：只读）', (cyclesSeenByB ?? []).length === 1);

const { data: cycleHacked, error: cycleHackError } = await clientB
  .from('period_cycles')
  .update({ cycle_length_days: 99 })
  .eq('id', cycleRow.id)
  .select();
check(
  'B 篡改 A 的周期被拦截（0 行受影响）',
  !cycleHackError && (cycleHacked ?? []).length === 0,
);

// ---------------------------------------------------------------- 汇总

console.log(`\n结果: ${passed} 项通过, ${failed} 项失败`);
console.log(`测试账号: ${emailA} / ${emailB}（可至 Authentication -> Users 删除）`);
process.exitCode = failed > 0 ? 1 : 0;
