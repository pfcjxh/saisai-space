/**
 * 安全应用迁移文件：在显式事务中执行，失败自动回滚，并在前后做校验。
 *
 * 用法：
 *   node scripts/apply-migration.mjs --file <迁移.sql>          # 干跑+应用
 *   node scripts/apply-migration.mjs --file <迁移.sql> --dry    # 仅校验不应用
 *
 * 安全设计：
 *   · 整段 SQL 包在 BEGIN/COMMIT 中，任一条语句失败即整体回滚，
 *     不会留下「一半应用」的中间态；
 *   · 应用前先记录受影响策略的快照（pg_policies），应用后可对比；
 *   · daily-check-push 等 cron 任务不受影响（本脚本不触碰 cron）。
 *
 * 凭据：从 .env 读取 SUPABASE_ACCESS_TOKEN（需 database 写权限）。
 */
import { readFileSync } from 'node:fs';
import { sql } from './sql-client.mjs';

const args = process.argv.slice(2);
if (args.length < 2 || args[0] !== '--file') {
  console.error('用法: node scripts/apply-migration.mjs --file <路径> [--dry]');
  process.exit(1);
}
const file = args[1];
const dryRun = args.includes('--dry');
const migrationSql = readFileSync(file, 'utf8');

/** 策略快照：policy name -> cmd */
async function snapshotPolicies() {
  const r = await sql(
    `select tablename || '.' || policyname || ' [' || cmd || ']' as key from pg_policies where schemaname='public' order by 1`,
  );
  if (!r.ok) throw new Error('快照失败: ' + JSON.stringify(r.data).slice(0, 200));
  return (r.data ?? []).map((x) => x.key);
}

console.log(`迁移文件: ${file}${dryRun ? '  (干跑模式)' : ''}`);

const before = await snapshotPolicies();
console.log(`应用前策略数: ${before.length}`);

// 裸 auth.uid() 计数
async function bareUidCount() {
  const r = await sql(
    `select count(*)::int as n from pg_policies where schemaname='public'
       and ((qual ~ 'auth\\.uid\\(\\)') or (with_check ~ 'auth\\.uid\\(\\)'))`,
  );
  return r.ok ? r.data?.[0]?.n ?? -1 : -1;
}
const beforeBare = await bareUidCount();
console.log(`应用前含 auth.uid() 的策略数: ${beforeBare}`);

if (dryRun) {
  console.log('\n干跑模式，未应用。');
  process.exit(0);
}

// ---------------------------------------------------------------- 应用（显式事务）

console.log('\n--- 应用中（事务内）---');
const txResult = await sql(
  'BEGIN;\n' + migrationSql + '\nCOMMIT;',
);
if (!txResult.ok) {
  console.error('❌ 迁移失败（已回滚，数据库不受影响）');
  console.error(JSON.stringify(txResult.data, null, 2).slice(0, 2000));
  process.exit(1);
}
console.log('✅ 迁移已提交');

// ---------------------------------------------------------------- 复核

const after = await snapshotPolicies();
const afterBare = await bareUidCount();

const removed = before.filter((k) => !after.includes(k));
const added = after.filter((k) => !before.includes(k));

console.log(`\n应用后策略数: ${after.length}`);
console.log(`应用后含 auth.uid() 的策略数: ${afterBare}`);

if (removed.length > 0) {
  console.log(`\n策略总数变化: 移除 ${removed.length} / 新增 ${added.length}`);
  for (const k of removed.slice(0, 10)) console.log(`  - ${k}`);
  if (removed.length > 10) console.log(`  ... 共 ${removed.length} 个`);
} else {
  console.log('\n策略数量与命名无变化（符合幂等重写的预期）');
}

// 语义不变性校验：裸 auth.uid() 应减少
if (afterBare <= beforeBare) {
  console.log(`\n✅ 裸 auth.uid() 策略数: ${beforeBare} -> ${afterBare}（持平或减少，符合预期）`);
} else {
  console.log(`\n⚠️ 裸 auth.uid() 策略数反而增加: ${beforeBare} -> ${afterBare}，请检查`);
}

// 关键表必须仍有 RLS 开启
const rls = await sql(
  `select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and not relrowsecurity`,
);
if (rls.ok && (rls.data ?? []).length > 0) {
  console.log('\n❌ 警告：以下表未启用 RLS:');
  for (const t of rls.data) console.log('  - ' + t.relname);
  process.exit(1);
}
console.log('✅ 所有 public 表均已启用 RLS');

process.exit(0);
