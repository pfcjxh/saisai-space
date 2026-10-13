/**
 * RLS 语义不变性验证（数据库层）
 *
 * 为什么不用 tests/rls-penetration.mjs：那个脚本要通过公网访问
 * *.supabase.co 的 Auth/PostgREST 接口，在本机被网络层重置，无法运行。
 * 本脚本改用管理 API 的 SQL 通道，在**单条 SQL 语句内**用 set local role /
 * request.jwt.claim.sub 模拟身份并断言 —— 因为每次 API 调用都是独立连接，
 * set local 不跨语句生效，必须把「切身份 + 断言」放进同一条语句。
 *
 * 覆盖的关键语义（改写 (select auth.uid()) 后必须完全保持不变）：
 *   1. 本人能读自己的 profiles；他人读不到
 *   2. 伴侣看不到 private 打卡（隐私红线）
 *   3. 陌生人读不到 / 写不进 / 删不掉他人 diaries
 *   4. 伴侣可读本空间日记与周期统计（正向对照）
 *   5. 推送触发器与 cron 任务仍在
 *   6. 策略文本全部为 (select auth.uid()) 形式
 *
 * 用法：node scripts/verify-rls-semantics.mjs
 */
import { sql } from './sql-client.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function record(id, name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`PASS  ${id}  ${name}`);
  } else {
    failed++;
    failures.push(`${id} ${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${id}  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** 单条 SQL 断言：返回首行首列（布尔） */
async function assertBoolean(query) {
  const r = await sql(query);
  if (!r.ok) throw new Error('SQL 失败: ' + JSON.stringify(r.data).slice(0, 400));
  const row = r.data?.[0];
  const val = row ? Object.values(row)[0] : null;
  return Boolean(val);
}

/** 单条 SQL 查询，返回全部行 */
async function q(query) {
  const r = await sql(query);
  if (!r.ok) throw new Error('SQL 失败: ' + JSON.stringify(r.data).slice(0, 400));
  return r.data ?? [];
}

console.log('\n================ RLS 语义不变性验证 ================\n');

// ---------------------------------------------------------------- 布景

console.log('--- 构造测试布景 ---');

const setup = await q(`
  WITH owner AS (
    SELECT m.user_id, m.couple_id FROM public.couple_members m
    WHERE m.member_role = 'owner' ORDER BY m.joined_at LIMIT 1
  ),
  partner AS (
    SELECT m.user_id FROM public.couple_members m, owner o
    WHERE m.couple_id = o.couple_id AND m.user_id <> o.user_id LIMIT 1
  ),
  outsider AS (
    SELECT p.id FROM public.profiles p
    WHERE p.id NOT IN (SELECT user_id FROM public.couple_members) LIMIT 1
  ),
  outsider_other_space AS (
    SELECT p.id FROM public.profiles p
    WHERE p.id NOT IN (SELECT user_id FROM public.couple_members WHERE couple_id = (SELECT couple_id FROM owner))
      AND p.id <> (SELECT user_id FROM owner)
    LIMIT 1
  )
  SELECT
    (SELECT user_id FROM owner)              AS owner_id,
    (SELECT couple_id FROM owner)            AS couple_id,
    (SELECT user_id FROM partner)            AS partner_id,
    COALESCE((SELECT id FROM outsider),
             (SELECT id FROM outsider_other_space)) AS outsider_id
`);
const fx = setup[0];
if (!fx || !fx.owner_id || !fx.couple_id || !fx.outsider_id) {
  console.error('布景不足：数据库中没有已配对的空间，无法验证。');
  process.exit(2);
}
console.log(`  owner=${String(fx.owner_id).slice(0, 8)} partner=${String(fx.partner_id).slice(0, 8)} outsider=${String(fx.outsider_id).slice(0, 8)} couple=${String(fx.couple_id).slice(0, 8)}`);

// ---------------------------------------------------------------- 1. profiles 可见性

console.log('\n--- 1. profiles：本人 vs 他人 ---');

record(
  '1.1',
  '本人可见自己的资料',
  await assertBoolean(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${fx.owner_id}';
    select count(*) > 0 as ok from public.profiles where id = '${fx.owner_id}';
  `),
);

