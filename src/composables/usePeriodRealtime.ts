import { onUnmounted, watch } from 'vue';
import type { Ref } from 'vue';
import { supabase } from '@/services/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { PeriodCycle } from '@/types/database';

/**
 * usePeriodRealtime — 生理期周期 Realtime 同步
 *
 * 场景（0013 迁移把 period_cycles 加入 supabase_realtime 发布后启用）：
 * 她两周才能用一次手机，他平时替她代录。她难得打开 App 时，
 * 需要**立刻看到他刚录入的周期**，而不是下拉刷新才出来；反过来他
 * 在生理期页也能实时看到她自己设备上的记录。
 *
 * 过滤键：period_cycles 按 user_id 分区（没有 couple_id 列）。
 * 无论本人视角（ownerId=自己）还是伴侣视角（ownerId=她），订阅
 * `user_id=eq.{ownerId}` 覆盖的正是该页展示的数据集，两端一致。
 *
 * 隐私：period_logs（含 private 打卡明细）**有意不订阅也不进发布**——
 * Supabase Realtime 的 postgres_changes 不逐行执行 RLS，私密内容进
 * 发布即泄漏。周期起止日期对伴侣本就全量可见（select 策略无附加条件），
 * 进发布不改变隐私边界。
 *
 * 幂等：applyRemoteCycle 按 id upsert，自己的写回环事件只是同值覆盖，
 * 无需 inflight 抑制。
 */
export interface PeriodRealtimeHandlers {
  onCycleUpsert: (row: PeriodCycle) => void;
  onCycleDelete: (id: string) => void;
}

export function usePeriodRealtime(
  ownerId: Ref<string | null>,
  handlers: PeriodRealtimeHandlers,
): void {
  let channel: RealtimeChannel | null = null;

  function teardown(): void {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  }

  function isCycleRow(row: unknown): row is PeriodCycle {
    return (
      typeof row === 'object' &&
      row !== null &&
      'id' in row &&
      typeof (row as { id: unknown }).id === 'string'
    );
  }

  function subscribe(id: string): void {
    teardown();
    channel = supabase
      .channel(`period-cycles-${id}`)
      .on<PeriodCycle>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'period_cycles', filter: `user_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<PeriodCycle>) => {
          if (isCycleRow(payload.new)) handlers.onCycleUpsert(payload.new);
        },
      )
      .on<PeriodCycle>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'period_cycles', filter: `user_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<PeriodCycle>) => {
          if (isCycleRow(payload.new)) handlers.onCycleUpsert(payload.new);
        },
      )
      .on<PeriodCycle>(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'period_cycles', filter: `user_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<PeriodCycle>) => {
          if (isCycleRow(payload.old)) handlers.onCycleDelete(payload.old.id);
        },
      )
      .subscribe();
  }

  watch(
    ownerId,
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
}
