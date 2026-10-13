/**
 * 可编辑能力验证（针对迁移 0011）
 *
 * 在单条 SQL 内切换身份（set local role + request.jwt.claim.sub），断言：
 *   A. 伴侣可为对方写入生理期数据（代录）
 *   B. 代录的 recorded_by 自动记录为代录人
 *   C. 伴侣可读取自己代录的记录
 *   D. 伴侣可读取对方标记为 shared 的记录
 *   E. 伴侣**看不到**对方标记 private 且非自己录入的记录（隐私底线保留）
 *   F. 伴侣可修改对方的资料（城市/昵称）
 *   G. 成员可修改「在一起的日子」
 *   H. 陌生人依然无法越权
 *
 * 为什么用单条 SQL：管理 API 每次调用是独立连接，set local 不跨语句生效。
 *
 * 用法：node scripts/verify-editable.mjs
 */
import { sql } from './sql-client.mjs';

let passed = 0;
let failed = 0;
const failures = [];

/**
 * 记录断言结果。
 * 注意签名是 (标签, 是否通过, 详情) —— 标签里已含编号，
 * 避免「id 与 name 分成两个参数」时把布尔值传到 name 位置的错误。
 */
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

/** 单条 SQL 断言（返回布尔） */
async function bool(query) {
  const r = await sql(query);
  if (!r.ok) throw new Error('SQL 失败: ' + JSON.stringify(r.data).slice(0, 300));
  const row = r.data?.[0];
  return Boolean(row ? Object.values(row)[0] : null);
}

/** 执行写操作，返回 { ok, rows }；RLS 拒绝会抛 42501 也算 ok=false 但不中断 */
async function attempt(query) {
  const r = await sql(query);
  if (!r.ok) return { ok: false, error: String(r.data?.message ?? '').slice(0, 120) };
  return { ok: true, rows: r.data ?? [] };
}

console.log('\n================ 可编辑能力验证（迁移 0011）================\n');

// ---------------------------------------------------------------- 布景

const setup = await sql(`
  WITH pair AS (
    SELECT
      (SELECT user_id FROM public.couple_members WHERE couple_id = m.couple_id AND member_role = 'owner' LIMIT 1) AS owner_id,
      (SELECT user_id FROM public.couple_members WHERE couple_id = m.couple_id AND user_id <> m.user_id LIMIT 1) AS partner_id,
      m.couple_id
    FROM public.couple_members m
    WHERE m.member_role = 'owner'
    LIMIT 1
  ),
  outsider AS (
    SELECT p.id FROM public.profiles p
    WHERE p.id NOT IN (SELECT user_id FROM public.couple_members)
    LIMIT 1
  )
  SELECT
    (SELECT owner_id FROM pair)   AS owner_id,
    (SELECT partner_id FROM pair) AS partner_id,
    (SELECT couple_id FROM pair)  AS couple_id,
    (SELECT id FROM outsider)     AS outsider_id
`);
const fx = setup.data?.[0];
if (!fx?.owner_id || !fx?.partner_id || !fx?.couple_id) {
  console.error('布景不足：需要一个已配对的空间（owner + partner）');
  process.exit(2);
}
// owner 视作女方（数据归属人），partner 视作男方（代录人）
const HER = fx.owner_id;
const HIM = fx.partner_id;
const COUPLE = fx.couple_id;
console.log(`  她=${String(HER).slice(0, 8)}  他=${String(HIM).slice(0, 8)}  couple=${String(COUPLE).slice(0, 8)}\n`);

// 清理上次可能残留的测试数据
await sql(`delete from public.period_logs where notes like 'editable-verify%'`);
await sql(`delete from public.period_cycles where id::text like 'editable%'`);

// ---------------------------------------------------------------- A/B. 代录写入

console.log('--- A/B. 伴侣代录生理期 ---');

const insertCycle = await attempt(`
  set local role authenticated;
  set local request.jwt.claim.sub = '${HIM}';
  with ins as (
    insert into public.period_cycles (user_id, start_date, end_date)
    values ('${HER}', '2026-06-01', '2026-06-06')
    returning id, recorded_by
  )
  select id, recorded_by from ins;
`);
record(
  'A.1 伴侣可为对方写入周期记录',
  insertCycle.ok && (insertCycle.rows?.length ?? 0) === 1,
  insertCycle.error ?? JSON.stringify(insertCycle.rows),
);

const cycleId = insertCycle.rows?.[0]?.id;
record(
  'B.1 recorded_by 自动记为代录人（他）',
  insertCycle.rows?.[0]?.recorded_by === HIM,
  `recorded_by=${String(insertCycle.rows?.[0]?.recorded_by).slice(0, 8)}`,
);

const insertLog = await attempt(`
  set local role authenticated;
  set local request.jwt.claim.sub = '${HIM}';
  with ins as (
    insert into public.period_logs (user_id, cycle_id, log_date, flow_level, pain_level, visibility, notes)
    values ('${HER}', ${cycleId ? `'${cycleId}'` : 'null'}, '2026-06-02', 3, 2, 'shared', 'editable-verify 代录打卡')
    returning id, recorded_by
  )
  select id, recorded_by from ins;
`);
record(
  'A.2 伴侣可为对方写入打卡记录',
  insertLog.ok && (insertLog.rows?.length ?? 0) === 1,
  insertLog.error ?? JSON.stringify(insertLog.rows),
);
const sharedLogId = insertLog.rows?.[0]?.id;

