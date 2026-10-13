import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import type { Anniversary } from '@/types/database';
import { buildAnniversaryMock } from '@/mocks/anniversaryMock';
import { networkFirst } from '@/services/offlineStorage';
import {
  createAnniversary,
  deleteAnniversary,
  listAnniversaries,
  updateAnniversary,
} from '@/services/anniversaryService';
import type {
  CreateAnniversaryInput,
  UpdateAnniversaryInput,
} from '@/services/anniversaryService';
import { nextOccurrence } from '@/utils/lunar';
import { todayInTimezone } from '@/utils/date';

/**
 * useAnniversaries — 纪念日业务逻辑层
 * 与 useTodos 同构：乐观更新 + 失败回滚 + 温和提示 + Mock 兜底 +
 * Realtime 远端事件注入口（applyRemote*）。
 */

export type AnniversaryCreatePayload = Omit<
  CreateAnniversaryInput,
  'couple_id' | 'created_by'
>;

export interface AnniversaryView extends Anniversary {
  /** 下一次到期的公历日期与天数（一次性已过期事件 daysLeft 为负） */
  occurrenceDate: string;
  occurrenceDaysLeft: number;
}

export function useAnniversaries(coupleId: Ref<string | null>, myUserId: Ref<string | null>) {
  const items = ref<Anniversary[]>([]);
  const loading = ref(false);
  const errorToast = ref<string | null>(null);

  const isMock = computed(() => coupleId.value === null);
  const today = computed(() => todayInTimezone('Asia/Shanghai'));

  let toastTimer: number | undefined;
  function showToast(message: string): void {
    errorToast.value = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      errorToast.value = null;
    }, 2500);
  }

  /** 视图模型：附带到期换算，未来事件在前按天数升序，已过去的一次性事件殿后 */
  const views = computed<AnniversaryView[]>(() => {
    const upcoming: AnniversaryView[] = [];
    const past: AnniversaryView[] = [];
    for (const a of items.value) {
      const occ = nextOccurrence(a, today.value);
      if (!occ) continue;
      const view: AnniversaryView = {
        ...a,
        occurrenceDate: occ.date,
        occurrenceDaysLeft: occ.daysLeft,
      };
      if (occ.daysLeft >= 0) {
        upcoming.push(view);
      } else {
        past.push(view);
      }
    }
    upcoming.sort((a, b) => a.occurrenceDaysLeft - b.occurrenceDaysLeft);
    past.sort((a, b) => b.occurrenceDaysLeft - a.occurrenceDaysLeft);
    return [...upcoming, ...past];
  });

  const futureCount = computed(
    () => views.value.filter((v) => v.occurrenceDaysLeft >= 0).length,
  );

  // ---------------------------------------------------------------- 加载

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const cid = coupleId.value;
      if (!cid) {
        items.value = buildAnniversaryMock();
        return;
      }
      // 网络优先 + 离线快照回退
      const result = await networkFirst('cached_anniversaries', () => listAnniversaries(cid));
      items.value = result.data;
    } catch {
      items.value = buildAnniversaryMock();
      showToast('网络异常，已切换为本地示例数据');
    } finally {
      loading.value = false;
    }
  }

  // ---------------------------------------------------------------- 创建 / 编辑 / 删除

  async function create(payload: AnniversaryCreatePayload): Promise<boolean> {
    if (isMock.value) {
      const now = new Date().toISOString();
      const local: Anniversary = {
        id: crypto.randomUUID(),
        couple_id: 'mock-couple',
        created_by: myUserId.value ?? 'mock-me',
        created_at: now,
        updated_at: now,
        ...payload,
      };
      items.value = [local, ...items.value];
      return true;
    }
    const cid = coupleId.value;
    const uid = myUserId.value;
    if (!cid || !uid) return false;
    try {
      const created = await createAnniversary({ ...payload, couple_id: cid, created_by: uid });
      if (!items.value.some((a) => a.id === created.id)) {
        items.value = [created, ...items.value];
      }
      return true;
    } catch {
      showToast('创建失败，请检查网络后重试');
      return false;
    }
  }

  async function update(id: string, patch: UpdateAnniversaryInput): Promise<boolean> {
    const backup = items.value.find((a) => a.id === id);
    if (!backup) return false;
    items.value = items.value.map((a) => (a.id === id ? { ...a, ...patch } : a));
    if (isMock.value) return true;
    try {
      const updated = await updateAnniversary(id, patch);
      items.value = items.value.map((a) => (a.id === id ? updated : a));
      return true;
    } catch {
      items.value = items.value.map((a) => (a.id === id ? backup : a));
      showToast('保存失败，已恢复原内容');
      return false;
    }
  }

  async function remove(id: string): Promise<void> {
    const backup = items.value;
    items.value = items.value.filter((a) => a.id !== id);
    if (isMock.value) return;
    try {
      await deleteAnniversary(id);
    } catch {
      items.value = backup;
      showToast('删除失败，已恢复');
    }
  }

  // ---------------------------------------------------------------- Realtime 注入口

  function applyRemoteInsert(row: Anniversary): void {
    if (items.value.some((a) => a.id === row.id)) return;
    items.value = [row, ...items.value];
  }

  function applyRemoteUpdate(row: Anniversary): void {
    items.value = items.value.map((a) => (a.id === row.id ? row : a));
  }

  function applyRemoteDelete(id: string): void {
    items.value = items.value.filter((a) => a.id !== id);
  }

  return {
    items,
    views,
    futureCount,
    loading,
    errorToast,
    isMock,
    load,
    create,
    update,
    remove,
    applyRemoteInsert,
    applyRemoteUpdate,
    applyRemoteDelete,
  };
}
