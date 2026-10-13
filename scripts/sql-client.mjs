/**
 * SQL 执行模块：通过 Supabase 管理 API 执行 SQL
 *
 * 本模块只导出函数，不做 CLI 分发（CLI 入口见 supabase-sql.mjs），
 * 以便其它脚本安全 import。
 */
import { readFileSync } from 'node:fs';

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = env.SUPABASE_PROJECT_REF ?? new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];

if (!TOKEN) {
  console.error('缺少 SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

/**
 * 执行 SQL
 * @returns {Promise<{status:number, ok:boolean, data:*}>}
 */
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

export { REF as projectRef };

// 显式退出：避免 Node 24 在 Windows 上回收 fetch 句柄时的 UV_HANDLE_CLOSING 断言噪音
process.exit = process.exit;
