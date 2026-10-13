import { computed, ref, shallowRef } from 'vue';
import type { Ref } from 'vue';
import type { PeriodCycle, PeriodLog } from '@/types/database';
import { buildPeriodMock } from '@/mocks/periodMock';
import { networkFirst } from '@/services/offlineStorage';
import {
  deleteCycle,
  deleteLog,
  listRecentCycles,
  listRecentLogs,
  startCycle,
  updateCycle,
  upsertLog,
} from '@/services/periodService';
import type { PeriodLogInput } from '@/services/periodService';
import { buildCycleModel } from '@/composables/usePeriodCalculator';
import { DEFAULT_TIMEZONE, todayInTimezone } from '@/utils/date';

/**
 * usePeriod — 生理期模块业务逻辑层
 *
 * - periodOwnerId：数据归属人（本人视角 = 自己；伴侣关怀视角 = 伴侣）；
 * - 伴侣视角严格只读周期统计，绝不查询 period_logs；
 * - 乐观更新 + 失败回滚 + 温和提示 + Mock 兜底，与其他模块同构。
 */
export function usePeriod(
  periodOwnerId: Ref<string | null>,
  isPartnerView: Ref<boolean>,
  timezone: Ref<string> = ref(DEFAULT_TIMEZONE),
) {
  const cycles = ref<PeriodCycle[]>([]);
  // PeriodLog.symptoms 为递归 Json 类型，深响应解包会导致 TS2589；
  // 本列表只做整体替换，不做嵌套变更，shallowRef 语义正确
  const logs = shallowRef<PeriodLog[]>([]);
  const loading = ref(false);
  const errorToast = ref<string | null>(null);

  const isMock = computed(() => periodOwnerId.value === null);
  const today = computed(() => todayInTimezone(timezone.value));

  const model = computed(() => buildCycleModel(cycles.value, today.value));
  const ongoingCycle = computed(
    () => cycles.value.find((c) => c.end_date === null) ?? null,
  );
  /** 已闭合周期（新→旧） */
  const closedCycles = computed(() =>
    cycles.value.filter((c) => c.end_date !== null),
  );

  let toastTimer: number | undefined;
  function showToast(message: string): void {
    errorToast.value = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      errorToast.value = null;
    }, 2500);
  }

  // ---------------------------------------------------------------- 加载

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const ownerId = periodOwnerId.value;
      if (!ownerId) {
        const mock = buildPeriodMock();
        cycles.value = mock.cycles;
        logs.value = mock.logs;
        return;
      }
      // 网络优先 + 离线快照回退；隐私红线：伴侣视角不拉取任何打卡明细
      const partnerView = isPartnerView.value;
      const result = await networkFirst('cached_period_state', async () => ({
        cycles: await listRecentCycles(ownerId),
        logs: partnerView ? [] : await listRecentLogs(ownerId),
      }));
      cycles.value = result.data.cycles;
      logs.value = result.data.logs;
    } catch {
      const mock = buildPeriodMock();
      cycles.value = mock.cycles;
      logs.value = mock.logs;
      showToast('网络异常，已切换为本地示例数据');
    } finally {
      loading.value = false;
    }
  }

  // ---------------------------------------------------------------- 周期快捷操作

  async function startCycleToday(): Promise<void> {
    if (ongoingCycle.value) {
      showToast('已有进行中的经期，无需重复开始');
      return;
    }
    const date = today.value;
    if (isMock.value || !periodOwnerId.value) {
      const now = new Date().toISOString();
      cycles.value = [
        {
          id: crypto.randomUUID(),
          user_id: periodOwnerId.value ?? 'mock-partner',
          start_date: date,
          end_date: null,
          cycle_length_days: model.value.insight.avgCycleLength,
          period_length_days: model.value.insight.avgPeriodLength,
          created_at: now,
          updated_at: now,
        },
        ...cycles.value,
      ];
      return;
    }
    try {
      const created = await startCycle(periodOwnerId.value, date);
      cycles.value = [created, ...cycles.value];
    } catch {
      showToast('记录失败，请检查网络后重试');
    }
  }

  async function endCycleToday(): Promise<void> {
    const ongoing = ongoingCycle.value;
    if (!ongoing) return;
    const date = today.value;
    const backup = cycles.value;
    cycles.value = cycles.value.map((c) =>
      c.id === ongoing.id ? { ...c, end_date: date } : c,
    );
    if (isMock.value) return;
    try {
      await updateCycle(ongoing.id, { end_date: date });
    } catch {
      cycles.value = backup;
      showToast('操作失败，已恢复原状态');
    }
  }

  async function saveCycle(
    id: string | null,
    patch: { start_date: string; end_date: string | null },
  ): Promise<boolean> {
    if (isMock.value || !periodOwnerId.value) {
      const now = new Date().toISOString();
      if (id) {
        cycles.value = cycles.value.map((c) => (c.id === id ? { ...c, ...patch } : c));
      } else {
        cycles.value = [
          {
            id: crypto.randomUUID(),
            user_id: periodOwnerId.value ?? 'mock-partner',
            cycle_length_days: model.value.insight.avgCycleLength,
            period_length_days: model.value.insight.avgPeriodLength,
            created_at: now,
            updated_at: now,
            ...patch,
          },
          ...cycles.value,
        ];
      }
      return true;
    }
    try {
      if (id) {
        const updated = await updateCycle(id, patch);
        cycles.value = cycles.value.map((c) => (c.id === id ? updated : c));
      } else {
        const created = await startCycle(periodOwnerId.value, patch.start_date);
        if (patch.end_date) {
          const closed = await updateCycle(created.id, { end_date: patch.end_date });
          cycles.value = [closed, ...cycles.value];
        } else {
          cycles.value = [created, ...cycles.value];
        }
      }
      return true;
    } catch {
      showToast('保存失败，请检查网络后重试');
      return false;
    }
  }

  async function removeCycle(id: string): Promise<void> {
    const backup = cycles.value;
    cycles.value = cycles.value.filter((c) => c.id !== id);
    if (isMock.value) return;
    try {
      await deleteCycle(id);
    } catch {
      cycles.value = backup;
      showToast('删除失败，已恢复');
    }
  }

  // ---------------------------------------------------------------- 打卡

  function logFor(date: string): PeriodLog | undefined {
    return logs.value.find((l) => l.log_date === date);
  }

  async function saveLog(input: Omit<PeriodLogInput, 'user_id'>): Promise<boolean> {
    if (!periodOwnerId.value && !isMock.value) return false;
    if (isMock.value) {
      const now = new Date().toISOString();
      const local: PeriodLog = {
        id: logFor(input.log_date)?.id ?? crypto.randomUUID(),
        user_id: 'mock-partner',
        created_at: now,
        updated_at: now,
        ...input,
      };
      logs.value = [local, ...logs.value.filter((l) => l.log_date !== input.log_date)];
      return true;
    }
    const ownerId = periodOwnerId.value;
    if (!ownerId) return false;
    try {
      const saved = await upsertLog({ ...input, user_id: ownerId });
      logs.value = [saved, ...logs.value.filter((l) => l.log_date !== input.log_date)];
      return true;
    } catch {
      showToast('打卡失败，请检查网络后重试');
      return false;
    }
  }

  async function removeLog(id: string): Promise<void> {
    const backup = logs.value;
    logs.value = logs.value.filter((l) => l.id !== id);
    if (isMock.value) return;
    try {
      await deleteLog(id);
    } catch {
      logs.value = backup;
      showToast('删除失败，已恢复');
    }
  }

  return {
    cycles,
    logs,
    model,
    ongoingCycle,
    closedCycles,
    loading,
    errorToast,
    isMock,
    today,
    load,
    startCycleToday,
    endCycleToday,
    saveCycle,
    removeCycle,
    logFor,
    saveLog,
    removeLog,
  };
}
