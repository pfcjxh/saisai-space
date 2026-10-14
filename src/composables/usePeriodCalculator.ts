/**
 * usePeriodCalculator — 生理期推算入口（薄转发层）
 *
 * 算法实体已迁至 `@/utils/periodForecast`（纯函数、可单测、无框架依赖）。
 * 本文件保留原有导出签名，避免既有引用点（CycleView / PeriodStatusCard /
 * PeriodCareCard / TodayView / usePeriod / PeriodCalendarView）大面积改动。
 *
 * 为什么迁走：旧实现在此处内联「加权平均 + 样本标准差」，两个统计学缺陷
 * 会把预测带偏（详见 periodForecast.ts 头部说明）；新引擎改用
 * 稳健中位数 + MAD + 贝叶斯收缩 + 逾期自适应 + 80% 预测区间。
 */
import {
  buildCycleModel,
  computePeriodInsight,
  phaseOfDate,
} from '@/utils/periodForecast';

export type {
  CalendarPhase,
  CycleModel,
  CyclePhase,
  ForecastConfidence,
  PeriodInsight,
  PeriodRange,
} from '@/utils/periodForecast';

export { buildCycleModel, computePeriodInsight, phaseOfDate };

export function usePeriodCalculator(): {
  compute: typeof computePeriodInsight;
  buildModel: typeof buildCycleModel;
  phaseOf: typeof phaseOfDate;
} {
  return { compute: computePeriodInsight, buildModel: buildCycleModel, phaseOf: phaseOfDate };
}
