import { supabase } from './supabase';
import type { RecurrenceRule, Todo, TodoCategory, TodoPriority } from '@/types/database';

/**
 * todoService — 共享待办数据收敛层。
 * 页面组件禁止直连 supabase 拼查询，一律经由本模块。
 * RLS：空间成员可读写删，归属校验由数据库层兜底。
 */

export interface CreateTodoInput {
  couple_id: string;
  title: string;
  description: string | null;
  category: TodoCategory;
  priority: TodoPriority;
  recurrence_rule: RecurrenceRule;
  assigned_to: string | null;
  due_date: string | null;
  created_by: string;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string | null;
  category?: TodoCategory;
  priority?: TodoPriority;
  recurrence_rule?: RecurrenceRule;
  assigned_to?: string | null;
  due_date?: string | null;
}

/** 读取空间全部待办：未完成在前，各自按创建时间倒序 */
export async function listTodos(coupleId: string): Promise<Todo[]> {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('couple_id', coupleId)
    .order('is_completed', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** 首页速览：未完成 + 到期升序（无到期排后），默认前 2 条 */
export async function listPendingTodos(coupleId: string, limit = 2): Promise<Todo[]> {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('couple_id', coupleId)
    .eq('is_completed', false)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  const { data, error } = await supabase.from('todos').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateTodo(todoId: string, patch: UpdateTodoInput): Promise<Todo> {
  const { data, error } = await supabase
    .from('todos')
    .update(patch)
    .eq('id', todoId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setTodoCompleted(todoId: string, completed: boolean): Promise<void> {
  const { error } = await supabase
    .from('todos')
    .update({ is_completed: completed })
    .eq('id', todoId);
  if (error) throw error;
}

export async function deleteTodo(todoId: string): Promise<void> {
  const { error } = await supabase.from('todos').delete().eq('id', todoId);
  if (error) throw error;
}
