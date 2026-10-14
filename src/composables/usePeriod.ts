import { computed, ref, shallowRef } from 'vue';
import type { Ref } from 'vue';
import type { PeriodCycle, PeriodLog } from '@/types/database';
import { buildPeriodMock } from '@/mocks/periodMock';
import { networkFirst } from '@/services/offlineStorage';
import {
  createCycle,
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
 * - myUserId：**当前登录用户**。与 periodOwnerId 不同时即为「代录」，
 *   写入时记录 recorded_by 以便追溯是谁录的；
 * - 伴侣视角可读可写（代录），但读取仍受 RLS 约束：她主动标记 private
 *   且非伴侣录入的记录不可见；
 * - 乐观更新 + 失败回滚 + 温和提示 + Mock 兜底，与其他模块同构。
 */
export function usePeriod(
  periodOwnerId: Ref<string | null>,
  isPartnerView: Ref<boolean>,
  timezone: Ref<string> = ref(DEFAULT_TIMEZONE),
  myUserId: Ref<string | null> = ref(null),
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
      // 网络优先 + 离线快照回退。
      // 代录支持（v0011 起）：伴侣视角**也拉取**打卡明细 —— RLS 已放行
      // 「她标记为 shared」或「伴侣本人录入」的记录；她主动标 private 且
      // 非伴侣录入的内容仍在数据库层被截断，不会出现在结果里。
      // 因此这里不再需要前端硬过滤，交给 RLS 决定可见性。
      const result = await networkFirst('cached_period_state', async () => ({
        cycles: await listRecentCycles(ownerId),
        logs: await listRecentLogs(ownerId),
      }));
      cycles.value = result.data.cycles;
      // 快照回退路径仍需过滤：本机缓存可能是「本人时期」写入的，
      // 换到伴侣视角后不应把当时缓存下来的 private 明细渲染出来。
      // 本人视角无需过滤（RLS 已保证只返回自己的数据）。
      logs.value =
        isPartnerView.value && result.fromCache
          ? result.data.logs.filter(
              (l) => l.visibility === 'shared' || l.recorded_by === myUserId.value,
            )
          : result.data.logs;
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
          recorded_by: myUserId.value,
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
            recorded_by: myUserId.value,
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
        // 单条 INSERT 一次成型（含补录闭合）：避免「先开后关」双事件推送
        const created = await createCycle(periodOwnerId.value, patch.start_date, patch.end_date);
        cycles.value = [created, ...cycles.value];
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
        recorded_by: myUserId.value,
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

  // ---------------------------------------------------------------- Realtime 合并
  // 伴侣（或本人另一台设备）的周期变更经 supabase_realtime 推来后，
  // 由这些函数幂等地并入本地列表，不重新走网络。归属判定已在 RLS 层完成
  // （period_cycles 对伴侣全量可见），此处只管「按 id 增/改/删」。

  /** 插入或覆盖一条周期（按 id 去重；维持列表 start_date 新→旧的既有约定） */
  function applyRemoteCycle(row: PeriodCycle): void {
    const idx = cycles.value.findIndex((c) => c.id === row.id);
    if (idx !== -1) {
      cycles.value = cycles.value.map((c) => (c.id === row.id ? row : c));
      return;
    }
    // 找到第一个 start_date 比新记录旧的插入点（保持新→旧）
    const insertAt = cycles.value.findIndex((c) => c.start_date < row.start_date);
    const next = [...cycles.value];
    next.splice(insertAt === -1 ? next.length : insertAt, 0, row);
    cycles.value = next;
  }

  function removeRemoteCycle(id: string): void {
    cycles.value = cycles.value.filter((c) => c.id !== id);
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
    applyRemoteCycle,
    removeRemoteCycle,
  };
}
