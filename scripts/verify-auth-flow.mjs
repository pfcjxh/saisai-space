/**
 * 全流程验证：注册建档（昵称/性别触发器）→ 创建空间 → 邀请码配对 → 双端上下文。
 * 模拟 AuthView 的真实调用链路（admin 预确认邮箱以绕过邮件点击）。
 * 用法：node scripts/verify-auth-flow.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
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

const password = 'Saisai#Flow2026';
const ts = Date.now();
const emailC = `saisai.flow.c.${ts}@gmail.com`;
const emailD = `saisai.flow.d.${ts}@gmail.com`;

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const clientC = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const clientD = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// ---------------------------------------------------------------- 1. 注册建档
const { data: created, error: createError } = await admin.auth.admin.createUser({
  email: emailC,
  password,
  email_confirm: true,
  user_metadata: { nickname: '阿泽', gender: 'male' },
});
check('用户 C 注册（metadata 携带昵称与性别）', !createError && !!created.user, createError?.message);

await new Promise((r) => setTimeout(r, 800));

const { data: profileC } = await createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  .auth.signInWithPassword({ email: emailC, password })
  .then(async ({ data }) => {
    if (!data.session) return { data: null };
    return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    })
      .from('profiles')
      .select('nickname, gender')
      .eq('id', created.user.id)
      .maybeSingle();
  });
check(
  '触发器建档：昵称与性别正确落库',
  profileC?.nickname === '阿泽' && profileC?.gender === 'male',
  JSON.stringify(profileC),
);

// ---------------------------------------------------------------- 2. 登录（AuthView 路径）
const { error: signInC } = await clientC.auth.signInWithPassword({ email: emailC, password });
check('用户 C 登录获得会话', !signInC, signInC?.message);

// ---------------------------------------------------------------- 3. 创建空间
const { data: coupleId, error: coupleError } = await clientC.rpc(
  'create_couple_with_membership',
  { p_relationship_started_at: '2026-08-16' },
);
check('C 创建空间', !coupleError && !!coupleId, coupleError?.message);

const { data: coupleRow } = await clientC
  .from('couples')
  .select('invite_code')
  .eq('id', coupleId)
  .single();
const inviteCode = coupleRow?.invite_code;
check('读回邀请码', !!inviteCode, '');
console.log(`      邀请码: ${inviteCode}`);

// ---------------------------------------------------------------- 4. D 注册并配对
const { data: createdD, error: createErrorD } = await admin.auth.admin.createUser({
  email: emailD,
  password,
  email_confirm: true,
  user_metadata: { nickname: '小满', gender: 'female' },
});
check('用户 D 注册', !createErrorD && !!createdD.user, createErrorD?.message);

const { error: signInD } = await clientD.auth.signInWithPassword({ email: emailD, password });
check('用户 D 登录', !signInD, signInD?.message);

const { data: joinedId, error: joinError } = await clientD.rpc('join_couple_by_invite', {
  p_invite_code: inviteCode,
});
check('D 凭邀请码配对成功', !joinError && joinedId === coupleId, joinError?.message);

// ---------------------------------------------------------------- 5. 双端上下文（AuthView afterAuth 路径）
const { data: ctxC } = await clientC
  .from('couple_members')
  .select('couple_id, member_role')
  .eq('user_id', created.user.id)
  .maybeSingle();
const { data: partnerRow } = await clientC
  .from('profiles')
  .select('nickname, gender')
  .eq('id', createdD.user.id)
  .maybeSingle();
check(
  'C 端应看到伴侣（小满 / female）',
  ctxC?.member_role === 'owner' && partnerRow?.nickname === '小满',
  JSON.stringify({ role: ctxC?.member_role, partner: partnerRow }),
);

const { data: ctxD } = await clientD
  .from('couple_members')
  .select('member_role')
  .eq('user_id', createdD.user.id)
  .maybeSingle();
check('D 端角色为 partner', ctxD?.member_role === 'partner', JSON.stringify(ctxD));

// ---------------------------------------------------------------- 收尾清理
const { error: cleanupCouple } = await admin.from('couples').delete().eq('id', coupleId);
const { error: delC } = await admin.auth.admin.deleteUser(created.user.id);
const { error: delD } = await admin.auth.admin.deleteUser(createdD.user.id);
check('测试数据清理（空间 + 两个账号）', !cleanupCouple && !delC && !delD, cleanupCouple?.message ?? delC?.message ?? delD?.message);

console.log(`\n结果: ${passed} 项通过, ${failed} 项失败`);
process.exit(failed > 0 ? 1 : 0);