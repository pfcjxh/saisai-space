import { computed, onUnmounted, ref, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Diary, DiaryComment, Mood } from '@/types/database';
import { buildDiaryMock } from '@/mocks/diaryMock';
import { networkFirst } from '@/services/offlineStorage';
import {
  commentsOf,
  createDiary,
  deleteDiary,
  imagesOf,
  listDiaries,
  updateDiary,
} from '@/services/diaryService';
import { resolveMediaUrls, removeMedia } from '@/services/storageService';
import { supabase } from '@/services/supabase';

/**
 * useDiaries — 共享日记业务逻辑层 + Realtime 通道
 * 频道 couple-diaries-{couple_id}；卸载显式 removeChannel；
 * 媒体 URL 经签名链路解析，Mock 外链直接透传。
 */
export interface DiaryCreatePayload {
  diary_date: string;
  title: string | null;
  content: string;
  mood: Mood | null;
  images: string[];
}

export function useDiaries(coupleId: Ref<string | null>, myUserId: Ref<string | null>) {
  const diaries = shallowRef<Diary[]>([]);
  const mediaUrls = ref<Record<string, string>>({});
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

  // ---------------------------------------------------------------- 媒体 URL

  async function resolveAll(list: Diary[]): Promise<void> {
    const paths = list.flatMap((d) => imagesOf(d));
    if (paths.length === 0) return;
    try {
      const resolved = await resolveMediaUrls(paths);
      mediaUrls.value = { ...mediaUrls.value, ...resolved };
    } catch {
      // 签名失败：图片位展示占位，不影响文字流
    }
  }

  // ---------------------------------------------------------------- 加载

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const cid = coupleId.value;
      if (!cid) {
        diaries.value = buildDiaryMock();
      } else {
        // 网络优先 + 离线快照回退（离线时图片可能占位，文字流保持可读）
        const result = await networkFirst('cached_recent_diaries', () => listDiaries(cid));
        diaries.value = result.data;
      }
      await resolveAll(diaries.value);
    } catch {
      diaries.value = buildDiaryMock();
      await resolveAll(diaries.value);
      showToast('网络异常，已切换为本地示例数据');
    } finally {
      loading.value = false;
    }
  }

  // ---------------------------------------------------------------- 创建 / 删除

  async function create(payload: DiaryCreatePayload): Promise<boolean> {
    if (isMock.value || !coupleId.value || !myUserId.value) {
      const now = new Date().toISOString();
      const local: Diary = {
        id: crypto.randomUUID(),
        couple_id: 'mock-couple',
        author_id: myUserId.value ?? 'mock-me',
        liked_by: [],
        comments: [],
        created_at: now,
        updated_at: now,
        ...payload,
      };
      diaries.value = [local, ...diaries.value];
      await resolveAll([local]);
      return true;
    }
    try {
      const created = await createDiary({
        id: crypto.randomUUID(),
        couple_id: coupleId.value,
        author_id: myUserId.value,
        ...payload,
      });
      diaries.value = [created, ...diaries.value];
      await resolveAll([created]);
      return true;
    } catch {
      showToast('发布失败，请检查网络后重试');
      return false;
    }
  }

  async function remove(diary: Diary): Promise<void> {
    const backup = diaries.value;
    diaries.value = diaries.value.filter((d) => d.id !== diary.id);
    if (isMock.value) return;
    try {
      await deleteDiary(diary.id);
      // 清理存储媒体（失败不阻断删除流程）
      for (const path of imagesOf(diary)) {
        removeMedia(path).catch(() => undefined);
      }
    } catch {
      diaries.value = backup;
      showToast('删除失败，已恢复');
    }
  }

  // ---------------------------------------------------------------- 互动（点赞 / 评论）

  async function toggleLike(diary: Diary): Promise<void> {
    const uid = myUserId.value;
    if (!uid) return;
    const liked = diary.liked_by.includes(uid);
    const next = liked
      ? diary.liked_by.filter((id) => id !== uid)
      : [...diary.liked_by, uid];
    const backup = diaries.value;
    diaries.value = diaries.value.map((d) => (d.id === diary.id ? { ...d, liked_by: next } : d));
    if (isMock.value) return;
    try {
      await updateDiary(diary.id, { liked_by: next });
    } catch {
      diaries.value = backup;
      showToast('操作失败，已恢复');
    }
  }

  async function addComment(diary: Diary, content: string, nickname: string): Promise<void> {
    const uid = myUserId.value;
    if (!uid) return;
    const comment: DiaryComment = {
      author_id: uid,
      nickname,
      content,
      created_at: new Date().toISOString(),
    };
    const next = [...commentsOf(diary), comment];
    const backup = diaries.value;
    diaries.value = diaries.value.map((d) =>
      d.id === diary.id
        ? { ...d, comments: next as unknown as Diary['comments'] }
        : d,
    );
    if (isMock.value) return;
    try {
      await updateDiary(diary.id, { comments: next });
    } catch {
      diaries.value = backup;
      showToast('回复失败，已恢复');
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
      .channel(`couple-diaries-${id}`)
      .on<Diary>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'diaries', filter: `couple_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<Diary>) => {
          // payload.new 为 T | {} 联合，JSONB 边界处显式收窄
          const row = payload.new as Diary;
          if (!row || typeof row.id !== 'string') return;
          if (diaries.value.some((d) => d.id === row.id)) return;
          diaries.value = [row, ...diaries.value];
          resolveAll([row]);
        },
      )
      .on<Diary>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'diaries', filter: `couple_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<Diary>) => {
          const row = payload.new as Diary;
          if (!row || typeof row.id !== 'string') return;
          diaries.value = diaries.value.map((d) => (d.id === row.id ? row : d));
        },
      )
      .on<Diary>(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'diaries', filter: `couple_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<Diary>) => {
          const old = payload.old as Diary;
          if (!old || typeof old.id !== 'string') return;
          diaries.value = diaries.value.filter((d) => d.id !== old.id);
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

  return {
    diaries,
    mediaUrls,
    loading,
    errorToast,
    isMock,
    load,
    create,
    remove,
    toggleLike,
    addComment,
  };
}
