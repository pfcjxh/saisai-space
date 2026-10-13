import { computed, onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { StickyNote, StickyNoteColor } from '@/types/database';
import { buildNoteMock } from '@/mocks/noteMock';
import { createNote, deleteNote, listNotes, updateNote } from '@/services/noteService';
import { supabase } from '@/services/supabase';

/**
 * useNotes — 便利贴墙业务逻辑层 + Realtime 通道
 * 频道 couple-notes-{couple_id}；列表恒为"置顶优先 + 新贴在前"。
 */
export interface NoteCreatePayload {
  color: StickyNoteColor;
  content: string;
  pinned: boolean;
}

export function useNotes(coupleId: Ref<string | null>, myUserId: Ref<string | null>) {
  const notes = ref<StickyNote[]>([]);
  const loading = ref(false);
  const errorToast = ref<string | null>(null);

  const isMock = computed(() => coupleId.value === null);

  let toastTimer: number | undefined;
  function showToast(message: string): void {
    errorToast.value = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      errorToast.value = null;
    }, 2500);
  }

  async function load(): Promise<void> {
    loading.value = true;
    try {
      notes.value = coupleId.value ? await listNotes(coupleId.value) : buildNoteMock();
    } catch {
      notes.value = buildNoteMock();
      showToast('网络异常，已切换为本地示例数据');
    } finally {
      loading.value = false;
    }
  }

  async function create(payload: NoteCreatePayload): Promise<boolean> {
    if (isMock.value || !coupleId.value || !myUserId.value) {
      const now = new Date().toISOString();
      const local: StickyNote = {
        id: crypto.randomUUID(),
        couple_id: 'mock-couple',
        author_id: myUserId.value ?? 'mock-me',
        created_at: now,
        updated_at: now,
        ...payload,
      };
      notes.value = [local, ...notes.value];
      return true;
    }
    try {
      const created = await createNote({
        couple_id: coupleId.value,
        author_id: myUserId.value,
        ...payload,
      });
      notes.value = [created, ...notes.value];
      return true;
    } catch {
      showToast('贴便签失败，请检查网络后重试');
      return false;
    }
  }

  /** 编辑内容 / 换色 / 置顶切换；乐观更新，失败回滚 */
  async function update(note: StickyNote, patch: Partial<NoteCreatePayload>): Promise<boolean> {
    const backup = notes.value;
    notes.value = notes.value.map((n) => (n.id === note.id ? { ...n, ...patch } : n));
    if (isMock.value) return true;
    try {
      const saved = await updateNote(note.id, patch);
      notes.value = notes.value.map((n) => (n.id === saved.id ? saved : n));
      return true;
    } catch {
      notes.value = backup;
      showToast('修改失败，已恢复');
      return false;
    }
  }

  async function remove(note: StickyNote): Promise<void> {
    const backup = notes.value;
    notes.value = notes.value.filter((n) => n.id !== note.id);
    if (isMock.value) return;
    try {
      await deleteNote(note.id);
    } catch {
      notes.value = backup;
      showToast('撕下失败，已恢复');
    }
  }

  // ---------------------------------------------------------------- Realtime

  let channel: RealtimeChannel | null = null;

  function teardown(): void {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  }

  function subscribe(id: string): void {
    teardown();
    channel = supabase
      .channel(`couple-notes-${id}`)
      .on<StickyNote>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sticky_notes', filter: `couple_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<StickyNote>) => {
          // payload.new 为 T | {} 联合，边界处显式收窄
          const row = payload.new as StickyNote;
          if (!row || typeof row.id !== 'string') return;
          if (notes.value.some((n) => n.id === row.id)) return;
          notes.value = [row, ...notes.value];
        },
      )
      .on<StickyNote>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sticky_notes', filter: `couple_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<StickyNote>) => {
          const row = payload.new as StickyNote;
          if (!row || typeof row.id !== 'string') return;
          notes.value = notes.value.map((n) => (n.id === row.id ? row : n));
        },
      )
      .on<StickyNote>(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'sticky_notes', filter: `couple_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<StickyNote>) => {
          const old = payload.old as StickyNote;
          if (!old || typeof old.id !== 'string') return;
          notes.value = notes.value.filter((n) => n.id !== old.id);
        },
      )
      .subscribe();
  }

  watch(
    coupleId,
    (id) => {
      if (id) {
        subscribe(id);
      } else {
        teardown();
      }
    },
    { immediate: true },
  );

  onUnmounted(teardown);

  return { notes, loading, errorToast, isMock, load, create, update, remove };
}
