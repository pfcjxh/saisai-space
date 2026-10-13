import type { Anniversary } from '@/types/database';
import { todayInTimezone } from '@/utils/date';

/** 纪念日演示数据：未登录/未配对/离线时注入 */
export function buildAnniversaryMock(): Anniversary[] {
  const today = todayInTimezone('Asia/Shanghai');
  const now = new Date().toISOString();
  const year = Number(today.slice(0, 4));
  const base = {
    couple_id: 'mock-couple',
    created_by: 'mock-me',
    created_at: now,
    updated_at: now,
  };

  return [
    {
      ...base,
      id: 'mock-ann-birthday',
      title: '老婆生日',
      target_date: `${year}-07-26`,
      is_lunar: false,
      repeat_yearly: true,
      category: 'birthday',
      pinned: true,
    },
    {
      ...base,
      // 真实纪念日：2026-08-16 在一起
      id: 'mock-ann-together',
      title: '在一起',
      target_date: '2026-08-16',
      is_lunar: false,
      repeat_yearly: true,
      category: 'anniversary',
      pinned: false,
    },
    {
      ...base,
      // 真实纪念日：2026-08-07 相识
      id: 'mock-ann-met',
      title: '相识日',
      target_date: '2026-08-07',
      is_lunar: false,
      repeat_yearly: true,
      category: 'anniversary',
      pinned: false,
    },
    {
      ...base,
      id: 'mock-ann-spring',
      title: '一起过年',
      target_date: `${year}-01-29`,
      is_lunar: true,
      repeat_yearly: true,
      category: 'holiday',
      pinned: false,
    },
  ];
}
