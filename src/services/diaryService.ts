import { supabase } from './supabase';
import type { Diary, DiaryComment, Mood, TablesUpdate } from '@/types/database';

/**
 * diaryService — 共享日记数据收敛层
 * RLS：空间成员可读；仅作者可改删；伴侣经"追加策略"仅可改 liked_by/comments。
 */

export interface CreateDiaryInput {
  id: string;
  couple_id: string;
  author_id: string;
  diary_date: string;
  title: string | null;
  content: string;
  mood: Mood | null;
  images: string[];
}

export interface UpdateDiaryPatch {
  title?: string | null;
  content?: string;
  mood?: Mood | null;
  images?: string[];
  liked_by?: string[];
  comments?: DiaryComment[];
}

export async function listDiaries(coupleId: string, limit = 50): Promise<Diary[]> {
  const { data, error } = await supabase
    .from('diaries')
    .select('*')
    .eq('couple_id', coupleId)
    .order('diary_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function createDiary(input: CreateDiaryInput): Promise<Diary> {
  const { data, error } = await supabase.from('diaries').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateDiary(id: string, patch: UpdateDiaryPatch): Promise<Diary> {
  const payload: TablesUpdate<'diaries'> = {};
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.content !== undefined) payload.content = patch.content;
  if (patch.mood !== undefined) payload.mood = patch.mood;
  if (patch.images) payload.images = patch.images;
  if (patch.liked_by) payload.liked_by = patch.liked_by;
  // JSONB 边界：结构化评论数组经 unknown 中转写入
  if (patch.comments) payload.comments = patch.comments as unknown as TablesUpdate<'diaries'>['comments'];
  const { data, error } = await supabase
    .from('diaries')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDiary(id: string): Promise<void> {
  const { error } = await supabase.from('diaries').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------- JSONB 读取收窄

/** diary.images 存储为 JSONB 字符串数组 */
export function imagesOf(diary: Diary): string[] {
  return Array.isArray(diary.images)
    ? diary.images.filter((p): p is string => typeof p === 'string')
    : [];
}

/** diary.comments 存储为 JSONB 评论数组，读取时逐字段校验收窄 */
export function commentsOf(diary: Diary): DiaryComment[] {
  const raw: unknown = diary.comments;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is DiaryComment => {
    if (typeof c !== 'object' || c === null) return false;
    const rec = c as Record<string, unknown>;
    return (
      typeof rec.author_id === 'string' &&
      typeof rec.nickname === 'string' &&
      typeof rec.content === 'string' &&
      typeof rec.created_at === 'string'
    );
  });
}