// 她写入一条 private 记录（模拟她主动保留的私密内容）
const insertPrivate = await attempt(`
  set local role authenticated;
  set local request.jwt.claim.sub = '${HER}';
  with ins as (
    insert into public.period_logs (user_id, cycle_id, log_date, pain_level, visibility, notes)
    values ('${HER}', ${cycleId ? `'${cycleId}'` : 'null'}, '2026-06-03', 4, 'private', 'editable-verify 她的私密备注')
    returning id
  )
  select id from ins;
`);
record(
  'A.3 本人可写入 private 记录',
  insertPrivate.ok && (insertPrivate.rows?.length ?? 0) === 1,
  insertPrivate.error ?? '',
);
const privateLogId = insertPrivate.rows?.[0]?.id;

// ---------------------------------------------------------------- C/D/E. 读取边界

console.log('\n--- C/D/E. 读取可见性边界 ---');

record(
  'C.1 伴侣能读到自己代录的记录',
  await bool(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${HIM}';
    select count(*) = 1 as ok from public.period_logs
    where id = ${sharedLogId ? `'${sharedLogId}'` : 'null'};
  `),
);

record(
  'D.1 伴侣能读到对方标记 shared 的记录',
  await bool(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${HIM}';
    select count(*) >= 1 as ok from public.period_logs
    where user_id = '${HER}' and visibility = 'shared';
  `),
);

record(
  'E.1 伴侣看不到对方 private 且非自己录入的记录（隐私底线）',
  await bool(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${HIM}';
    select count(*) = 0 as ok from public.period_logs
    where id = ${privateLogId ? `'${privateLogId}'` : 'null'};
  `),
);

record(
  'E.2 本人能看到自己的 private 记录',
  await bool(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${HER}';
    select count(*) = 1 as ok from public.period_logs
    where id = ${privateLogId ? `'${privateLogId}'` : 'null'};
  `),
);

// ---------------------------------------------------------------- F. 修改对方资料

console.log('\n--- F. 伴侣可维护对方资料 ---');

const profilePatch = await attempt(`
  set local role authenticated;
  set local request.jwt.claim.sub = '${HIM}';
  with u as (
    update public.profiles set weather_city = weather_city where id = '${HER}'
    returning id
  )
  select count(*)::int as n from u;
`);
record(
  'F.1 伴侣可更新对方资料（城市）',
  profilePatch.ok && (profilePatch.rows?.[0]?.n ?? 0) === 1,
  profilePatch.error ?? JSON.stringify(profilePatch.rows),
);

record(
  'F.2 伴侣仍不能篡改他人 id',
  await (async () => {
    const r = await attempt(`
      set local role authenticated;
      set local request.jwt.claim.sub = '${HIM}';
      update public.profiles set id = '${HIM}' where id = '${HER}';
    `);
    return !r.ok; // 期望被拒绝
  })(),
);

// ---------------------------------------------------------------- G. 在一起的日子

console.log('\n--- G. 在一起的日子可改 ---');

const datePatch = await attempt(`
  set local role authenticated;
  set local request.jwt.claim.sub = '${HIM}';
  with u as (
    update public.couples set relationship_started_at = relationship_started_at
    where id = '${COUPLE}' returning id
  )
  select count(*)::int as n from u;
`);
record(
  'G.1 成员可修改在一起的日子',
  datePatch.ok && (datePatch.rows?.[0]?.n ?? 0) === 1,
  datePatch.error ?? JSON.stringify(datePatch.rows),
);

// ---------------------------------------------------------------- H. 陌生人越权

console.log('\n--- H. 陌生人越权（应被拒绝）---');

if (!fx.outsider_id) {
  console.log('  ⚠️ 库中无未配对用户，跳过陌生人用例');
} else {
  record(
    'H.1 陌生人读不到该空间的生理期记录',
    await bool(`
      set local role authenticated;
      set local request.jwt.claim.sub = '${fx.outsider_id}';
      select count(*) = 0 as ok from public.period_logs where user_id = '${HER}';
    `),
  );

  record(
    'H.2 陌生人无法为他人写入记录',
    await (async () => {
      const r = await attempt(`
        set local role authenticated;
        set local request.jwt.claim.sub = '${fx.outsider_id}';
        insert into public.period_logs (user_id, log_date, visibility, notes)
        values ('${HER}', '2026-06-04', 'shared', 'editable-verify 越权');
      `);
      return !r.ok;
    })(),
  );
}

// ---------------------------------------------------------------- 清理

console.log('\n--- 清理测试数据 ---');
await sql(`delete from public.period_logs where notes like 'editable-verify%'`);
if (cycleId) await sql(`delete from public.period_cycles where id = '${cycleId}'`);
console.log('  已清理');

console.log(`\n================ 结果: ${passed} 项通过, ${failed} 项失败 ================\n`);
if (failed > 0) {
  for (const f of failures) console.log('  ❌ ' + f);
  console.log('');
  process.exit(1);
}
process.exit(0);
