import type { PeriodCycle } from '@/types/database';
import { addDays, daysBetween } from '@/utils/date';

/**
 * usePeriodCalculator — 生理期日历推算引擎（非医疗算法）
 *
 * - 加权历史均值：最近最多 5 个相邻周期间隔（开始日差）按"越近权重越高"
 *   计算平均周期长度；已闭合周期同理加权计算平均经期长度；
 *   记录不足时回落默认值（28 / 5），并以 usesDefaultAverages 透出文案说明。
 * - 四阶段模型：经期 / 排卵日（下次预测前 14 天）/ 易孕窗口（排卵日前 5 后 4）/
 *   卵泡期与黄体期。
 * - 推迟容错：超过预测日仍未记录新周期时 daysUntilNextPeriod 为负，界面展示
 *   "已推迟 N 天"，不产生异常。
 *
 * 仅供生活与日程参考，不可作为避孕或医学诊疗依据。
 */

export type CyclePhase = 'period' | 'follicular' | 'ovulation' | 'luteal';

export interface PeriodInsight {
  hasData: boolean;
  phase: CyclePhase | null;
  /** 当前周期第 N 天（从最近一次经期开始日计 1） */
  dayOfCycle: number;
  isOnPeriod: boolean;
  /** 经期第 N 天（仅 isOnPeriod 时有值） */
  periodDay: number | null;
  /** 距下次预计经期天数；负值表示已推迟 */
  daysUntilNextPeriod: number;
  avgCycleLength: number;
  avgPeriodLength: number;
  /** 下次预计经期开始日 YYYY-MM-DD */
  predictedNextStart: string | null;
  /** 已闭合周期数量 */
  closedCount: number;
  /** 记录不足，均值使用默认值（28/5） */
  usesDefaultAverages: boolean;
  /** 预测排卵日 YYYY-MM-DD */
  ovulationDate: string | null;
  /** 易孕窗口（排卵日前 5 天至后 4 天） */
  fertileWindow: { start: string; end: string } | null;
  /**
   * 预测波动窗口（±N 天）：
   * 由历史周期间隔的标准差推导——数据越多越准，波动越大区间越宽；
   * 0 表示高置信单日预测。
   */
  predictedWindowDays: number;
}

export interface PeriodRange {
  start: string;
  end: string;
  /** true = 预测经期段（未实际发生） */
  predicted: boolean;
}

export interface CycleModel {
  insight: PeriodInsight;
  /** 全部经期段（实际 + 预测），日历渲染用 */
  periodRanges: PeriodRange[];
  ovulationDate: string | null;
  fertileWindow: { start: string; end: string } | null;
}

const DEFAULT_CYCLE_LENGTH = 28;
const DEFAULT_PERIOD_LENGTH = 5;

const EMPTY: PeriodInsight = {
  hasData: false,
  phase: null,
  dayOfCycle: 0,
  isOnPeriod: false,
  periodDay: null,
  daysUntilNextPeriod: 0,
  avgCycleLength: DEFAULT_CYCLE_LENGTH,
  avgPeriodLength: DEFAULT_PERIOD_LENGTH,
  predictedNextStart: null,
  closedCount: 0,
  usesDefaultAverages: true,
  ovulationDate: null,
  fertileWindow: null,
  predictedWindowDays: 0,
};

/** 加权平均：values[0] 为最新，权重最高；越旧权重越低 */
function weightedAverage(values: number[], fallback: number, min: number, max: number): number {
  if (values.length === 0) return fallback;
  let sum = 0;
  let weightSum = 0;
  values.forEach((v, i) => {
    const w = values.length - i;
    sum += v * w;
    weightSum += w;
  });
  return Math.min(max, Math.max(min, Math.round(sum / weightSum)));
}

