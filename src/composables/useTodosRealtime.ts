import { onUnmounted, watch } from 'vue';
import type { Ref } from 'vue';
import { supabase } from '@/services/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Todo } from '@/types/database';
import { hasInflight, writeScope } from '@/utils/inflight';

/**
 * useTodosRealtime — 待办 Realtime 双向同步引擎
 *
 * - 频道隔离：couple-todos-{couple_id}，filter 精确到空间；
 * - 生命周期：coupleId 变化自动重订阅，组件卸载时显式 removeChannel，
 *   杜绝重复监听与后台连接泄漏；
 * - Mock 模式（coupleId 为 null）不建立任何连接。
 */
export interface TodosRealtimeHandlers {
  onInsert: (row: Todo) => void;
  onUpdate: (row: Todo) => void;
  onDelete: (id: string) => void;
}

export function useTodosRealtime(
  coupleId: Ref<string | null>,
  handlers: TodosRealtimeHandlers,
): void {
  let channel: RealtimeChannel | null = null;

  function teardown(): void {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  }

  function isTodoRow(row: unknown): row is Todo {
    return (
      typeof row === 'object' &&
      row !== null &&
      'id' in row &&
      typeof (row as { id: unknown }).id === 'string'
    );
  }

  function subscribe(id: string): void {
    teardown();
    const scope = writeScope('todos', id);
    channel = supabase
      .channel(`couple-todos-${id}`)
      .on<Todo>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'todos', filter: `couple_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<Todo>) => {
          if (isTodoRow(payload.new)) handlers.onInsert(payload.new);
        },
      )
      .on<Todo>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'todos', filter: `couple_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<Todo>) => {
          if (!isTodoRow(payload.new)) return;
          // 回环抑制：本行有在途写入时以本地乐观值为准
          if (hasInflight(scope, [payload.new.id])) return;
          handlers.onUpdate(payload.new);
        },
      )
      .on<Todo>(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'todos', filter: `couple_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<Todo>) => {
          if (!isTodoRow(payload.old)) return;
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
