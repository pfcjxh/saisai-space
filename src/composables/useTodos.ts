import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import type { Todo } from '@/types/database';
import { buildTodoMock } from '@/mocks/todoMock';
import { networkFirst } from '@/services/offlineStorage';
import {
  createTodo,
  deleteTodo,
  listTodos,
  setTodoCompleted,
  updateTodo,
} from '@/services/todoService';
import type { CreateTodoInput, UpdateTodoInput } from '@/services/todoService';

/**
 * useTodos — 待办业务逻辑层
 *
 * - 乐观更新：勾选先划线动画（400ms）再落库，失败回滚并弹温和提示；
 * - Mock 兜底：coupleId 为 null（未登录/未配对）时仅操作本地状态；
 * - Realtime 远端事件通过 applyRemote* 注入，与本地操作去重合并。
 */

export type TodoCreatePayload = Omit<CreateTodoInput, 'couple_id' | 'created_by'>;

export function useTodos(coupleId: Ref<string | null>, myUserId: Ref<string | null>) {
  const todos = ref<Todo[]>([]);
  const loading = ref(false);
  const errorToast = ref<string | null>(null);
  /** 正在播放完成划线动画的任务 id */
  const completingIds = ref<ReadonlySet<string>>(new Set());

  const isMock = computed(() => coupleId.value === null);

  const pending = computed(() => todos.value.filter((t) => !t.is_completed));
  const completed = computed(() =>
    todos.value
      .filter((t) => t.is_completed)
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)),
  );

  // ---------------------------------------------------------------- 提示条

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
      const cid = coupleId.value;
      if (!cid) {
        todos.value = buildTodoMock();
        return;
      }
      // 网络优先 + 5s 超时；离线自动回退本地快照（再失败才 Mock 兜底）
      const result = await networkFirst('cached_todos', () => listTodos(cid));
      todos.value = result.data;
    } catch {
      todos.value = buildTodoMock();
      showToast('网络异常，已切换为本地示例数据');
    } finally {
      loading.value = false;
    }
  }

  // ---------------------------------------------------------------- 勾选（乐观更新）

  function toggle(todo: Todo): void {
    if (completingIds.value.has(todo.id)) return;
    completingIds.value = new Set(completingIds.value).add(todo.id);

    window.setTimeout(() => {
      const done = !todo.is_completed;
      todos.value = todos.value.map((t) =>
        t.id === todo.id
          ? { ...t, is_completed: done, updated_at: new Date().toISOString() }
          : t,
      );
      const next = new Set(completingIds.value);
      next.delete(todo.id);
      completingIds.value = next;

      if (isMock.value) return;
      setTodoCompleted(todo.id, done).catch(() => {
        todos.value = todos.value.map((t) =>
          t.id === todo.id ? { ...t, is_completed: !done } : t,
        );
        showToast('同步失败，已恢复原状态');
      });
    }, 400);
  }

  // ---------------------------------------------------------------- 创建 / 编辑 / 删除

  async function create(payload: TodoCreatePayload): Promise<boolean> {
    if (isMock.value) {
      const now = new Date().toISOString();
      const local: Todo = {
        id: crypto.randomUUID(),
        couple_id: 'mock-couple',
        created_by: myUserId.value ?? 'mock-me',
        is_completed: false,
        created_at: now,
        updated_at: now,
        ...payload,
      };
      todos.value = [local, ...todos.value];
      return true;
    }
    const cid = coupleId.value;
    const uid = myUserId.value;
    if (!cid || !uid) return false;
    try {
      const created = await createTodo({ ...payload, couple_id: cid, created_by: uid });
      // 本地插入与 Realtime INSERT 事件去重
      if (!todos.value.some((t) => t.id === created.id)) {
        todos.value = [created, ...todos.value];
      }
      return true;
    } catch {
      showToast('创建失败，请检查网络后重试');
      return false;
    }
  }

  async function update(todoId: string, patch: UpdateTodoInput): Promise<boolean> {
    const backup = todos.value.find((t) => t.id === todoId);
    if (!backup) return false;
    todos.value = todos.value.map((t) => (t.id === todoId ? { ...t, ...patch } : t));
    if (isMock.value) return true;
    try {
      const updated = await updateTodo(todoId, patch);
      todos.value = todos.value.map((t) => (t.id === todoId ? updated : t));
      return true;
    } catch {
      todos.value = todos.value.map((t) => (t.id === todoId ? backup : t));
      showToast('保存失败，已恢复原内容');
      return false;
    }
  }

  async function remove(todoId: string): Promise<void> {
    const backup = todos.value;
    todos.value = todos.value.filter((t) => t.id !== todoId);
    if (isMock.value) return;
    try {
      await deleteTodo(todoId);
    } catch {
      todos.value = backup;
      showToast('删除失败，已恢复');
    }
  }

  // ---------------------------------------------------------------- Realtime 远端事件注入口

  function applyRemoteInsert(row: Todo): void {
    if (todos.value.some((t) => t.id === row.id)) return;
    todos.value = [row, ...todos.value];
  }

  function applyRemoteUpdate(row: Todo): void {
    todos.value = todos.value.map((t) => (t.id === row.id ? row : t));
  }

  function applyRemoteDelete(id: string): void {
    todos.value = todos.value.filter((t) => t.id !== id);
  }

  return {
    todos,
    pending,
    completed,
    loading,
    errorToast,
    completingIds,
    isMock,
    load,
    toggle,
    create,
    update,
    remove,
    applyRemoteInsert,
    applyRemoteUpdate,
    applyRemoteDelete,
  };
}
