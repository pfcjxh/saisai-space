import { supabase } from './supabase';
import type { Anniversary, AnniversaryCategory } from '@/types/database';

/**
 * anniversaryService — 纪念日数据收敛层。
 * 到期日换算与排序逻辑在 utils/lunar.ts 与 useAnniversaries 中完成。
 */

export interface CreateAnniversaryInput {
  couple_id: string;
  title: string;
  target_date: string;
  is_lunar: boolean;
  repeat_yearly: boolean;
  category: AnniversaryCategory;
  pinned: boolean;
  created_by: string;
}

export type UpdateAnniversaryInput = Partial<
  Omit<CreateAnniversaryInput, 'couple_id' | 'created_by'>
>;

/** 读取空间全部纪念日 */
export async function listAnniversaries(coupleId: string): Promise<Anniversary[]> {
  const { data, error } = await supabase
    .from('anniversaries')
    .select('*')
    .eq('couple_id', coupleId)
    .order('target_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createAnniversary(input: CreateAnniversaryInput): Promise<Anniversary> {
  const { data, error } = await supabase
    .from('anniversaries')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAnniversary(
  id: string,
  patch: UpdateAnniversaryInput,
): Promise<Anniversary> {
  const { data, error } = await supabase
    .from('anniversaries')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAnniversary(id: string): Promise<void> {
  const { error } = await supabase.from('anniversaries').delete().eq('id', id);
  if (error) throw error;
}
