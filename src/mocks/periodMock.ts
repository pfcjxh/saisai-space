import type { PeriodCycle, PeriodLog } from '@/types/database';

/**
 * 生理期演示数据（与 Today 仪表盘同源）：
 * 8月25日开始、9月8日结束；记录不足 2 次，推算走默认均值。
 */
export interface PeriodMock {
  cycles: PeriodCycle[];
  logs: PeriodLog[];
}

export function buildPeriodMock(): PeriodMock {
  const now = new Date().toISOString();

  const cycles: PeriodCycle[] = [
    {
      id: 'mock-cycle-1',
      user_id: 'mock-partner',
      start_date: '2026-08-25',
      end_date: '2026-09-08',
      cycle_length_days: 28,
      period_length_days: 5,
      recorded_by: 'mock-partner',
      created_at: now,
      updated_at: now,
    },
  ];

  const logs: PeriodLog[] = [
    {
      id: 'mock-log-1',
      cycle_id: 'mock-cycle-1',
      user_id: 'mock-partner',
      log_date: '2026-08-26',
      flow_level: 3,
      pain_level: 2,
      mood: 'tired',
      symptoms: ['腰酸', '疲惫'],
      visibility: 'shared',
      notes: null,
      recorded_by: 'mock-partner',
      created_at: now,
      updated_at: now,
    },
  ];

  return { cycles, logs };
}
