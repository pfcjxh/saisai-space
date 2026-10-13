/**
 * 通过 Supabase 管理 API 执行 SQL（用于应用迁移与运维检查）
 *
 * 用法：
 *   node scripts/supabase-sql.mjs "select 1"
 *   node scripts/supabase-sql.mjs --file supabase/migrations/xxx.sql
 *
 * 凭据：从 .env 读取 SUPABASE_ACCESS_TOKEN（需具备 database 写权限）
 */
import { readFileSync } from 'node:fs';

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF ?? new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];

if (!TOKEN) {
  console.error('缺少 SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

export async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, ok: res.ok, data: parsed };
}

// ---------------------------------------------------------------- CLI

const args = process.argv.slice(2);
if (args.length > 0) {
  let query;
  if (args[0] === '--file') {
    query = readFileSync(args[1], 'utf8');
  } else {
    query = args.join(' ');
  }
  const result = await sql(query);
  if (!result.ok) {
    console.error(`HTTP ${result.status}`);
    console.error(JSON.stringify(result.data, null, 2).slice(0, 3000));
    process.exit(1);
  }
  console.log(typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2));
  // 显式退出：避免 Node 24 在 Windows 上回收 fetch 句柄时的 UV_HANDLE_CLOSING 断言噪音
  process.exit(0);
}
