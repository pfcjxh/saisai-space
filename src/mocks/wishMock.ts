import type { Wish } from '@/types/database';

/** 心愿演示数据：2 条进行中 + 2 条已达成配图 */
export function buildWishMock(): Wish[] {
  const now = new Date().toISOString();
  const base = {
    couple_id: 'mock-couple',
    created_at: now,
    updated_at: now,
  };

  return [
    {
      ...base,
      id: 'mock-wish-1',
      title: '一起去海边看日出',
      description: '要带厚外套，凌晨四点出发',
      is_fulfilled: false,
      fulfilled_at: null,
      image_path: null,
      category: 'travel',
      created_by: 'mock-me',
    },
    {
      ...base,
      id: 'mock-wish-2',
      title: '吃一次正宗寿喜烧',
      description: null,
      is_fulfilled: false,
      fulfilled_at: null,
      image_path: null,
      category: 'food',
      created_by: 'mock-partner',
    },
    {
      ...base,
      id: 'mock-wish-3',
      title: '看一场跨年烟花',
      description: '在江边，人很多但很暖',
      is_fulfilled: true,
      fulfilled_at: '2026-01-01T00:12:00+08:00',
      image_path: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=900&q=80',
      category: 'experience',
      created_by: 'mock-me',
    },
    {
      ...base,
      id: 'mock-wish-4',
      title: '养一只猫',
      description: '橘猫优先',
      is_fulfilled: true,
      fulfilled_at: '2026-06-18T19:30:00+08:00',
      image_path: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=900&q=80',
      category: 'purchase',
      created_by: 'mock-partner',
    },
  ];
}
