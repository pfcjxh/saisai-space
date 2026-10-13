import { supabase } from './supabase';
import type { Gender } from '@/types/database';

/**
 * authService — Supabase Auth 收敛层
 * 页面组件禁止直连 supabase.auth，一律经由本模块。
 */

export interface AuthResult {
  ok: boolean;
  /** true = 注册成功但需要邮箱确认（无会话） */
  needsEmailConfirmation: boolean;
  message: string | null;
}

/** 错误文案本地化 */
export function mapAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return '邮箱或密码不正确';
  if (/email not confirmed/i.test(message)) return '邮箱还未确认，请先查收确认邮件';
  if (/user already registered|already been registered/i.test(message))
    return '该邮箱已注册，请直接登录';
  if (/password should be at least/i.test(message)) return '密码长度不足，至少 6 位';
  if (/unable to validate email|invalid format/i.test(message)) return '邮箱格式不正确';
  if (/rate limit|too many/i.test(message)) return '操作过于频繁，请稍后再试';
  return message;
}

export interface SignUpOptions {
  email: string;
  password: string;
  nickname: string;
  gender: Gender | null;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return {
    ok: !error,
    needsEmailConfirmation: false,
    message: error ? mapAuthError(error.message) : null,
  };
}

export async function signUp(options: SignUpOptions): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email: options.email,
    password: options.password,
    // handle_new_user 触发器读取 metadata 中的 nickname / gender 自动建档
    options: { data: { nickname: options.nickname, gender: options.gender } },
  });
  if (error) {
    return { ok: false, needsEmailConfirmation: false, message: mapAuthError(error.message) };
  }
  return {
    ok: true,
    needsEmailConfirmation: data.session === null,
    message: null,
  };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}