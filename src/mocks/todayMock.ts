import type { Anniversary, Couple, PeriodCycle, Profile, Todo } from '@/types/database';
import { addDays, todayInTimezone } from '@/utils/date';

/**
 * Today Dashboard 演示数据：
 * 仅在用户未登录或尚未完成配对时注入，保证界面永远完整可用、杜绝白屏。
 * 所有日期基于"今天"动态推导，永不失效。
 */
export interface TodayMock {
  me: Profile;
  partner: Profile;
  couple: Couple;
  todos: Todo[];
  anniversaries: Anniversary[];
  cycles: PeriodCycle[];
}

export function buildTodayMock(): TodayMock {
  const today = todayInTimezone('Asia/Shanghai');
  const now = new Date().toISOString();

  const me: Profile = {
    id: 'mock-me',
    nickname: '我',
    avatar_url: null,
    timezone: 'Asia/Shanghai',
    weather_city: '深圳',
    weather_lat: null,
    weather_lon: null,
    mood: 'calm',
    mood_updated_at: now,
    gender: 'male',
    notify_diary: true,
    notify_anniversary: true,
    notify_period: true,
    created_at: now,
    updated_at: now,
  };

  const partner: Profile = {
    id: 'mock-partner',
    nickname: 'TA',
    avatar_url: null,
    timezone: 'Asia/Shanghai',
    weather_city: '莱阳',
    weather_lat: null,
    weather_lon: null,
    mood: 'happy',
    mood_updated_at: now,
    gender: 'female',
    notify_diary: true,
    notify_anniversary: true,
    notify_period: true,
    created_at: now,
    updated_at: now,
  };

  const couple: Couple = {
    id: 'mock-couple',
    invite_code: 'SAI520',
    // 真实纪念日：2026-08-16 在一起
    relationship_started_at: '2026-08-16',
    created_by: me.id,
    created_at: now,
    updated_at: now,
  };

  const todos: Todo[] = [
    {
      id: 'mock-todo-1',
      couple_id: couple.id,
      title: '下班带一束花回家',
      description: null,
      category: 'daily',
      priority: 'normal',
      assigned_to: partner.id,
      is_completed: false,
      recurrence_rule: 'none',
      due_date: null,
      created_by: me.id,
      created_at: now,
      updated_at: now,
    },
  ];

  const anniversaries: Anniversary[] = [
    {
      id: 'mock-anniversary-1',
      couple_id: couple.id,
      title: '在一起一周年',
      target_date: addDays(today, 24),
      is_lunar: false,
      repeat_yearly: true,
      category: 'anniversary',
      pinned: false,
      created_by: me.id,
      created_at: now,
      updated_at: now,
    },
  ];

  // 她的经期记录：8月25日左右开始，9月8日左右结束；
  // 周期不稳定、一般月初前后。记录不足 2 次，推算走默认均值（28/5）
  const cycles: PeriodCycle[] = [
    {
      id: 'mock-cycle-1',
      user_id: partner.id,
      start_date: '2026-08-25',
      end_date: '2026-09-08',
      cycle_length_days: 28,
      period_length_days: 15,
      created_at: now,
      updated_at: now,
    },
  ];

  return { me, partner, couple, todos, anniversaries, cycles };
}