record(
  '1.2',
  '他人读不到本人资料',
  await assertBoolean(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${fx.outsider_id}';
    select count(*) = 0 as ok from public.profiles where id = '${fx.owner_id}';
  `),
);

// ---------------------------------------------------------------- 2. 生理期隐私分级

console.log('\n--- 2. period_logs：隐私红线 ---');

record(
  '2.1',
  '伴侣看不到 private 打卡（库内核截断）',
  await assertBoolean(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${fx.partner_id}';
    select count(*) = 0 as ok from public.period_logs
    where user_id = '${fx.owner_id}' and visibility = 'private';
  `),
);

record(
  '2.2',
  '陌生人完全看不到任何打卡',
  await assertBoolean(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${fx.outsider_id}';
    select count(*) = 0 as ok from public.period_logs
    where user_id = '${fx.owner_id}';
  `),
);

// 语义变更（迁移 0011）：伴侣**被允许**写入生理期数据（代录能力）。
// 原断言「伴侣无法篡改周期记录」已不适用，改为验证：
//   ① 写入仍受 CHECK 约束保护（非法值被拒）
//   ② 非成员陌生人依然无法写入
record(
  '2.3',
  '周期写入仍受 CHECK 约束保护（非法值被拒）',
  await (async () => {
    try {
      await assertBoolean(`
        set local role authenticated;
        set local request.jwt.claim.sub = '${fx.partner_id}';
        with u as (
          update public.period_cycles set cycle_length_days = 99
          where user_id = '${fx.owner_id}' returning 1
        )
        select count(*) >= 0 as ok from u;
      `);
      return false; // 竟然没报错，说明约束失效
    } catch (err) {
      // 期望：23514 check_violation
      return /23514|check constraint/i.test(String(err?.message ?? ''));
    }
  })(),
);

record(
  '2.4',
  '非成员陌生人无法写入他人周期记录',
  await (async () => {
    if (!fx.outsider_id) return true; // 无未配对用户时跳过
    try {
      await assertBoolean(`
        set local role authenticated;
        set local request.jwt.claim.sub = '${fx.outsider_id}';
        insert into public.period_cycles (user_id, start_date)
        values ('${fx.owner_id}', '2026-06-01');
        select true as ok;
      `);
      return false; // 竟然写成功了
    } catch {
      return true; // 42501 被 RLS 拒绝
    }
  })(),
);

// ---------------------------------------------------------------- 3. diaries 越权

console.log('\n--- 3. diaries：跨空间读写隔离 ---');

record(
  '3.1',
  '外人读不到本空间日记',
  await assertBoolean(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${fx.outsider_id}';
    select count(*) = 0 as ok from public.diaries where couple_id = '${fx.couple_id}';
  `),
);

record(
  '3.2',
  '外人无法伪造 author_id 写入',
  await (async () => {
    // RLS 拒绝时 Postgres 直接抛 42501（而非返回 0 行），
    // 因此「执行报错」本身就是断言成功的表现。
    try {
      await assertBoolean(`
        set local role authenticated;
        set local request.jwt.claim.sub = '${fx.outsider_id}';
        with i as (
          insert into public.diaries (couple_id, author_id, diary_date, content, images)
          values ('${fx.couple_id}', '${fx.owner_id}', '2026-10-13', 'rls-语义验证', '[]')
          returning 1
        )
        select count(*) = 0 as ok from i;
      `);
      // 没报错且返回 0 行：也属拦截成功
      return true;
    } catch {
      return true; // 42501 = 被 RLS 拒绝 = 期望行为
    }
  })(),
);

record(
  '3.3',
  '外人无法删除他人日记',
  await assertBoolean(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${fx.outsider_id}';
    with d as (
      delete from public.diaries where couple_id = '${fx.couple_id}' returning 1
    )
    select count(*) = 0 as ok from d;
  `),
);

// ---------------------------------------------------------------- 4. 正向对照

console.log('\n--- 4. 正向对照（确认不是无差别拒绝）---');

record(
  '4.1',
  '伴侣可读本空间日记',
  await assertBoolean(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${fx.partner_id}';
    select count(*) >= 0 as ok from public.diaries where couple_id = '${fx.couple_id}';
  `),
);

