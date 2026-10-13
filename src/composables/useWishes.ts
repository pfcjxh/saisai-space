import { computed, onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Wish, WishCategory } from '@/types/database';
import { buildWishMock } from '@/mocks/wishMock';
import { createWish, deleteWish, listWishes, updateWish } from '@/services/wishService';
import { resolveMediaUrls, removeMedia } from '@/services/storageService';
import { supabase } from '@/services/supabase';
import { clearScope, hasInflight, trackWrite, writeScope } from '@/utils/inflight';

/**
 * useWishes — 双人心愿单业务逻辑层 + Realtime 通道
 * 频道 couple-wishes-{couple_id}；卸载显式 removeChannel。
 */
export interface WishCreatePayload {
  title: string;
  description: string | null;
  category: WishCategory;
}

export function useWishes(coupleId: Ref<string | null>, myUserId: Ref<string | null>) {
  const wishes = ref<Wish[]>([]);
  const mediaUrls = ref<Record<string, string>>({});
  const loading = ref(false);
  const errorToast = ref<string | null>(null);

  const isMock = computed(() => coupleId.value === null);
  /** 在途写入作用域：抑制 Realtime 回环覆盖乐观更新 */
  const scope = computed(() => writeScope('wishes', coupleId.value));

  const pending = computed(() => wishes.value.filter((w) => !w.is_fulfilled));
  const fulfilled = computed(() =>
    wishes.value
      .filter((w) => w.is_fulfilled)
      .sort((a, b) => ((a.fulfilled_at ?? '') < (b.fulfilled_at ?? '') ? 1 : -1)),
  );
  const completionRate = computed(() => {
    if (wishes.value.length === 0) return 0;
    return Math.round((fulfilled.value.length / wishes.value.length) * 100);
  });

  let toastTimer: number | undefined;
  function showToast(message: string): void {
    errorToast.value = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      errorToast.value = null;
    }, 2500);
  }

  async function resolveAll(list: Wish[]): Promise<void> {
    const paths = list.map((w) => w.image_path).filter((p): p is string => !!p);
    if (paths.length === 0) return;
    try {
      const resolved = await resolveMediaUrls(paths);
      mediaUrls.value = { ...mediaUrls.value, ...resolved };
    } catch {
      // 签名失败：照片位展示占位
    }
  }

  async function load(): Promise<void> {
    loading.value = true;
    try {
      if (!coupleId.value) {
        wishes.value = buildWishMock();
      } else {
        wishes.value = await listWishes(coupleId.value);
      }
      await resolveAll(wishes.value);
    } catch {
      wishes.value = buildWishMock();
      await resolveAll(wishes.value);
      showToast('网络异常，已切换为本地示例数据');
    } finally {
      loading.value = false;
    }
  }

  async function create(payload: WishCreatePayload): Promise<boolean> {
    if (isMock.value || !coupleId.value || !myUserId.value) {
      const now = new Date().toISOString();
      const local: Wish = {
        id: crypto.randomUUID(),
        couple_id: 'mock-couple',
        created_by: myUserId.value ?? 'mock-me',
        is_fulfilled: false,
        fulfilled_at: null,
        image_path: null,
        created_at: now,
        updated_at: now,
        ...payload,
      };
      wishes.value = [local, ...wishes.value];
      return true;
    }
    try {
      const created = await createWish({
        couple_id: coupleId.value,
        created_by: myUserId.value,
        ...payload,
      });
      wishes.value = [created, ...wishes.value];
      return true;
    } catch {
      showToast('创建失败，请检查网络后重试');
      return false;
    }
  }

  /** 达成 / 取消达成；达成时记录时间戳，彩屑由视图层触发 */
  async function toggleFulfilled(wish: Wish): Promise<boolean> {
    const next = !wish.is_fulfilled;
    const backup = wishes.value;
    wishes.value = wishes.value.map((w) =>
      w.id === wish.id
        ? {
            ...w,
            is_fulfilled: next,
            fulfilled_at: next ? new Date().toISOString() : null,
          }
        : w,
    );
    if (isMock.value) return next;
    const release = trackWrite(scope.value, [wish.id]);
    try {
      await updateWish(wish.id, {
        is_fulfilled: next,
        fulfilled_at: next ? new Date().toISOString() : null,
      });
      return next;
    } catch {
      wishes.value = backup;
      showToast('操作失败，已恢复');
      return !next;
    } finally {
      release();
    }
  }

  /** 达成后补充纪念照片 */
  async function attachImage(wish: Wish, imagePath: string): Promise<void> {
    const backup = wishes.value;
    wishes.value = wishes.value.map((w) => (w.id === wish.id ? { ...w, image_path: imagePath } : w));
    if (isMock.value) return;
    const release = trackWrite(scope.value, [wish.id]);
    try {
      await updateWish(wish.id, { image_path: imagePath });
      // 修复：原实现传的是**旧的 wish 对象**（image_path 仍为 null），
      // 签名结果里没有新路径，照片要等下次 load 才显示。
      // 改为传更新后的对象，让新路径立即参与签名。
      await resolveAll([{ ...wish, image_path: imagePath }]);
    } catch {
      wishes.value = backup;
      showToast('照片保存失败，已恢复');
    } finally {
      release();
    }
  }

  async function remove(wish: Wish): Promise<void> {
    const backup = wishes.value;
    wishes.value = wishes.value.filter((w) => w.id !== wish.id);
    if (isMock.value) return;
    const release = trackWrite(scope.value, [wish.id]);
    try {
      await deleteWish(wish.id);
      if (wish.image_path) removeMedia(wish.image_path).catch(() => undefined);
    } catch {
      wishes.value = backup;
      showToast('删除失败，已恢复');
    } finally {
      release();
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
      .channel(`couple-wishes-${id}`)
      .on<Wish>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wishes', filter: `couple_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<Wish>) => {
          // payload.new 为 T | {} 联合，JSONB 边界处显式收窄
          const row = payload.new as Wish;
          if (!row || typeof row.id !== 'string') return;
          if (wishes.value.some((w) => w.id === row.id)) return;
          wishes.value = [row, ...wishes.value];
          resolveAll([row]);
        },
      )
      .on<Wish>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wishes', filter: `couple_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<Wish>) => {
          const row = payload.new as Wish;
          if (!row || typeof row.id !== 'string') return;
          // 回环抑制：本行有在途写入时以本地乐观值为准
          if (hasInflight(scope.value, [row.id])) return;
          wishes.value = wishes.value.map((w) => (w.id === row.id ? row : w));
        },
      )
      .on<Wish>(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'wishes', filter: `couple_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<Wish>) => {
          const old = payload.old as Wish;
          if (!old || typeof old.id !== 'string') return;
          if (hasInflight(scope.value, [old.id])) return;
          wishes.value = wishes.value.filter((w) => w.id !== old.id);
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

  onUnmounted(() => {
    teardown();
    clearScope(scope.value);
    window.clearTimeout(toastTimer);
  });

  return {
    wishes,
    pending,
    fulfilled,
    completionRate,
    mediaUrls,
    loading,
    errorToast,
    isMock,
    load,
    create,
    toggleFulfilled,
    attachImage,
    remove,
  };
}
