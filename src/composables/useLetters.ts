import { computed, onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { LoveLetter } from '@/types/database';
import { buildLetterMock } from '@/mocks/letterMock';
import { createLetter, deleteLetter, listLetters } from '@/services/letterService';
import { supabase } from '@/services/supabase';

/**
 * useLetters — 情书业务逻辑层 + Realtime 通道
 * 频道 couple-letters-{couple_id}；列表恒为"新信在前"。
 */
export interface LetterCreatePayload {
  title: string;
  body: string;
}

export function useLetters(coupleId: Ref<string | null>, myUserId: Ref<string | null>) {
  const letters = ref<LoveLetter[]>([]);
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
      letters.value = coupleId.value ? await listLetters(coupleId.value) : buildLetterMock();
    } catch {
      letters.value = buildLetterMock();
      showToast('网络异常，已切换为本地示例数据');
    } finally {
      loading.value = false;
    }
  }

  /** 寄出一封，成功返回新信（供视图即时拆阅），失败返回 null */
  async function create(payload: LetterCreatePayload): Promise<LoveLetter | null> {
    if (isMock.value || !coupleId.value || !myUserId.value) {
      const local: LoveLetter = {
        id: crypto.randomUUID(),
        couple_id: 'mock-couple',
        author_id: myUserId.value ?? 'mock-me',
        created_at: new Date().toISOString(),
        ...payload,
      };
      letters.value = [local, ...letters.value];
      return local;
    }
    try {
      const created = await createLetter({
        couple_id: coupleId.value,
        author_id: myUserId.value,
        ...payload,
      });
      letters.value = [created, ...letters.value];
      return created;
    } catch {
      showToast('寄信失败，请检查网络后重试');
      return null;
    }
  }

  async function remove(letter: LoveLetter): Promise<void> {
    const backup = letters.value;
    letters.value = letters.value.filter((l) => l.id !== letter.id);
    if (isMock.value) return;
    try {
      await deleteLetter(letter.id);
    } catch {
      letters.value = backup;
      showToast('撤回失败，已恢复');
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
      .channel(`couple-letters-${id}`)
      .on<LoveLetter>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'love_letters', filter: `couple_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<LoveLetter>) => {
          // payload.new 为 T | {} 联合，边界处显式收窄
          const row = payload.new as LoveLetter;
          if (!row || typeof row.id !== 'string') return;
          if (letters.value.some((l) => l.id === row.id)) return;
          letters.value = [row, ...letters.value];
        },
      )
      .on<LoveLetter>(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'love_letters', filter: `couple_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<LoveLetter>) => {
          const old = payload.old as LoveLetter;
          if (!old || typeof old.id !== 'string') return;
          letters.value = letters.value.filter((l) => l.id !== old.id);
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

  return { letters, loading, errorToast, isMock, load, create, remove };
}