export function computePeriodInsight(cycles: PeriodCycle[], today: string): PeriodInsight {
  if (cycles.length === 0) return EMPTY;

  const sorted = [...cycles].sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  const latest = sorted[0];
  if (!latest) return EMPTY;

  // 周期长度：相邻开始日间隔（最多 5 个间隔 = 6 条记录），异常值剔除
  const intervals: number[] = [];
  for (let i = 0; i < sorted.length - 1 && intervals.length < 5; i++) {
    const curr = sorted[i];
    const prev = sorted[i + 1];
    if (!curr || !prev) continue;
    const gap = daysBetween(prev.start_date, curr.start_date);
    if (gap >= 15 && gap <= 90) intervals.push(gap);
  }
  const avgCycleLength = weightedAverage(intervals, DEFAULT_CYCLE_LENGTH, 15, 90);

  // 经期长度：已闭合周期（有 end_date），最多 6 条
  const closed = sorted
    .filter((c): c is PeriodCycle & { end_date: string } => c.end_date !== null)
    .slice(0, 6);
  const periodLengths = closed
    .map((c) => daysBetween(c.start_date, c.end_date) + 1)
    .filter((len) => len >= 1 && len <= 15);
  const avgPeriodLength = weightedAverage(periodLengths, DEFAULT_PERIOD_LENGTH, 1, 15);

  const dayOfCycle = daysBetween(latest.start_date, today) + 1;
  const predictedNextStart = addDays(latest.start_date, avgCycleLength);
  const daysUntilNextPeriod = daysBetween(today, predictedNextStart);

  // 经期判定：已闭合看 end_date 区间；进行中按平均经期长度估算
  const isOnPeriod = latest.end_date
    ? today >= latest.start_date && today <= latest.end_date
    : dayOfCycle >= 1 && dayOfCycle <= avgPeriodLength;

  const periodDay = isOnPeriod ? daysBetween(latest.start_date, today) + 1 : null;

  const ovulationDate = addDays(predictedNextStart, -14);
  const fertileWindow = {
    start: addDays(ovulationDate, -5),
    end: addDays(ovulationDate, 4),
  };

  // 排卵日 = 本周期第 (avgCycle - 14) 天
  const ovulationDay = avgCycleLength - 14;
  let phase: CyclePhase;
  if (isOnPeriod) {
    phase = 'period';
  } else if (dayOfCycle <= ovulationDay - 2) {
    phase = 'follicular';
  } else if (dayOfCycle <= ovulationDay + 1) {
    phase = 'ovulation';
  } else {
    phase = 'luteal';
  }

  return {
    hasData: true,
    phase,
    dayOfCycle,
    isOnPeriod,
    periodDay,
    daysUntilNextPeriod,
    avgCycleLength,
    avgPeriodLength,
    predictedNextStart,
    closedCount: closed.length,
    usesDefaultAverages: intervals.length === 0,
    ovulationDate,
    fertileWindow,
    predictedWindowDays: computeWindowDays(intervals),
  };
}

/**
 * 波动窗口：历史间隔的标准差（样本），
 * 记录不足 2 个间隔时给 ±4 天的高不确定区间；数据充足则按波动收窄/放宽（1~7 天）。
 */
function computeWindowDays(intervals: number[]): number {
  if (intervals.length < 2) return 4;
  const mean = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
  const variance =
    intervals.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) /
    (intervals.length - 1);
  const stddev = Math.sqrt(variance);
  return Math.min(7, Math.max(1, Math.round(stddev)));
}

/** 完整周期模型：状态 + 日历渲染所需的全部区间 */
export function buildCycleModel(cycles: PeriodCycle[], today: string): CycleModel {
  const insight = computePeriodInsight(cycles, today);
  const periodRanges: PeriodRange[] = [];

  for (const c of cycles) {
    periodRanges.push({
      start: c.start_date,
      end: c.end_date ?? addDays(c.start_date, insight.avgPeriodLength - 1),
      predicted: false,
    });
  }
  if (insight.predictedNextStart) {
    periodRanges.push({
      start: insight.predictedNextStart,
      end: addDays(insight.predictedNextStart, insight.avgPeriodLength - 1),
      predicted: true,
    });
  }

  return {
    insight,
    periodRanges,
    ovulationDate: insight.ovulationDate,
    fertileWindow: insight.fertileWindow,
  };
}

export type CalendarPhase = 'period' | 'predicted' | 'ovulation' | 'fertile' | null;

/** 某日期的阶段标记（日历逐格渲染用） */
export function phaseOfDate(date: string, model: CycleModel): CalendarPhase {
  for (const range of model.periodRanges) {
    if (date >= range.start && date <= range.end) {
      return range.predicted ? 'predicted' : 'period';
    }
  }
  if (model.ovulationDate && date === model.ovulationDate) return 'ovulation';
  if (
    model.fertileWindow &&
    date >= model.fertileWindow.start &&
    date <= model.fertileWindow.end
  ) {
    return 'fertile';
  }
  return null;
}

export function usePeriodCalculator(): {
  compute: typeof computePeriodInsight;
  buildModel: typeof buildCycleModel;
  phaseOf: typeof phaseOfDate;
} {
  return { compute: computePeriodInsight, buildModel: buildCycleModel, phaseOf: phaseOfDate };
}
