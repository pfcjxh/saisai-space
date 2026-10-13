import { supabase } from './supabase';
import type { StickyNote, StickyNoteColor } from '@/types/database';

/**
 * noteService — 便利贴墙数据收敛层
 * RLS：空间成员可读；仅作者可写/改/删。
 */

export interface CreateNoteInput {
  couple_id: string;
  author_id: string;
  color: StickyNoteColor;
  content: string;
  pinned: boolean;
}

export interface UpdateNotePatch {
  color?: StickyNoteColor;
  content?: string;
  pinned?: boolean;
}

export async function listNotes(coupleId: string): Promise<StickyNote[]> {
  const { data, error } = await supabase
    .from('sticky_notes')
    .select('*')
    .eq('couple_id', coupleId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createNote(input: CreateNoteInput): Promise<StickyNote> {
  const { data, error } = await supabase.from('sticky_notes').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateNote(id: string, patch: UpdateNotePatch): Promise<StickyNote> {
  const { data, error } = await supabase
    .from('sticky_notes')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('sticky_notes').delete().eq('id', id);
  if (error) throw error;
}
