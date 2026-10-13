import { supabase } from './supabase';
import type { Mood, Profile } from '@/types/database';

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

/** 更新当前用户心情标记（RLS：仅本人可写） */
export async function updateMood(userId: string, mood: Mood): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ mood, mood_updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}
