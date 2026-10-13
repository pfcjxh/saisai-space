import { supabase } from './supabase';
import type { Gender, Mood, Profile } from '@/types/database';

/** 读取指定用户公开资料（RLS：本人或同空间伴侣可读） */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * 可编辑的资料字段白名单。
 * 刻意收窄：不允许从客户端改写 id / created_at / updated_at，
 * 也不允许改 notify_* （有专门的 updateNotifyPrefs 负责，语义更清晰）。
 */
export interface ProfilePatch {
  nickname?: string;
  gender?: Gender | null;
  timezone?: string;
  weather_city?: string;
  weather_lat?: number | null;
  weather_lon?: number | null;
  /** 首页自定义文案；null 表示清空、回落到默认值 */
  love_note?: string | null;
}

/**
 * 更新资料。
 *
 * 目标用户可以是**本人或同空间伴侣**——RLS 已放开这一写权限，
 * 用于支持「一方长时间无法操作时由另一方代为维护」（如修改对方所在城市）。
 */
export async function updateProfile(userId: string, patch: ProfilePatch): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 更新当前用户心情标记 */
export async function updateMood(userId: string, mood: Mood): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ mood, mood_updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}
