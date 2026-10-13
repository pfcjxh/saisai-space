import type { Todo } from '@/types/database';
import { addDays, todayInTimezone } from '@/utils/date';

/**
 * 待办演示数据：未登录/未配对/离线时注入，操作仅本地生效。
 * 样例即产品语言：电瓶车充电（每周日）、记账（每天）。
 */
export function buildTodoMock(): Todo[] {
  const today = todayInTimezone('Asia/Shanghai');
  const now = new Date().toISOString();
  const base = {
    couple_id: 'mock-couple',
    created_by: 'mock-me',
    created_at: now,
    updated_at: now,
  };

  // 下一个周日作为每周循环的 due_date 载体
  const weekday = new Date(`${today}T00:00:00`).getDay();
  const nextSunday = addDays(today, (7 - weekday) % 7 || 7);

  return [
    {
      ...base,
      id: 'mock-todo-charge',
      title: '给电瓶车充电',
      description: '记得充到 90% 以上再拔',
      category: 'recharge',
      priority: 'normal',
      assigned_to: null,
      is_completed: false,
      recurrence_rule: 'weekly',
      due_date: `${nextSunday}T12:00:00+08:00`,
    },
    {
      ...base,
      id: 'mock-todo-bill',
      title: '记账',
      description: null,
      category: 'bill',
      priority: 'normal',
      assigned_to: null,
      is_completed: false,
      recurrence_rule: 'daily',
      due_date: null,
    },
    {
      ...base,
      id: 'mock-todo-movie',
      title: '一起看一场电影',
      description: '挑一部她喜欢的',
      category: 'date',
      priority: 'important',
      assigned_to: null,
      is_completed: true,
      recurrence_rule: 'none',
      due_date: null,
    },
  ];
}
