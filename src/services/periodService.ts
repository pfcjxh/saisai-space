import { supabase } from './supabase';
import type {
  FlowLevel,
  Json,
  Mood,
  PainLevel,
  PeriodCycle,
  PeriodLog,
  PeriodVisibility,
} from '@/types/database';

/**
 * periodService — 生理期双表数据收敛层。
 * RLS 兜底：period_cycles 伴侣只读基础统计；period_logs 的 private 记录
 * 在数据库层面对伴侣完全拦截（本服务亦不提供伴侣侧日志查询入口）。
 */

// ---------------------------------------------------------------- 周期

export async function listRecentCycles(userId: string, limit = 12): Promise<PeriodCycle[]> {
  const { data, error } = await supabase
    .from('period_cycles')
    .select('*')
    .eq('user_id', userId)
    .order('start_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function startCycle(userId: string, startDate: string): Promise<PeriodCycle> {
  const { data, error } = await supabase
    .from('period_cycles')
    .insert({ user_id: userId, start_date: startDate, end_date: null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCycle(
  cycleId: string,
  patch: { start_date?: string; end_date?: string | null },
): Promise<PeriodCycle> {
  const { data, error } = await supabase
    .from('period_cycles')
    .update(patch)
    .eq('id', cycleId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCycle(cycleId: string): Promise<void> {
  const { error } = await supabase.from('period_cycles').delete().eq('id', cycleId);
  if (error) throw error;
}

// ---------------------------------------------------------------- 单日打卡

export interface PeriodLogInput {
  user_id: string;
  log_date: string;
  cycle_id: string | null;
  flow_level: FlowLevel | null;
  pain_level: PainLevel | null;
  mood: Mood | null;
  symptoms: string[];
  visibility: PeriodVisibility;
  notes: string | null;
}

/** 近 N 天打卡记录（仅本人视角调用） */
export async function listRecentLogs(userId: string, limit = 90): Promise<PeriodLog[]> {
  const { data, error } = await supabase
    .from('period_logs')
    .select('*')
    .eq('user_id', userId)
    .order('log_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** 同日唯一（user_id + log_date），重复打卡即覆盖更新 */
export async function upsertLog(input: PeriodLogInput): Promise<PeriodLog> {
  const { data, error } = await supabase
    .from('period_logs')
    .upsert(
      { ...input, symptoms: input.symptoms as Json },
      { onConflict: 'user_id,log_date' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLog(logId: string): Promise<void> {
  const { error } = await supabase.from('period_logs').delete().eq('id', logId);
  if (error) throw error;
}
