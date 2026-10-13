import { supabase } from './supabase';
import type { LoveLetter } from '@/types/database';

/**
 * letterService — 情书数据收敛层
 * RLS：空间成员可读；仅作者可寄出/撤回。信一旦寄出不支持编辑。
 */

export interface CreateLetterInput {
  couple_id: string;
  author_id: string;
  title: string;
  body: string;
}

export async function listLetters(coupleId: string): Promise<LoveLetter[]> {
  const { data, error } = await supabase
    .from('love_letters')
    .select('*')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createLetter(input: CreateLetterInput): Promise<LoveLetter> {
  const { data, error } = await supabase.from('love_letters').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function deleteLetter(id: string): Promise<void> {
  const { error } = await supabase.from('love_letters').delete().eq('id', id);
  if (error) throw error;
}
