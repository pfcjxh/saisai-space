import { supabase } from './supabase';
import type { Wish, WishCategory } from '@/types/database';

/**
 * wishService — 双人心愿单数据收敛层
 * RLS：空间成员全权读写删。
 */

export interface CreateWishInput {
  couple_id: string;
  title: string;
  description: string | null;
  category: WishCategory;
  created_by: string;
}

export interface UpdateWishPatch {
  title?: string;
  description?: string | null;
  category?: WishCategory;
  is_fulfilled?: boolean;
  fulfilled_at?: string | null;
  image_path?: string | null;
}

export async function listWishes(coupleId: string): Promise<Wish[]> {
  const { data, error } = await supabase
    .from('wishes')
    .select('*')
    .eq('couple_id', coupleId)
    .order('is_fulfilled', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createWish(input: CreateWishInput): Promise<Wish> {
  const { data, error } = await supabase.from('wishes').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateWish(id: string, patch: UpdateWishPatch): Promise<Wish> {
  const { data, error } = await supabase
    .from('wishes')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWish(id: string): Promise<void> {
  const { error } = await supabase.from('wishes').delete().eq('id', id);
  if (error) throw error;
}
