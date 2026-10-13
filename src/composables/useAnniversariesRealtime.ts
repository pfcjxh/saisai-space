import { onUnmounted, watch } from 'vue';
import type { Ref } from 'vue';
import { supabase } from '@/services/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Anniversary } from '@/types/database';
import { hasInflight, writeScope } from '@/utils/inflight';

/**
 * useAnniversariesRealtime — 纪念日 Realtime 同步
 * 频道 couple-anniversaries-{couple_id}；卸载时显式 removeChannel；
 * Mock 模式（coupleId 为 null）不建立连接。
 */
export interface AnniversariesRealtimeHandlers {
  onInsert: (row: Anniversary) => void;
  onUpdate: (row: Anniversary) => void;
  onDelete: (id: string) => void;
}

export function useAnniversariesRealtime(
  coupleId: Ref<string | null>,
  handlers: AnniversariesRealtimeHandlers,
): void {
  let channel: RealtimeChannel | null = null;

  function teardown(): void {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  }

  function isAnniversaryRow(row: unknown): row is Anniversary {
    return (
      typeof row === 'object' &&
      row !== null &&
      'id' in row &&
      typeof (row as { id: unknown }).id === 'string'
    );
  }

  function subscribe(id: string): void {
    teardown();
    const scope = writeScope('anniversaries', id);
    channel = supabase
      .channel(`couple-anniversaries-${id}`)
      .on<Anniversary>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'anniversaries',
          filter: `couple_id=eq.${id}`,
        },
        (payload: RealtimePostgresChangesPayload<Anniversary>) => {
          if (isAnniversaryRow(payload.new)) handlers.onInsert(payload.new);
        },
      )
      .on<Anniversary>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'anniversaries',
          filter: `couple_id=eq.${id}`,
        },
        (payload: RealtimePostgresChangesPayload<Anniversary>) => {
          if (!isAnniversaryRow(payload.new)) return;
          // 回环抑制：本行有在途写入时以本地乐观值为准
          if (hasInflight(scope, [payload.new.id])) return;
          handlers.onUpdate(payload.new);
        },
      )
      .on<Anniversary>(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'anniversaries',
          filter: `couple_id=eq.${id}`,
        },
        (payload: RealtimePostgresChangesPayload<Anniversary>) => {
          if (!isAnniversaryRow(payload.old)) return;
          if (hasInflight(scope, [payload.old.id])) return;
          handlers.onDelete(payload.old.id);
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
}
