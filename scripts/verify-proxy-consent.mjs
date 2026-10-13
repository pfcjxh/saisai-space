/**
 * 代录授权开关验证（迁移 0012）
 *
 * 核心断言：开关不是装饰品 —— 关掉后伴侣必须**立即**失去写权限。
 *   1. 开关为 ON 时，伴侣可代录
 *   2. 开关置为 OFF 后，伴侣写入被 RLS 拒绝
 *   3. 重新打开后又恢复可写
 *   4. 无论开关状态，伴侣都看不到她标记 private 且非自己录入的记录
 *   5. 非成员始终无法写入（开关对陌生人无效）
 *
 * 全程在单条 SQL 内切身份（每次 API 调用是独立连接，set local 不跨语句）。
 * 测试结束会把开关恢复为原值。
 *
 * 用法：node scripts/verify-proxy-consent.mjs
 */
import { sql } from './sql-client.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function record(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`PASS  ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function q(query) {
  const r = await sql(query);
  if (!r.ok) throw new Error('SQL 失败: ' + JSON.stringify(r.data).slice(0, 300));
  return r.data ?? [];
}

/** 尝试写入；被 RLS 拒绝（抛错）返回 false，成功返回 true */
async function canWrite(actorId, ownerId) {
  const r = await sql(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${actorId}';
    insert into public.period_cycles (user_id, start_date, end_date)
    values ('${ownerId}', '2026-05-01', '2026-05-05');
    select true as ok;
  `);
  return r.ok;
}

async function setToggle(coupleId, value) {
  await q(`update public.couple_settings set allow_proxy_period_write = ${value} where couple_id = '${coupleId}'`);
}

console.log('\n================ 代录授权开关验证 ================\n');

// ---------------------------------------------------------------- 布景

const fx = (
  await q(`
    SELECT
      (SELECT user_id FROM public.couple_members WHERE member_role='owner' ORDER BY joined_at LIMIT 1) AS owner_id,
      (SELECT cm2.user_id FROM public.couple_members cm1
         JOIN public.couple_members cm2 ON cm2.couple_id = cm1.couple_id AND cm2.user_id <> cm1.user_id
         WHERE cm1.member_role='owner' LIMIT 1) AS partner_id,
      (SELECT couple_id FROM public.couple_members WHERE member_role='owner' ORDER BY joined_at LIMIT 1) AS couple_id
  `)
)[0];

if (!fx?.owner_id || !fx?.partner_id || !fx?.couple_id) {
  console.error('布景不足：需要一个已配对空间');
  process.exit(2);
}
const HER = fx.owner_id;
const HIM = fx.partner_id;
const COUPLE = fx.couple_id;
console.log(`  她=${String(HER).slice(0, 8)}  他=${String(HIM).slice(0, 8)}  couple=${String(COUPLE).slice(0, 8)}\n`);

const original = (await q(`select allow_proxy_period_write as v from public.couple_settings where couple_id='${COUPLE}'`))[0]?.v ?? true;
console.log(`  开关原值: ${original}\n`);

// 清理可能的残留
await q(`delete from public.period_cycles where start_date = '2026-05-01' and user_id = '${HER}'`);

try {
  // ---------------------------------------------------------------- 1. 开启时可写

  console.log('--- 1. 授权开启 ---');
  await setToggle(COUPLE, true);
  record('1.1 开关为 ON 时伴侣可代录', await canWrite(HIM, HER));

  // ---------------------------------------------------------------- 2. 关闭后被拒

  console.log('\n--- 2. 授权关闭（核心：开关必须真正生效）---');
  await setToggle(COUPLE, false);
  record('2.1 开关为 OFF 时伴侣写入被 RLS 拒绝', !(await canWrite(HIM, HER)));

  // 本人不受开关影响
  const selfWrite = await sql(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${HER}';
    insert into public.period_cycles (user_id, start_date, end_date)
    values ('${HER}', '2026-05-01', '2026-05-05');
    select true as ok;
  `);
  record('2.2 本人写入不受开关影响', selfWrite.ok);

  // ---------------------------------------------------------------- 3. 恢复后可写

  console.log('\n--- 3. 重新授权 ---');
  await setToggle(COUPLE, true);
  record('3.1 开关恢复 ON 后伴侣又可代录', await canWrite(HIM, HER));

  // ---------------------------------------------------------------- 4. 隐私边界与开关无关

  console.log('\n--- 4. 隐私边界（与开关无关，始终成立）---');
  const privateLog = await q(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${HER}';
    insert into public.period_logs (user_id, log_date, pain_level, visibility, notes)
    values ('${HER}', '2026-05-02', 3, 'private', 'proxy-verify 私密')
    returning id;
  `);
  const privId = privateLog[0]?.id;

  for (const toggle of [true, false]) {
    await setToggle(COUPLE, toggle);
    const r = await q(`
      set local role authenticated;
      set local request.jwt.claim.sub = '${HIM}';
      select count(*)::int as n from public.period_logs where id = '${privId}';
    `);
    record(`4.${toggle ? 1 : 2} 开关 ${toggle ? 'ON' : 'OFF'} 时伴侣均看不到她的 private 记录`, (r[0]?.n ?? -1) === 0, `n=${r[0]?.n}`);
  }

  // ---------------------------------------------------------------- 5. 陌生人不受开关影响

  console.log('\n--- 5. 陌生人（开关不适用于非成员）---');
  await setToggle(COUPLE, true);
  const outsider = (await q(`select id from public.profiles where id not in (select user_id from public.couple_members) limit 1`))[0]?.id;
  if (!outsider) {
    console.log('  ⚠️ 无未配对用户，跳过');
  } else {
    record('5.1 非成员即使开关 ON 也无法写入', !(await canWrite(outsider, HER)));
  }
} finally {
  // ---------------------------------------------------------------- 清理与恢复

  await q(`delete from public.period_logs where notes like 'proxy-verify%'`);
  await q(`delete from public.period_cycles where start_date = '2026-05-01' and user_id = '${HER}'`);
  await setToggle(COUPLE, original);
  console.log(`\n--- 已清理测试数据并把开关恢复为原值 ${original} ---`);
}

console.log(`\n================ 结果: ${passed} 项通过, ${failed} 项失败 ================\n`);
if (failed > 0) {
  for (const f of failures) console.log('  ❌ ' + f);
  console.log('');
  process.exit(1);
}
process.exit(0);