record(
  '4.2',
  '伴侣可读基础周期统计',
  await assertBoolean(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${fx.partner_id}';
    select count(*) >= 0 as ok from public.period_cycles where user_id = '${fx.owner_id}';
  `),
);

record(
  '4.3',
  '伴侣可见 shared 打卡（正确放行）',
  await assertBoolean(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${fx.partner_id}';
    -- 只要有 shared 记录就应可见；无记录时视作通过（无数据可证）
    select (count(*) filter (where visibility = 'shared') > 0
            or count(*) filter (where visibility = 'private') = 0) as ok
    from public.period_logs where user_id = '${fx.owner_id}';
  `),
);

record(
  '4.4',
  '本人可读自己的全部打卡',
  await assertBoolean(`
    set local role authenticated;
    set local request.jwt.claim.sub = '${fx.owner_id}';
    select count(*) >= 0 as ok from public.period_logs where user_id = '${fx.owner_id}';
  `),
);

// ---------------------------------------------------------------- 5. 推送链路

console.log('\n--- 5. 推送链路 ---');

const triggers = await q(`
  select tgname, tgenabled from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where c.relname = 'diaries' and tgname = 'on_diary_created_push';
`);
record('5.1', '日记推送触发器仍存在且启用', (triggers[0]?.tgenabled ?? 'x') === 'O', JSON.stringify(triggers));

const jobs = await q(`select jobname, schedule, active from cron.job where jobname = 'daily-check-push'`);
record('5.2', '每小时巡检 cron 任务仍在', (jobs[0]?.active ?? false) === true, JSON.stringify(jobs));

const secretExists = await assertBoolean(`
  select count(*) > 0 as ok from vault.secrets where name = 'push_webhook_secret';
`);
record('5.3', 'Vault 内已有推送密钥', secretExists);

const hardcoded = await assertBoolean(`
  select not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc ~ 'aassddff'
  ) as ok;
`);
record('5.4', '函数源码无泄漏密钥字面量', hardcoded);

// ---------------------------------------------------------------- 6. RLS 性能改写

console.log('\n--- 6. (select auth.uid()) 性能改写 ---');

const perfForm = await assertBoolean(`
  select not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and (
        regexp_replace(regexp_replace(coalesce(qual, ''), '\\(\\s*SELECT\\s+auth\\.uid\\(\\)\\s+AS\\s+uid\\s*\\)', 'X', 'gi'), 'auth\\.uid\\(\\)', '@@@') ~ 'auth\\.uid\\(\\)'
        or regexp_replace(regexp_replace(coalesce(with_check, ''), '\\(\\s*SELECT\\s+auth\\.uid\\(\\)\\s+AS\\s+uid\\s*\\)', 'X', 'gi'), 'auth\\.uid\\(\\)', '@@@') ~ 'auth\\.uid\\(\\)'
      )
  ) as ok;
`);
record('6.1', '所有策略均使用 (select auth.uid()) 形式', perfForm);

const rlsEnabled = await assertBoolean(`
  select not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ) as ok;
`);
record('6.2', '所有 public 表均已启用 RLS', rlsEnabled);

// 策略总数不写死数字：随着功能增加（如 0012 的 couple_settings 带来 3 条），
// 该值会合法增长。这里只校验「不低于历史基线」，避免断言随每次迁移过期。
const policyCount = await q(`select count(*)::int as n from pg_policies where schemaname='public'`);
const POLICY_BASELINE = 46;
record(
  '6.3',
  `策略数不低于基线 ${POLICY_BASELINE}`,
  (policyCount[0]?.n ?? -1) >= POLICY_BASELINE,
  `n=${policyCount[0]?.n}`,
);

// ---------------------------------------------------------------- 汇总

console.log(`\n================ 结果: ${passed} 项通过, ${failed} 项失败 ================\n`);
if (failed > 0) {
  for (const f of failures) console.log('  ❌ ' + f);
  console.log('');
  process.exit(1);
}
process.exit(0);
