import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Supabase 客户端单例。
 * 全局唯一实例，所有数据交互必须经由 services/ 层封装后使用，
 * 页面组件禁止直接引用本模块拼查询。
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '缺少 Supabase 环境变量：请复制 .env.example 为 .env 并填入 ' +
      'VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY。',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // 会话持久化到 localStorage，PWA 冷启动免重新登录
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
